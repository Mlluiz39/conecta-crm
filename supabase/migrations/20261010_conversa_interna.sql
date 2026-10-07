-- Conversa interna: o dono (CEO) falando com um agente pelo Telegram.
--
-- Não é lead: não entra no inbox de Conversas, não gera alerta de "lead respondeu", não entra
-- no funil, não passa por regra de transbordo e o agente responde em modo interno (só leitura
-- do CRM + base de conhecimento) em vez do prompt de vendas.
--
-- O que continua igual: contato, conversa e mensagens são gravados — é isso que dá memória ao
-- agente entre uma mensagem e outra, e o histórico fica auditável no banco.

alter table conversations add column if not exists is_internal boolean not null default false;

comment on column conversations.is_internal is
  'Conversa do dono com um agente (ex.: Telegram do CEO). Fora do inbox de leads e dos alertas.';

create index if not exists conversations_internal_idx
  on conversations (organization_id, is_internal)
  where is_internal;
