-- Lembrete de follow-up no celular: marca quando a conversa já foi lembrada.
--
-- O cron de lembretes procura conversas cuja última mensagem é nossa e que
-- ficaram sem resposta. Sem uma marca por conversa ele avisaria de novo a cada
-- rodada (a cada 30 min), virando spam. Com `last_reminder_at` o mesmo lead só
-- volta a ser lembrado depois da janela configurada.

alter table public.conversations
  add column if not exists last_reminder_at timestamptz;

comment on column public.conversations.last_reminder_at is
  'Última vez que o time foi lembrado por push de que este lead está sem resposta.';

create index if not exists conversations_reminder_idx
  on public.conversations (organization_id, last_reminder_at);
