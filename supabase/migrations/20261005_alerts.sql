-- Alertas em tempo real (lead contatado / respondeu / quer fechar / marcou call).
-- O detector grava aqui de forma idempotente (dedupe_key) e o notificador
-- envia para o Telegram (e marca notified_at).

create table if not exists alerts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  type             text not null,          -- lead_contatado | lead_respondeu | quer_fechar | call_marcada
  contact_id       uuid references contacts(id) on delete cascade,
  conversation_id  uuid references conversations(id) on delete cascade,
  message_id       uuid references messages(id) on delete cascade,
  appointment_id   uuid references appointments(id) on delete cascade,
  dedupe_key       text not null,
  title            text not null,
  body             text,
  payload          jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  notified_at      timestamptz,
  notify_error     text,
  unique (organization_id, dedupe_key)
);

create index if not exists idx_alerts_recent
  on alerts (organization_id, created_at desc);

create index if not exists idx_alerts_pending
  on alerts (organization_id, created_at)
  where notified_at is null;
