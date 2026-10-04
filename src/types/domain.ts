/** Tipos de domínio alinhados aos enums do Postgres (supabase/migrations). */

export type UserRole = "admin" | "gerente" | "atendente";
export type BusinessType =
  | "imobiliaria"
  | "ecommerce"
  | "clinica"
  | "agencia"
  | "outro";
export type ChannelType =
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "web"
  | "email"
  | "telefone";
export type AgentRole =
  | "vendedor"
  | "atendente"
  | "suporte"
  | "agendador"
  | "personalizado";
export type PromptStatus = "draft" | "published" | "archived";
export type AgentToolKey =
  | "buscar_informacoes"
  | "agendar_visita"
  | "derivar_para_atendente"
  | "atualizar_contato"
  | "mover_etapa_funil";
export type HandoffRuleKey =
  | "cliente_pede_humano"
  | "sentimento_negativo"
  | "3_falhas_seguidas"
  | "fora_do_horario";
export type ConversationStatus = "aberta" | "pendente" | "resolvida";
export type MessageSenderType = "contact" | "agent" | "user" | "system";

/** Variáveis substituíveis no system prompt do agente. */
export type PromptVariables = Partial<{
  nome_empresa: string;
  nome_contato: string;
  horario_atendimento: string;
  canal: string;
  nome_agente: string;
  [key: string]: string | undefined;
}>;

export const CHANNEL_LABEL: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  web: "Web",
  email: "E-mail",
  telefone: "Telefone",
};

export const AGENT_ROLE_LABEL: Record<AgentRole, string> = {
  vendedor: "Vendedor",
  atendente: "Atendente",
  suporte: "Suporte",
  agendador: "Agendador",
  personalizado: "Personalizado",
};

export const TOOL_LABEL: Record<AgentToolKey, string> = {
  buscar_informacoes: "Buscar Informações da Base",
  agendar_visita: "Agendar Visita",
  derivar_para_atendente: "Derivar para Atendente",
  atualizar_contato: "Atualizar Contato",
  mover_etapa_funil: "Mover Etapa do Funil",
};

export const HANDOFF_RULE_LABEL: Record<HandoffRuleKey, string> = {
  cliente_pede_humano: "Cliente pede atendimento humano",
  sentimento_negativo: "Sentimento negativo detectado",
  "3_falhas_seguidas": "3 falhas seguidas do agente",
  fora_do_horario: "Mensagem fora do horário",
};
