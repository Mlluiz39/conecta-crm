-- Remove a estrutura de Templates WhatsApp (a tela foi removida do CRM).
-- ATENÇÃO: `agent_templates` NÃO é afetada — ela alimenta os prompts dos agentes.

-- A coluna apontava para a tabela removida
alter table if exists public.appointment_reminders
  drop column if exists template_id;

drop table if exists public.whatsapp_templates cascade;

-- Tipos que existiam só para os templates da Meta
drop type if exists template_category;
drop type if exists template_status;
