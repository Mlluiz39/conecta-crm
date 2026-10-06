-- Fila de disparo da prospecção: permite enviar ao longo do dia (9–18h),
-- com limite diário e intervalos variados para evitar banimento.
-- Também é a memória do ciclo: quem já foi, por qual canal e quando.

create table if not exists outreach_queue (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  contact_id       uuid not null references contacts(id) on delete cascade,
  status           text not null default 'pendente',   -- pendente | enviado | falhou | cancelado
  channel          text,                               -- whatsapp | email (definido no envio)
  scheduled_at     timestamptz,                        -- quando este lead deve ser abordado
  sent_at          timestamptz,
  attempts         int not null default 0,
  last_error       text,
  briefing         jsonb not null default '{}',        -- offer/goal/notes/value do lote
  message_id       uuid,
  conversation_id  uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- um lead por vez na fila (reenfileirar atualiza o item existente)
  unique (organization_id, contact_id)
);

create index if not exists idx_outreach_due
  on outreach_queue (organization_id, status, scheduled_at);

create index if not exists idx_outreach_sent
  on outreach_queue (organization_id, status, sent_at desc);
