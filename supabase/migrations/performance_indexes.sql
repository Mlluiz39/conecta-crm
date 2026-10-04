-- Migration para índices de otimização de performance
-- Executar no SQL Editor do Supabase para acelerar consultas frequentes do Dashboard e Inbox

-- 1. Consultas de conversas por organização ordenadas por última mensagem
CREATE INDEX IF NOT EXISTS idx_conversations_org_last_msg 
ON public.conversations (organization_id, last_message_at DESC NULLS LAST);

-- 2. Consultas de contatos por organização ordenados por data de criação
CREATE INDEX IF NOT EXISTS idx_contacts_org_created 
ON public.contacts (organization_id, created_at DESC);

-- 3. Mensagens de uma conversa específica ordenadas por data
CREATE INDEX IF NOT EXISTS idx_messages_org_conv_created 
ON public.messages (organization_id, conversation_id, created_at ASC);

-- 4. Oportunidades do funil por organização e estágio
CREATE INDEX IF NOT EXISTS idx_opportunities_org_stage_pos 
ON public.opportunities (organization_id, stage_id, position ASC);

-- 5. Agendamentos futuros por organização
CREATE INDEX IF NOT EXISTS idx_appointments_org_starts 
ON public.appointments (organization_id, starts_at ASC);
