-- ════════════════════════════════════════════════════════════════════
-- ConectaCRM — Schema base
-- Convenções: PK uuid; toda tabela de negócio tem organization_id;
-- dinheiro numeric(14,2); enums como tipos Postgres; timestamps UTC.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- busca por nome

-- ── Enums ───────────────────────────────────────────────────────────
create type user_role           as enum ('admin','gerente','atendente');
create type business_type       as enum ('imobiliaria','ecommerce','clinica','agencia','outro');
create type channel_type        as enum ('whatsapp','instagram','messenger','web','email','telefone');
create type agent_role          as enum ('vendedor','atendente','suporte','agendador','personalizado');
create type prompt_status       as enum ('draft','published','archived');
create type agent_tool_key      as enum ('buscar_informacoes','agendar_visita','derivar_para_atendente','atualizar_contato','mover_etapa_funil');
create type handoff_rule_key    as enum ('cliente_pede_humano','sentimento_negativo','3_falhas_seguidas','fora_do_horario');
create type conversation_status as enum ('aberta','pendente','resolvida');
create type msg_direction       as enum ('inbound','outbound');
create type msg_sender_type     as enum ('contact','agent','user','system');
create type msg_kind            as enum ('text','image','audio','video','document','sticker','location','template','interactive','system');
create type msg_status          as enum ('queued','sent','delivered','read','failed');
create type opportunity_status  as enum ('open','won','lost');
create type priority_level      as enum ('alta','media','baixa');
create type appointment_type    as enum ('demo','presencial','followup','onboarding','fechamento','consulta');
create type appointment_channel as enum ('meet','whatsapp','presencial','phone');
create type appointment_status  as enum ('confirmada','pendente','cancelada','concluida','no_show');
create type sync_status         as enum ('pending','synced','failed','not_applicable');
create type reminder_status     as enum ('pending','sent','failed','cancelled');
create type template_category   as enum ('MARKETING','UTILIDADE','AUTENTICACAO');
create type template_status     as enum ('APROVADO','PENDENTE','REJEITADO','PAUSADO','DESABILITADO');
create type custom_field_type   as enum ('text','number','date','select','currency');
create type webhook_status      as enum ('received','processed','ignored','failed');
create type integration_provider as enum ('cernio','google_calendar','meta_cloud');

-- ── Trigger genérico updated_at ─────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- Tenancy e identidade
-- ════════════════════════════════════════════════════════════════════
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  business_type business_type not null default 'outro',
  timezone      text not null default 'America/Sao_Paulo',
  locale        text not null default 'pt-BR',
  settings      jsonb not null default '{}',   -- horario_atendimento, branding...
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- profiles espelha auth.users 1:1. Single-org hoje; multi-org futuro =
-- organization_members (aditivo) e current_org_id() lendo membership ativa.
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete restrict,
  role            user_role not null default 'atendente',
  full_name       text not null default '',
  email           text,
  phone           text,
  avatar_url      text,
  is_active       boolean not null default true,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index profiles_org_idx on profiles (organization_id);

create table integrations (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  provider            integration_provider not null,
  status              text not null default 'disconnected',
  external_account_id text,
  credentials         jsonb not null default '{}',  -- OAuth tokens (cifrar!)
  scopes              text[],
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, provider)
);

-- ════════════════════════════════════════════════════════════════════
-- Contatos e tags
-- ════════════════════════════════════════════════════════════════════
create table contacts (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  name                text not null,
  phone               text,                      -- E.164
  email               text,
  company             text,
  job_title           text,
  document            text,                      -- CPF/CNPJ
  address             text,
  city                text,
  state               text,
  country             text not null default 'BR',
  avatar_url          text,
  origin_channel      channel_type,
  custom_fields       jsonb not null default '{}',
  owner_id            uuid references profiles(id) on delete set null,
  is_verified         boolean not null default false,
  last_interaction_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create unique index contacts_phone_uq on contacts (organization_id, phone)
  where deleted_at is null and phone is not null;
create index contacts_org_owner_idx on contacts (organization_id, owner_id);
create index contacts_custom_gin on contacts using gin (custom_fields jsonb_path_ops);
create index contacts_name_trgm on contacts using gin (name gin_trgm_ops);

create table tags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  color           text not null default '#6366f1',
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create table contact_tags (
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id      uuid not null references contacts(id) on delete cascade,
  tag_id          uuid not null references tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

-- Timeline unificada de interações (mensagens, ligações, notas, mudanças).
create table activities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id      uuid references contacts(id) on delete cascade,
  opportunity_id  uuid,
  conversation_id uuid,
  type            text not null,     -- message|call|email|meeting|note|stage_change|system
  title           text,
  body            text,
  metadata        jsonb not null default '{}',
  actor_id        uuid references profiles(id) on delete set null,
  actor_type      msg_sender_type not null default 'system',
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index activities_org_contact_idx
  on activities (organization_id, contact_id, occurred_at desc);

-- ════════════════════════════════════════════════════════════════════
-- Pipeline
-- ════════════════════════════════════════════════════════════════════
-- position numeric com gaps → reorder dnd sem colisão de unique.
create table pipeline_stages (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references organizations(id) on delete cascade,
  name                   text not null,
  color                  text not null default '#4f46e5',
  position               numeric not null,
  target_conversion_rate numeric(5,2),
  is_won                 boolean not null default false,
  is_lost                boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index pipeline_stages_org_pos on pipeline_stages (organization_id, position);
create unique index pipeline_stages_won_uq  on pipeline_stages (organization_id) where is_won;
create unique index pipeline_stages_lost_uq on pipeline_stages (organization_id) where is_lost;

create table loss_reasons (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  is_active       boolean not null default true,
  unique (organization_id, name)
);

create table opportunities (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  contact_id        uuid not null references contacts(id) on delete cascade,
  pipeline_stage_id uuid not null references pipeline_stages(id),
  title             text,
  value             numeric(14,2) not null default 0,
  currency          text not null default 'BRL',
  probability       int not null default 0 check (probability between 0 and 100),
  status            opportunity_status not null default 'open',
  priority          priority_level not null default 'media',
  origin_channel    channel_type,
  owner_id          uuid references profiles(id) on delete set null,
  expected_close_date date,
  next_action       text,
  lost_reason_id    uuid references loss_reasons(id) on delete set null,
  lost_notes        text,
  won_at            timestamptz,
  lost_at           timestamptz,
  last_activity_at  timestamptz not null default now(),
  custom_fields     jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index opportunities_org_stage_idx
  on opportunities (organization_id, pipeline_stage_id) where deleted_at is null;
create index opportunities_org_owner_idx on opportunities (organization_id, owner_id);
create index opportunities_org_status_idx on opportunities (organization_id, status);
