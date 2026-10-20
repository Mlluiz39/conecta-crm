-- Limpeza dos dados operacionais do CRM: contatos, conversas, mensagens,
-- notas, tags de contato, prospecção (outreach_queue), alertas, agendamentos
-- e logs de webhook. Deixa o banco pronto para novas prospecções sem apagar
-- o que é configuração: organização, equipe, agentes (prompts/ferramentas/
-- regras/canais), templates, pipeline, tags, campos personalizados e base de
-- conhecimento (knowledge_base_items).
--
-- Idempotente: TRUNCATE em tabela já vazia não faz efeito. A proteção
-- `to_regclass` permite rodar em ambientes onde alguma tabela ainda não exista.

begin;

do $$
declare
  t text;
  tabelas text[] := array[
    -- logs e eventos primeiro (não têm dependentes)
    'webhook_events',
    'alerts',
    'agent_tool_calls',
    -- agenda
    'appointment_reminders',
    'appointments',
    -- conversas (filhas antes das mães)
    'conversation_tags',
    'conversation_notes',
    'messages',
    'conversations',
    -- prospecção e contatos
    'contact_tags',
    'opportunities',
    'outreach_queue',
    'contacts'
  ];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is not null then
      execute format('truncate table public.%I restart identity cascade', t);
      raise notice 'limpar_dados: % esvaziada', t;
    end if;
  end loop;
end $$;

commit;
