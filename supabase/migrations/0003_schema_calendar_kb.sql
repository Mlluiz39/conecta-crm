-- ════════════════════════════════════════════════════════════════════
-- Agenda e lembretes
-- ════════════════════════════════════════════════════════════════════
create table appointments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  contact_id        uuid references contacts(id) on delete set null,
  opportunity_id    uuid references opportunities(id) on delete set null,
  assigned_to       uuid references profiles(id) on delete set null,
  agent_id          uuid references agents(id) on delete set null,
  title             text not null,
  description       text,
  type              appointment_type not null default 'demo',
  channel           appointment_channel not null default 'presencial',
  location          text,
  meet_link         text,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  timezone          text not null default 'America/Sao_Paulo',
  status            appointment_status not null default 'pendente',
  value             numeric(14,2),
  google_event_id   text,
  google_calendar_id text,
  sync_status       sync_status not null default 'not_applicable',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index appointments_org_start_idx on appointments (organization_id, starts_at);
create unique index appointments_google_uq
  on appointments (organization_id, google_event_id) where google_event_id is not null;

-- ════════════════════════════════════════════════════════════════════
-- Templates WhatsApp (HSM)
-- ════════════════════════════════════════════════════════════════════
create table whatsapp_templates (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  name                 text not null,
  category             template_category not null,
  language             text not null default 'pt_BR',
  header_type          text not null default 'none',  -- none|text|image|document|video
  header_text          text,
  header_media_url     text,
  body                 text not null,
  footer               text,
  buttons              jsonb not null default '[]',
  variables            jsonb not null default '[]',
  status               template_status not null default 'PENDENTE',
  rejection_reason     text,
  external_template_id text,
  submitted_at         timestamptz,
  approved_at          timestamptz,
  metrics              jsonb not null default '{"sent":0,"readRate":0}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organization_id, name, language)
);

-- Regras de lembrete por org (24h, 1h, follow-up).
create table reminder_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  offset_minutes  int not null,           -- -1440=24h antes, -60=1h antes, +1440=follow-up
  channel         channel_type not null default 'whatsapp',
  template_id     uuid references whatsapp_templates(id) on delete set null,
  applies_to      appointment_type,       -- null = todos
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Lembretes materializados por agendamento.
create table appointment_reminders (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  appointment_id   uuid not null references appointments(id) on delete cascade,
  reminder_rule_id uuid not null references reminder_rules(id) on delete cascade,
  scheduled_at     timestamptz not null,
  status           reminder_status not null default 'pending',
  sent_at          timestamptz,
  message_id       uuid references messages(id) on delete set null,
  error            text,
  unique (appointment_id, reminder_rule_id)
);
create index appointment_reminders_due_idx
  on appointment_reminders (scheduled_at) where status = 'pending';

-- ════════════════════════════════════════════════════════════════════
-- Base de conhecimento (tool buscar_informacoes)
-- FTS Postgres nativo; pgvector só quando qualidade exigir.
-- ════════════════════════════════════════════════════════════════════
create table kb_collections (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  description     text,
  created_at      timestamptz not null default now()
);

create table kb_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  collection_id   uuid references kb_collections(id) on delete set null,
  title           text not null,
  content         text not null,
  source_url      text,
  metadata        jsonb not null default '{}',
  status          text not null default 'ready',
  fts             tsvector generated always as
                    (to_tsvector('portuguese', coalesce(title,'') || ' ' || coalesce(content,''))) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index kb_documents_fts_idx on kb_documents using gin (fts);

-- ════════════════════════════════════════════════════════════════════
-- Campos customizados e presets de negócio
-- ════════════════════════════════════════════════════════════════════
create table custom_field_defs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  entity          text not null default 'contact',   -- contact|opportunity
  key             text not null,
  name            text not null,
  type            custom_field_type not null default 'text',
  options         jsonb,
  required        boolean not null default false,
  placeholder     text,
  position        int not null default 0,
  is_active       boolean not null default true,
  unique (organization_id, entity, key)
);

-- Presets imutáveis (seed). config = {custom_fields[], pipeline_stages[],
-- tags[], starter_prompts{}, agent_seeds[]}
create table business_presets (
  business_type business_type primary key,
  name          text not null,
  description   text,
  icon          text,
  config        jsonb not null default '{}'
);

-- ════════════════════════════════════════════════════════════════════
-- Observabilidade das execuções de IA
-- ════════════════════════════════════════════════════════════════════
create table ai_runs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  agent_id          uuid references agents(id) on delete set null,
  prompt_version_id uuid references agent_prompt_versions(id) on delete set null,
  conversation_id   uuid references conversations(id) on delete set null,
  trigger           text not null default 'webhook',  -- webhook|playground
  input             jsonb,
  output            text,
  tools_called      jsonb not null default '[]',
  tokens_in         int,
  tokens_out        int,
  latency_ms        int,
  stop_reason       text,
  error             text,
  created_at        timestamptz not null default now()
);
create index ai_runs_agent_idx on ai_runs (organization_id, agent_id, created_at desc);

-- ── Triggers updated_at ─────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','integrations','contacts','pipeline_stages',
    'opportunities','agents','appointments','whatsapp_templates','kb_documents'
  ] loop
    execute format(
      'create trigger set_updated_at before update on %I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
