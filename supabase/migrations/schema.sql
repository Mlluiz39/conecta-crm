-- =====================================================================
-- CRM MULTICANAL COM AGENTES DE IA - Schema Supabase (PostgreSQL)
-- Rodar no SQL Editor do Supabase, em um projeto novo, de uma vez só.
-- Multi-tenant por organization_id, RLS em todas as tabelas.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
create type user_role          as enum ('admin', 'gerente', 'atendente');
create type business_type      as enum ('imobiliaria', 'ecommerce', 'clinica', 'agencia');
create type channel_type       as enum ('whatsapp', 'instagram', 'messenger');
create type agent_role         as enum ('vendedor', 'atendente', 'suporte', 'agendador', 'personalizado');
create type agent_tone         as enum ('formal', 'amigavel', 'consultivo', 'direto');
create type prompt_status      as enum ('draft', 'published', 'archived');
create type conversation_status as enum ('aberta', 'pendente', 'resolvida');
create type message_direction  as enum ('in', 'out');
create type sender_type        as enum ('contact', 'agent_ai', 'user', 'system');
create type field_type         as enum ('text', 'number', 'date', 'select', 'currency');
create type template_category  as enum ('marketing', 'utilidade', 'autenticacao');
create type template_status    as enum ('rascunho', 'pendente', 'aprovado', 'rejeitado');
create type appointment_status as enum ('agendado', 'confirmado', 'realizado', 'cancelado', 'faltou');

-- ---------------------------------------------------------------------
-- 2. ORGANIZAÇÕES E USUÁRIOS
-- ---------------------------------------------------------------------
create table organizations (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  business_type        business_type not null default 'agencia',
  timezone             text not null default 'America/Sao_Paulo',
  business_hours       jsonb not null default '{"seg-sex":{"inicio":"09:00","fim":"18:00"}}',
  out_of_hours_message text default 'Estamos fora do horário de atendimento. Retornaremos assim que possível.',
  distribution_rule    text not null default 'manual' check (distribution_rule in ('manual', 'round_robin')),
  settings             jsonb not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            user_role not null default 'atendente',
  full_name       text,
  avatar_url      text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index on organization_members (user_id);

-- Presets por tipo de negócio (globais, somente leitura para usuários)
create table business_profiles (
  business_type   business_type primary key,
  name            text not null,
  custom_fields   jsonb not null default '[]',
  pipeline_stages jsonb not null default '[]',
  tags            jsonb not null default '[]'
);

-- ---------------------------------------------------------------------
-- 3. FUNÇÕES AUXILIARES DE PERMISSÃO
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members
    where organization_id = org and user_id = auth.uid() and is_active
  );
$$;

create or replace function public.has_org_role(org uuid, roles user_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members
    where organization_id = org and user_id = auth.uid() and is_active and role = any(roles)
  );
$$;

-- ---------------------------------------------------------------------
-- 4. CANAIS (CERNIO)
-- ---------------------------------------------------------------------
create table channels (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  type               channel_type not null,
  name               text not null,
  cernio_channel_id  text,                       -- id do canal na Cernio
  status             text not null default 'desconectado' check (status in ('conectado', 'desconectado', 'erro')),
  config             jsonb not null default '{}', -- NÃO guardar segredos aqui; usar variáveis de ambiente
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, type, cernio_channel_id)
);

-- ---------------------------------------------------------------------
-- 5. CONTATOS, CAMPOS PERSONALIZADOS, ETIQUETAS, SEGMENTOS
-- ---------------------------------------------------------------------
create table custom_field_definitions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  entity          text not null default 'contact' check (entity in ('contact', 'opportunity')),
  key             text not null,
  label           text not null,
  type            field_type not null default 'text',
  options         jsonb not null default '[]',   -- opções para campos "select"
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  unique (organization_id, entity, key)
);

create table contacts (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  name              text not null,
  phone             text,
  email             text,
  instagram_handle  text,
  messenger_psid    text,
  custom_fields     jsonb not null default '{}',  -- valores dos campos personalizados
  owner_id          uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index contacts_org_phone_uq on contacts (organization_id, phone) where phone is not null;
create index contacts_org_idx on contacts (organization_id, created_at desc);
create index contacts_name_trgm on contacts using gin (name gin_trgm_ops);
create index contacts_custom_gin on contacts using gin (custom_fields);

create table tags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  color           text not null default '#6366F1',
  unique (organization_id, name)
);

create table contact_tags (
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id      uuid not null references contacts(id) on delete cascade,
  tag_id          uuid not null references tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

create table saved_segments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  filters         jsonb not null default '{}',
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. PIPELINE
-- ---------------------------------------------------------------------
create table pipeline_stages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  color           text not null default '#6366F1',
  position        int not null default 0,
  is_won          boolean not null default false,
  is_lost         boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create table opportunities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id      uuid not null references contacts(id) on delete cascade,
  stage_id        uuid not null references pipeline_stages(id),
  title           text not null,
  value           numeric(14,2) not null default 0,
  owner_id        uuid references auth.users(id) on delete set null,
  position        int not null default 0,        -- ordem do card dentro da etapa
  lost_reason     text,
  closed_at       timestamptz,
  custom_fields   jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index opportunities_stage_idx on opportunities (organization_id, stage_id, position);
create index opportunities_contact_idx on opportunities (contact_id);

-- ---------------------------------------------------------------------
-- 7. AGENTES DE IA
-- ---------------------------------------------------------------------
create table agents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  role            agent_role not null default 'personalizado',
  tone            agent_tone not null default 'amigavel',
  is_active       boolean not null default true,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table agent_prompt_versions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id        uuid not null references agents(id) on delete cascade,
  version         int not null,
  prompt          text not null,
  status          prompt_status not null default 'draft',
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (agent_id, version)
);
-- no máximo uma versão publicada por agente
create unique index agent_one_published_uq on agent_prompt_versions (agent_id) where status = 'published';

create table agent_channels (
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id        uuid not null references agents(id) on delete cascade,
  channel         channel_type not null,
  is_active       boolean not null default true,
  primary key (agent_id, channel)
);
-- apenas um agente ativo por canal na organização
create unique index agent_channel_active_uq on agent_channels (organization_id, channel) where is_active;

create table agent_tools (
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id        uuid not null references agents(id) on delete cascade,
  tool_key        text not null check (tool_key in
                    ('buscar_informacoes', 'agendar_visita', 'derivar_para_atendente', 'atualizar_contato', 'mover_etapa_funil')),
  enabled         boolean not null default true,
  config          jsonb not null default '{}',
  primary key (agent_id, tool_key)
);

create table agent_handoff_rules (
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id        uuid not null references agents(id) on delete cascade,
  rule_key        text not null check (rule_key in
                    ('cliente_pede_humano', 'sentimento_negativo', 'falhas_seguidas', 'fora_do_horario')),
  enabled         boolean not null default true,
  config          jsonb not null default '{}',   -- ex.: {"limite": 3}
  primary key (agent_id, rule_key)
);

-- Modelos de prompt iniciais. organization_id nulo = modelo global do sistema.
create table agent_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  role            agent_role not null,
  business_type   business_type,                 -- nulo = serve para qualquer nicho
  name            text not null,
  prompt          text not null,
  created_at      timestamptz not null default now()
);

-- Base de conhecimento usada pela ferramenta buscar_informacoes
create table knowledge_base_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title           text not null,
  content         text not null,
  category        text,
  search          tsvector generated always as (
                    to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(content, ''))
                  ) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index knowledge_search_idx on knowledge_base_items using gin (search);

-- ---------------------------------------------------------------------
-- 8. CONVERSAS E MENSAGENS
-- ---------------------------------------------------------------------
create table conversations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  contact_id       uuid not null references contacts(id) on delete cascade,
  channel_id       uuid not null references channels(id) on delete cascade,
  channel_type     channel_type not null,
  external_id      text,                          -- id da conversa na Cernio
  status           conversation_status not null default 'aberta',
  bot_active       boolean not null default true,
  agent_id         uuid references agents(id) on delete set null,   -- agente que está atendendo
  assigned_to      uuid references auth.users(id) on delete set null,
  handoff_reason   text,
  bot_disabled_at  timestamptz,
  last_message_at  timestamptz,
  unread_count     int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (channel_id, external_id)
);
create index conversations_inbox_idx on conversations (organization_id, status, last_message_at desc);
create index conversations_assigned_idx on conversations (organization_id, assigned_to);

create table conversation_tags (
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  tag_id          uuid not null references tags(id) on delete cascade,
  primary key (conversation_id, tag_id)
);

create table conversation_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  author_id       uuid references auth.users(id) on delete set null,
  content         text not null,
  created_at      timestamptz not null default now()
);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction       message_direction not null,
  sender_type     sender_type not null,
  sender_user_id  uuid references auth.users(id) on delete set null,
  agent_id        uuid references agents(id) on delete set null,
  content         text,
  media           jsonb not null default '[]',
  external_id     text,                           -- id da mensagem na Cernio (idempotência)
  status          text not null default 'enviada' check (status in ('pendente', 'enviada', 'entregue', 'lida', 'falhou')),
  created_at      timestamptz not null default now(),
  unique (conversation_id, external_id)
);
create index messages_conv_idx on messages (conversation_id, created_at);

-- Atualiza a conversa a cada nova mensagem
create or replace function public.on_message_insert() returns trigger
language plpgsql as $$
begin
  update conversations
     set last_message_at = new.created_at,
         unread_count = case when new.direction = 'in' then unread_count + 1 else unread_count end,
         updated_at = now()
   where id = new.conversation_id;
  return new;
end $$;
create trigger trg_message_insert after insert on messages
  for each row execute function public.on_message_insert();

-- Log das ferramentas chamadas pelos agentes (alimenta o playground e a auditoria)
create table agent_tool_calls (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id        uuid references agents(id) on delete set null,
  conversation_id uuid references conversations(id) on delete cascade,
  tool_key        text not null,
  input           jsonb,
  output          jsonb,
  error           text,
  created_at      timestamptz not null default now()
);
create index agent_tool_calls_conv_idx on agent_tool_calls (conversation_id, created_at);

-- Idempotência dos webhooks da Cernio (acesso apenas via service role)
create table webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null default 'cernio',
  event_id     text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text,
  unique (provider, event_id)
);

-- ---------------------------------------------------------------------
-- 9. TEMPLATES DE WHATSAPP
-- ---------------------------------------------------------------------
create table whatsapp_templates (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  name              text not null check (name ~ '^[a-z0-9_]+$'),   -- padrão exigido pela Meta
  category          template_category not null default 'utilidade',
  language          text not null default 'pt_BR',
  header            text,
  body              text not null,                -- com variáveis {{1}}, {{2}} ou nomeadas
  footer            text,
  buttons           jsonb not null default '[]',  -- quick reply / link
  variables         jsonb not null default '[]',
  status            template_status not null default 'rascunho',
  meta_template_id  text,
  rejection_reason  text,
  submitted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, name, language)
);

-- ---------------------------------------------------------------------
-- 10. CALENDÁRIO
-- ---------------------------------------------------------------------
create table appointments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  contact_id          uuid not null references contacts(id) on delete cascade,
  opportunity_id      uuid references opportunities(id) on delete set null,
  title               text not null,
  description         text,
  location            text,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  status              appointment_status not null default 'agendado',
  assigned_to         uuid references auth.users(id) on delete set null,
  created_by_user     uuid references auth.users(id) on delete set null,
  created_by_agent_id uuid references agents(id) on delete set null,
  google_event_id     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index appointments_range_idx on appointments (organization_id, starts_at);

create table appointment_reminders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_id  uuid not null references appointments(id) on delete cascade,
  offset_minutes  int not null,                   -- ex.: 1440 (24h) e 60 (1h) antes
  template_id     uuid references whatsapp_templates(id) on delete set null,
  send_at         timestamptz not null,
  sent_at         timestamptz,
  error           text
);
create index reminders_due_idx on appointment_reminders (send_at) where sent_at is null;

-- Tokens do Google: guardar o refresh token no Supabase Vault e referenciar aqui
create table google_calendar_connections (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  google_email     text,
  calendar_id      text not null default 'primary',
  vault_secret_id  uuid,
  sync_token       text,
  created_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- ---------------------------------------------------------------------
-- 11. TRIGGERS DE updated_at
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'channels', 'contacts', 'opportunities', 'agents',
    'knowledge_base_items', 'conversations', 'whatsapp_templates', 'appointments'
  ] loop
    execute format(
      'create trigger trg_%1$s_updated before update on public.%1$I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 12. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
-- 12.1 Tabelas operacionais: qualquer membro da organização lê e escreve
do $$
declare t text;
begin
  foreach t in array array[
    'tags', 'contacts', 'contact_tags', 'saved_segments', 'opportunities',
    'conversations', 'conversation_tags', 'conversation_notes', 'messages',
    'agent_tool_calls', 'appointments', 'appointment_reminders'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_org_member(organization_id))
         with check (public.is_org_member(organization_id))',
      t || '_member_all', t);
  end loop;
end $$;

-- 12.2 Tabelas de configuração: membros leem, admin/gerente escrevem
do $$
declare t text;
begin
  foreach t in array array[
    'channels', 'custom_field_definitions', 'pipeline_stages', 'agents',
    'agent_prompt_versions', 'agent_channels', 'agent_tools', 'agent_handoff_rules',
    'knowledge_base_items', 'whatsapp_templates'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.is_org_member(organization_id))', t || '_select', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.has_org_role(organization_id, array[''admin'',''gerente'']::user_role[]))
         with check (public.has_org_role(organization_id, array[''admin'',''gerente'']::user_role[]))',
      t || '_manage', t);
  end loop;
end $$;

-- 12.3 Casos específicos
alter table organizations enable row level security;
create policy organizations_select on organizations for select to authenticated
  using (public.is_org_member(id));
create policy organizations_update on organizations for update to authenticated
  using (public.has_org_role(id, array['admin']::user_role[]))
  with check (public.has_org_role(id, array['admin']::user_role[]));

alter table organization_members enable row level security;
create policy members_select on organization_members for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id));
create policy members_manage on organization_members for all to authenticated
  using (public.has_org_role(organization_id, array['admin']::user_role[]))
  with check (public.has_org_role(organization_id, array['admin']::user_role[]));

alter table business_profiles enable row level security;
create policy business_profiles_read on business_profiles for select to authenticated using (true);

alter table agent_templates enable row level security;
create policy agent_templates_select on agent_templates for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));
create policy agent_templates_manage on agent_templates for all to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['admin','gerente']::user_role[]))
  with check (organization_id is not null and public.has_org_role(organization_id, array['admin','gerente']::user_role[]));

alter table google_calendar_connections enable row level security;
create policy gcal_own on google_calendar_connections for all to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

-- webhook_events: RLS ligado e sem policies = só a service role acessa
alter table webhook_events enable row level security;

-- ---------------------------------------------------------------------
-- 13. FUNÇÕES DE NEGÓCIO
-- ---------------------------------------------------------------------

-- Publica uma versão de prompt e arquiva a anterior
create or replace function public.publish_agent_version(p_version_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v agent_prompt_versions;
begin
  select * into v from agent_prompt_versions where id = p_version_id;
  if v.id is null then raise exception 'versão não encontrada'; end if;
  if auth.uid() is not null and not has_org_role(v.organization_id, array['admin','gerente']::user_role[]) then
    raise exception 'sem permissão';
  end if;
  update agent_prompt_versions set status = 'archived'
   where agent_id = v.agent_id and status = 'published';
  update agent_prompt_versions set status = 'published' where id = p_version_id;
end $$;

-- Aplica o preset do tipo de negócio: etapas, campos, etiquetas e agentes iniciais
create or replace function public.apply_business_profile(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_type    business_type;
  v_profile business_profiles;
  v_role    agent_role;
  v_tpl     agent_templates;
  v_agent   uuid;
  v_tool    text;
  v_rule    text;
begin
  if auth.uid() is not null and not has_org_role(p_org, array['admin']::user_role[]) then
    raise exception 'sem permissão';
  end if;

  select business_type into v_type from organizations where id = p_org;
  select * into v_profile from business_profiles where business_type = v_type;

  insert into pipeline_stages (organization_id, name, color, position, is_won, is_lost)
  select p_org, s->>'name', coalesce(s->>'color', '#6366F1'), (ord - 1)::int,
         coalesce((s->>'is_won')::boolean, false), coalesce((s->>'is_lost')::boolean, false)
    from jsonb_array_elements(v_profile.pipeline_stages) with ordinality as t(s, ord)
  on conflict (organization_id, name) do nothing;

  insert into custom_field_definitions (organization_id, entity, key, label, type, options, position)
  select p_org, 'contact', s->>'key', s->>'label', (s->>'type')::field_type,
         coalesce(s->'options', '[]'::jsonb), (ord - 1)::int
    from jsonb_array_elements(v_profile.custom_fields) with ordinality as t(s, ord)
  on conflict (organization_id, entity, key) do nothing;

  insert into tags (organization_id, name, color)
  select p_org, s->>'name', coalesce(s->>'color', '#6366F1')
    from jsonb_array_elements(v_profile.tags) as t(s)
  on conflict (organization_id, name) do nothing;

  -- Agentes iniciais: Vendedor e Atendente (modelo do nicho, ou genérico se não houver)
  foreach v_role in array array['vendedor', 'atendente']::agent_role[] loop
    select * into v_tpl from agent_templates
     where organization_id is null and role = v_role
       and (business_type = v_type or business_type is null)
     order by (business_type is null) asc
     limit 1;
    continue when v_tpl.id is null;

    insert into agents (organization_id, name, role, tone, created_by)
    values (p_org, initcap(v_role::text), v_role,
            case v_role when 'vendedor' then 'consultivo'::agent_tone else 'amigavel'::agent_tone end,
            auth.uid())
    returning id into v_agent;

    insert into agent_prompt_versions (organization_id, agent_id, version, prompt, status, created_by)
    values (p_org, v_agent, 1, v_tpl.prompt, 'published', auth.uid());

    foreach v_tool in array array['buscar_informacoes', 'agendar_visita', 'derivar_para_atendente',
                                  'atualizar_contato', 'mover_etapa_funil'] loop
      insert into agent_tools (organization_id, agent_id, tool_key) values (p_org, v_agent, v_tool);
    end loop;

    foreach v_rule in array array['cliente_pede_humano', 'sentimento_negativo',
                                  'falhas_seguidas', 'fora_do_horario'] loop
      insert into agent_handoff_rules (organization_id, agent_id, rule_key, config)
      values (p_org, v_agent, v_rule,
              case when v_rule = 'falhas_seguidas' then '{"limite": 3}'::jsonb else '{}'::jsonb end);
    end loop;
  end loop;
end $$;

-- Cria organização + vincula o usuário como admin + aplica o preset
-- Uso no app: supabase.rpc('create_organization', { p_name: 'Minha Empresa', p_type: 'clinica' })
create or replace function public.create_organization(p_name text, p_type business_type) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  insert into organizations (name, business_type) values (p_name, p_type) returning id into v_org;
  insert into organization_members (organization_id, user_id, role) values (v_org, auth.uid(), 'admin');
  perform apply_business_profile(v_org);
  return v_org;
end $$;

-- ---------------------------------------------------------------------
-- 14. VIEWS DE RELATÓRIOS (respeitam a RLS de quem consulta)
-- ---------------------------------------------------------------------
-- Obs.: simplificação: receita e conversão agrupadas pelo mês de criação da oportunidade.
create view v_monthly_metrics with (security_invoker = true) as
select o.organization_id,
       date_trunc('month', o.created_at)                             as mes,
       count(*)                                                      as leads_novos,
       count(*) filter (where s.is_won)                              as ganhos,
       coalesce(sum(o.value) filter (where s.is_won), 0)             as receita,
       round(100.0 * count(*) filter (where s.is_won) / nullif(count(*), 0), 1) as taxa_conversao
  from opportunities o
  join pipeline_stages s on s.id = o.stage_id
 group by 1, 2;

create view v_agent_performance with (security_invoker = true) as
select m.organization_id,
       m.user_id,
       m.full_name,
       (select count(*) from conversations c
         where c.organization_id = m.organization_id and c.assigned_to = m.user_id)  as conversas_atendidas,
       (select count(*) from opportunities o join pipeline_stages s on s.id = o.stage_id
         where o.organization_id = m.organization_id and o.owner_id = m.user_id and s.is_won) as leads_convertidos,
       (select coalesce(sum(o.value), 0) from opportunities o join pipeline_stages s on s.id = o.stage_id
         where o.organization_id = m.organization_id and o.owner_id = m.user_id and s.is_won) as receita_gerada
  from organization_members m;

-- ---------------------------------------------------------------------
-- 15. REALTIME
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.conversations, public.messages;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 16. SEEDS: PRESETS POR TIPO DE NEGÓCIO
-- ---------------------------------------------------------------------
insert into business_profiles (business_type, name, custom_fields, pipeline_stages, tags) values
('imobiliaria', 'Imobiliária',
 '[{"key":"finalidade","label":"Finalidade","type":"select","options":["Compra","Aluguel"]},
   {"key":"tipo_imovel","label":"Tipo de imóvel","type":"select","options":["Apartamento","Casa","Terreno","Comercial"]},
   {"key":"bairro","label":"Bairro de interesse","type":"text"},
   {"key":"quartos","label":"Quartos","type":"number"},
   {"key":"faixa_orcamento","label":"Orçamento máximo","type":"currency"}]',
 '[{"name":"Novo lead","color":"#6366F1"},{"name":"Qualificado","color":"#0EA5E9"},
   {"name":"Visita agendada","color":"#F59E0B"},{"name":"Proposta","color":"#8B5CF6"},
   {"name":"Fechado","color":"#10B981","is_won":true},{"name":"Perdido","color":"#EF4444","is_lost":true}]',
 '[{"name":"Compra","color":"#6366F1"},{"name":"Aluguel","color":"#0EA5E9"},{"name":"Investidor","color":"#F59E0B"}]'),

('ecommerce', 'E-commerce',
 '[{"key":"produto_interesse","label":"Produto de interesse","type":"text"},
   {"key":"ultimo_pedido","label":"Último pedido","type":"date"},
   {"key":"ticket_medio","label":"Ticket médio","type":"currency"},
   {"key":"cupom","label":"Cupom utilizado","type":"text"}]',
 '[{"name":"Novo contato","color":"#6366F1"},{"name":"Carrinho abandonado","color":"#F59E0B"},
   {"name":"Negociação","color":"#8B5CF6"},{"name":"Pedido realizado","color":"#10B981","is_won":true},
   {"name":"Perdido","color":"#EF4444","is_lost":true}]',
 '[{"name":"Cliente recorrente","color":"#10B981"},{"name":"Atacado","color":"#6366F1"},{"name":"Troca/Devolução","color":"#EF4444"}]'),

('clinica', 'Clínica',
 '[{"key":"especialidade","label":"Especialidade","type":"select","options":["Clínico geral","Dermatologia","Odontologia","Psicologia","Outra"]},
   {"key":"convenio","label":"Convênio","type":"text"},
   {"key":"data_nascimento","label":"Data de nascimento","type":"date"},
   {"key":"primeira_consulta","label":"Primeira consulta?","type":"select","options":["Sim","Não"]}]',
 '[{"name":"Novo contato","color":"#6366F1"},{"name":"Triagem","color":"#0EA5E9"},
   {"name":"Consulta agendada","color":"#F59E0B"},{"name":"Atendido","color":"#10B981","is_won":true},
   {"name":"Perdido","color":"#EF4444","is_lost":true}]',
 '[{"name":"Particular","color":"#6366F1"},{"name":"Convênio","color":"#0EA5E9"},{"name":"Retorno","color":"#10B981"}]'),

('agencia', 'Agência',
 '[{"key":"empresa","label":"Empresa","type":"text"},
   {"key":"segmento","label":"Segmento","type":"text"},
   {"key":"servico_interesse","label":"Serviço de interesse","type":"select","options":["Social media","Tráfego pago","Site","Branding","Outro"]},
   {"key":"orcamento_mensal","label":"Orçamento mensal","type":"currency"}]',
 '[{"name":"Novo lead","color":"#6366F1"},{"name":"Diagnóstico","color":"#0EA5E9"},
   {"name":"Proposta enviada","color":"#8B5CF6"},{"name":"Negociação","color":"#F59E0B"},
   {"name":"Contrato fechado","color":"#10B981","is_won":true},{"name":"Perdido","color":"#EF4444","is_lost":true}]',
 '[{"name":"Indicação","color":"#10B981"},{"name":"Tráfego pago","color":"#6366F1"},{"name":"Recorrente","color":"#F59E0B"}]');

-- ---------------------------------------------------------------------
-- 17. SEEDS: MODELOS DE PROMPT DOS AGENTES
-- Genéricos (business_type nulo) + dois exemplos específicos de nicho.
-- Adicione os demais nichos com novos INSERTs na mesma tabela.
-- ---------------------------------------------------------------------
insert into agent_templates (organization_id, role, business_type, name, prompt) values
(null, 'vendedor', null, 'Vendedor padrão', $p$Você é {{nome_agente}}, consultor(a) de vendas da {{nome_empresa}}. Você conversa com potenciais clientes pelo {{canal}} em português do Brasil, com tom amigável, consultivo e objetivo.

OBJETIVO
Entender a necessidade do cliente, qualificar o lead e conduzir até o próximo passo: uma visita, reunião ou proposta agendada.

COMO CONDUZIR A CONVERSA
1. Cumprimente {{nome_contato}} pelo nome e pergunte como pode ajudar.
2. Faça uma pergunta por vez para entender: o que procura, para quando, orçamento aproximado e quem decide.
3. Use buscar_informacoes para responder sobre produtos, serviços, preços e condições. Nunca invente informações.
4. Apresente apenas as opções que fazem sentido para o que o cliente disse, destacando benefícios.
5. Quando houver interesse, ofereça agendar uma visita ou reunião e use agendar_visita com data e horário confirmados.
6. Registre o que descobrir com atualizar_contato e avance o lead com mover_etapa_funil.

OBJEÇÕES
- Preço: reconheça a preocupação, reforce o valor e ofereça alternativas disponíveis.
- "Vou pensar": pergunte qual dúvida ainda existe e proponha um próximo contato com data.
- Nunca pressione nem use urgência falsa.

REGRAS
- Mensagens curtas (no máximo 3 parágrafos).
- Não prometa descontos, prazos ou condições que não estejam na base de conhecimento.
- Não peça dados sensíveis (cartão, senhas).
- Atendimento humano: {{horario_atendimento}}.

QUANDO PASSAR PARA UM HUMANO (derivar_para_atendente)
- O cliente pedir para falar com uma pessoa.
- Reclamação, irritação ou assunto jurídico.
- Negociação fora das condições padrão.
- Você não souber responder após consultar a base duas vezes.
Ao derivar, avise o cliente de forma gentil e resuma o contexto para o atendente.$p$),

(null, 'atendente', null, 'Atendente padrão', $p$Você é {{nome_agente}}, assistente de atendimento da {{nome_empresa}}. Você atende clientes pelo {{canal}} em português do Brasil, com tom cordial, claro e paciente.

OBJETIVO
Resolver dúvidas e pedidos do cliente na primeira interação sempre que possível, com informações corretas e rápidas.

COMO ATENDER
1. Cumprimente {{nome_contato}} pelo nome e identifique o motivo do contato.
2. Use buscar_informacoes antes de responder qualquer dúvida sobre horários, endereço, serviços, prazos, preços ou políticas.
3. Responda de forma direta, em linguagem simples, e confirme se a dúvida foi resolvida.
4. Se o cliente precisar marcar ou remarcar um horário, use agendar_visita.
5. Atualize os dados do cliente com atualizar_contato quando ele informar telefone, e-mail ou outras informações novas.

REGRAS
- Se a informação não estiver na base de conhecimento, diga que vai confirmar com a equipe. Nunca invente.
- Mensagens curtas e organizadas.
- Não faça diagnósticos, aconselhamento jurídico ou promessas de reembolso.
- Não peça dados sensíveis (cartão, senhas).
- Horário de atendimento humano: {{horario_atendimento}}. Fora dele, informe quando a equipe retorna.

QUANDO PASSAR PARA UM HUMANO (derivar_para_atendente)
- O cliente pedir um atendente.
- Reclamação, cancelamento, cobrança ou problema que você não consegue resolver.
- Cliente insatisfeito ou com tom negativo.
- Três tentativas seguidas sem resolver a dúvida.
Ao derivar, explique o motivo e deixe o contexto resumido para o atendente.$p$),

(null, 'vendedor', 'imobiliaria', 'Vendedor de imobiliária', $p$Você é {{nome_agente}}, corretor(a) virtual da {{nome_empresa}}. Atende pelo {{canal}} em português do Brasil, com tom amigável e consultivo.

OBJETIVO
Descobrir o perfil do cliente e agendar uma visita a imóveis compatíveis.

COMO CONDUZIR
1. Cumprimente {{nome_contato}} e pergunte se busca compra ou aluguel.
2. Descubra, uma pergunta por vez: bairro ou região, tipo de imóvel, número de quartos e vagas, orçamento e prazo para mudança.
3. Se for compra, pergunte se pretende usar financiamento ou FGTS.
4. Use buscar_informacoes para sugerir imóveis do catálogo que combinem com o perfil. Nunca invente imóveis, preços ou condições.
5. Ofereça visita e use agendar_visita com data e horário confirmados.
6. Salve as preferências com atualizar_contato e avance o lead com mover_etapa_funil.

REGRAS
- Mensagens curtas, com no máximo 3 imóveis por resposta.
- Não negocie valores nem prometa aprovação de financiamento.
- Atendimento humano: {{horario_atendimento}}.
- Use derivar_para_atendente quando o cliente pedir uma pessoa, quiser negociar valores ou tiver dúvida jurídica/contratual.$p$),

(null, 'atendente', 'clinica', 'Atendente de clínica', $p$Você é {{nome_agente}}, assistente virtual da {{nome_empresa}}. Atende pelo {{canal}} em português do Brasil, com tom acolhedor, claro e respeitoso.

OBJETIVO
Informar sobre a clínica e agendar, remarcar ou cancelar consultas.

COMO ATENDER
1. Cumprimente {{nome_contato}} e pergunte como pode ajudar.
2. Para agendar, descubra: especialidade ou procedimento, se é primeira consulta, convênio ou particular e período de preferência.
3. Use buscar_informacoes para responder sobre especialidades, profissionais, convênios aceitos, valores e endereço.
4. Confirme data e horário com o cliente e use agendar_visita.
5. Atualize cadastro com atualizar_contato (convênio, data de nascimento etc.).

REGRAS
- Nunca dê diagnóstico, interprete exames ou oriente tratamento ou medicação.
- Em caso de urgência ou sintomas graves, oriente procurar atendimento de emergência imediatamente.
- Trate dados de saúde com discrição e não peça dados de pagamento pelo chat.
- Atendimento humano: {{horario_atendimento}}.
- Use derivar_para_atendente quando o cliente pedir uma pessoa, reclamar, tratar de cobrança ou convênio específico ou após três tentativas sem resolver.$p$);

-- ---------------------------------------------------------------------
-- 18. USUÁRIO ADMIN E ORGANIZAÇÃO INICIAL (LOGIN IMEDIATO)
-- E-mail: admin@conectacrm.com.br / Senha: TROCAR-ESTA-SENHA
-- ---------------------------------------------------------------------
do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_org_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_email   text := 'admin@conectacrm.com.br';
  v_senha   text := 'TROCAR-ESTA-SENHA';
  v_nome    text := 'Administrador';
  v_tipo    business_type := 'agencia';
  v_empresa text := 'Minha Empresa';
begin
  -- 1. Cria usuário no Supabase Auth se ainda não existir
  if not exists (select 1 from auth.users where email = v_email) then
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_senha, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', v_nome),
      now(),
      now()
    );
  else
    select id into v_user_id from auth.users where email = v_email;
  end if;

  -- 2. Cria organização inicial
  insert into organizations (id, name, business_type)
  values (v_org_id, v_empresa, v_tipo)
  on conflict (id) do update set business_type = v_tipo;

  -- 3. Vincula o usuário como admin da organização
  insert into organization_members (organization_id, user_id, role, full_name, is_active)
  values (v_org_id, v_user_id, 'admin', v_nome, true)
  on conflict (organization_id, user_id) do update set role = 'admin', is_active = true;

  -- 4. Aplica preset de negócio (etapas do funil, tags, campos e agentes)
  perform apply_business_profile(v_org_id);
end $$;
