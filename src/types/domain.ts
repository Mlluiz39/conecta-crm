/** Tipos de domínio alinhados aos enums de supabase/migrations/schema.sql */

export type UserRole = "admin" | "gerente" | "atendente";
export type BusinessType = "imobiliaria" | "ecommerce" | "clinica" | "agencia";
export type ChannelType = "whatsapp" | "instagram" | "messenger";
export type AgentRole = "vendedor" | "atendente" | "suporte" | "agendador" | "personalizado";
export type AgentTone = "formal" | "amigavel" | "consultivo" | "direto";
export type PromptStatus = "draft" | "published" | "archived";
export type ConversationStatus = "aberta" | "pendente" | "resolvida";
export type MessageDirection = "in" | "out";
export type SenderType = "contact" | "agent_ai" | "user" | "system";
export type FieldType = "text" | "number" | "date" | "select" | "currency";
export type AppointmentStatus = "agendado" | "confirmado" | "realizado" | "cancelado" | "faltou";

export type AgentToolKey =
  | "buscar_informacoes"
  | "agendar_visita"
  | "derivar_para_atendente"
  | "atualizar_contato"
  | "mover_etapa_funil";

export type HandoffRuleKey =
  | "cliente_pede_humano"
  | "sentimento_negativo"
  | "falhas_seguidas"
  | "fora_do_horario";

export type PromptVariables = Partial<{
  nome_empresa: string;
  nome_contato: string;
  horario_atendimento: string;
  canal: string;
  nome_agente: string;
  funcao_agente: string;
  [key: string]: string | undefined;
}>;

export const CHANNEL_LABEL: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
};

export const AGENT_ROLE_LABEL: Record<AgentRole, string> = {
  vendedor: "Vendedor",
  atendente: "Atendente",
  suporte: "Suporte",
  agendador: "Agendador",
  personalizado: "Personalizado",
};

export const AGENT_TONE_LABEL: Record<AgentTone, string> = {
  formal: "Formal",
  amigavel: "Amigável",
  consultivo: "Consultivo",
  direto: "Direto",
};

export const TOOL_LABEL: Record<AgentToolKey, string> = {
  buscar_informacoes: "Buscar Informações da Base",
  agendar_visita: "Agendar Visita / Consulta",
  derivar_para_atendente: "Derivar para Atendente Humano",
  atualizar_contato: "Atualizar Contato",
  mover_etapa_funil: "Mover Etapa do Funil",
};

export const HANDOFF_RULE_LABEL: Record<HandoffRuleKey, string> = {
  cliente_pede_humano: "Cliente pede atendimento humano",
  sentimento_negativo: "Sentimento negativo detectado",
  falhas_seguidas: "3 falhas seguidas do agente",
  fora_do_horario: "Mensagem fora do horário",
};

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
  faltou: "Faltou",
};
