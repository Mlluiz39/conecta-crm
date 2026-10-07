-- Canal de Telegram (o bot próprio do CRM — o mesmo que manda os alertas).
--
-- Entrada: o webhook da Bot API entrega cada mensagem em /api/webhooks/telegram; o adapter
-- (`src/services/messaging/telegram.adapter.ts`) normaliza, a conversa nasce com
-- channel_type='telegram' e o agente responde pela outbox, igual ao WhatsApp.

-- 1) O enum precisa aceitar 'telegram' antes de qualquer canal/agente usá-lo.
--    (ALTER TYPE ... ADD VALUE não roda dentro de transação: por isso vem isolado e
--     o script apply-sql.mjs manda statement por statement.)
alter type channel_type add value if not exists 'telegram';

-- 2) O lead do Telegram é identificado pelo chat id, não por telefone.
--    Guardar em `phone` seria pior do que parece: o CRM casa contato por sufixo de 9 dígitos
--    (DDI varia), então um chat id poderia casar com o telefone de um lead de WhatsApp e
--    fundir os dois. Coluna própria, como instagram_handle/messenger_psid.
alter table contacts add column if not exists telegram_chat_id text;

-- mesmo padrão do índice de telefone: único por organização e só quando preenchido
create unique index if not exists contacts_org_telegram_uq
  on contacts (organization_id, telegram_chat_id)
  where telegram_chat_id is not null;
