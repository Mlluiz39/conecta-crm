-- ════════════════════════════════════════════════════════════════════
-- Agentes de IA
-- ════════════════════════════════════════════════════════════════════
create table agents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  role            agent_role not null default 'personalizado',
  tone            text[] not null default '{}',   -- formal|amigavel|consultivo|direto...
  avatar_icon     text,
  color           text,
  is_active       boolean not null default false,
  created_by      uuid references profiles(id) on delete set null,
  settings        jsonb not null default '{}',    -- {model, temperature, max_tokens}
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index agents_org_active_idx on agents (organization_id, is_active);

-- No máximo 1 published e 1 draft por agente (índices parciais).
create table agent_prompt_versions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id        uuid not null references agents(id) on delete cascade,
  version         int not null,
  prompt          text not null,
  status          prompt_status not null default 'draft',
  change_summary  text,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  published_at    timestamptz,
  unique (agent_id, version)
);
create unique index agent_prompt_one_published
  on agent_prompt_versions (agent_id) where status = 'published';
create unique index agent_prompt_one_draft
  on agent_prompt_versions (agent_id) where status = 'draft';

-- REGRA CENTRAL: no máximo 1 agente ativo por (org, canal).
create table agent_channels (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  agent_id            uuid not null references agents(id) on delete cascade,
  channel             channel_type not null,
  is_active           boolean not null default true,
  external_account_id text,                       -- phone_number_id / page_id no provider
  config              jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  unique (agent_id, channel)
);
create unique index agent_channels_one_active_per_channel
  on agent_channels (organization_id, channel) where is_active;
create index agent_channels_resolve
  on agent_channels (organization_id, channel, is_active);

create table agent_tools (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id        uuid not null references agents(id) on delete cascade,
  tool_key        agent_tool_key not null,
  enabled         boolean not null default false,
  config          jsonb not null default '{}',
  unique (agent_id, tool_key)
);

create table agent_handoff_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id        uuid not null references agents(id) on delete cascade,
  rule_key        handoff_rule_key not null,
  enabled         boolean not null default false,
  config          jsonb not null default '{}',   -- {limite:3}, {palavras:[...]}, etc.
  unique (agent_id, rule_key)
);

-- Modelos iniciais por função/nicho. organization_id null = template global.
create table agent_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  role            agent_role not null,
  business_type   business_type not null,
  name            text not null,
  description     text,
  prompt          text not null,
  default_tools   jsonb not null default '[]',
  default_rules   jsonb not null default '[]',
  created_at      timestamptz not null default now()
);
create index agent_templates_lookup_idx on agent_templates (business_type, role);

-- ════════════════════════════════════════════════════════════════════
-- Conversas, mensagens e idempotência
-- ════════════════════════════════════════════════════════════════════
create table conversations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  contact_id         uuid not null references contacts(id) on delete cascade,
  channel            channel_type not null,
  agent_id           uuid references agents(id) on delete set null,    -- agente ATENDENDO
  assigned_to        uuid references profiles(id) on delete set null,  -- atendente humano
  bot_active         boolean not null default true,
  status             conversation_status not null default 'aberta',
  external_thread_id text,
  last_message_at    timestamptz,
  last_inbound_at    timestamptz,
  unread_count       int not null default 0,
  handoff_at         timestamptz,
  handoff_reason     handoff_rule_key,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, contact_id, channel)
);
create index conversations_org_status_idx
  on conversations (organization_id, status, last_message_at desc);
create index conversations_org_assigned_idx on conversations (organization_id, assigned_to);

create table conversation_tags (
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  tag_id          uuid not null references tags(id) on delete cascade,
  primary key (conversation_id, tag_id)
);

create table messages (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  conversation_id    uuid not null references conversations(id) on delete cascade,
  direction          msg_direction not null,
  sender_type        msg_sender_type not null,
  sender_profile_id  uuid references profiles(id) on delete set null,
  sender_agent_id    uuid references agents(id) on delete set null,
  kind               msg_kind not null default 'text',
  body               text,
  media_url          text,
  media_mime         text,
  external_message_id text,               -- id do provider (dedup)
  reply_to_id        uuid references messages(id) on delete set null,
  template_id        uuid,                -- ref whatsapp_templates quando kind=template
  status             msg_status not null default 'queued',
  error_code         text,
  error_message      text,
  ai_generated       boolean not null default false,
  ai_run_id          uuid,
  created_at         timestamptz not null default now()
);
create index messages_conv_idx on messages (conversation_id, created_at desc);
-- dedup de mensagem inbound (idempotência de 2º nível)
create unique index messages_external_uq
  on messages (organization_id, external_message_id)
  where external_message_id is not null;

-- LOG DE WEBHOOK + IDEMPOTÊNCIA (1º nível)
create table webhook_events (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid references organizations(id) on delete set null,
  provider          text not null,          -- 'cernio'
  event_type        text,
  external_event_id text not null,
  signature_valid   boolean not null default false,
  payload           jsonb not null,
  status            webhook_status not null default 'received',
  error             text,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  unique (provider, external_event_id)      -- dedup idempotente
);
create index webhook_events_org_idx on webhook_events (organization_id, received_at desc);

-- Fila de saída (envio assíncrono + retry; desacopla do provider).
create table message_outbox (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  payload         jsonb not null,
  status          text not null default 'pending',  -- pending|sending|sent|failed
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now()
);
create index message_outbox_due_idx on message_outbox (next_attempt_at) where status = 'pending';
