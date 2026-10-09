/** Tipos de domínio alinhados aos enums de supabase/migrations/schema.sql */

export type UserRole = "admin" | "gerente" | "atendente";
export type BusinessType = "imobiliaria" | "ecommerce" | "clinica" | "agencia";
export type ChannelType = "whatsapp" | "instagram" | "messenger" | "telegram";
export type AgentRole = "gerente" | "vendedor" | "atendente" | "suporte" | "agendador" | "personalizado";
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
  | "mover_etapa_funil"
  | "delegar_para";

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
  telegram: "Telegram",
};

export const AGENT_ROLE_LABEL: Record<AgentRole, string> = {
  gerente: "Gerente",
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
  delegar_para: "Delegar para Subagente",
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

/**
 * Vozes que o CRM sabe pedir, no formato gravado em `agents.voice`.
 *
 * O prefixo é o que decide o motor (veja `interpretarVoz` em `services/audio/voice.ts`), então
 * estes valores valem em qualquer `TTS_PROVIDER` — sem prefixo, o nome só funciona no motor que
 * estiver configurado, e é por isso que a lista não usa nome solto.
 *
 * Fontes: as vozes do MLVoice Engine v2 são as que o próprio motor anuncia em `GET /health`
 * (`voices`), que é a mesma tupla que ele valida no `/v1/tts` — pedir outra devolve HTTP 422.
 * As do Piper são as pt-BR oficiais que `deploy/tts/piper/setup.sh` baixa.
 */
export type AgentVoiceOption = {
  value: string;
  label: string;
  /** Rótulo do grupo no seletor. */
  group: string;
};

export const VOICE_CATALOG: AgentVoiceOption[] = [
  // MLVoice Engine v2 (Pocket TTS) — roda na própria VPS, em CPU.
  { value: "mlvoice:rafael", label: "Rafael", group: "MLVoice (Pocket TTS)" },
  { value: "mlvoice:jane", label: "Jane", group: "MLVoice (Pocket TTS)" },
  { value: "mlvoice:vera", label: "Vera", group: "MLVoice (Pocket TTS)" },
  { value: "mlvoice:peter_yearsley", label: "Peter Yearsley", group: "MLVoice (Pocket TTS)" },
  { value: "mlvoice:george", label: "George", group: "MLVoice (Pocket TTS)" },
  // Piper local — o motor leve, uma voz por agente.
  { value: "piper:faber", label: "Faber", group: "Piper (local, CPU)" },
  { value: "piper:jeff", label: "Jeff", group: "Piper (local, CPU)" },
  { value: "piper:cadu", label: "Cadu", group: "Piper (local, CPU)" },
  { value: "piper:edresson", label: "Edresson", group: "Piper (local, CPU)" },
  // Proxy OpenAI-compatible (Gemini via 9router) — o caminho antigo e a reserva.
  { value: "alloy", label: "Alloy", group: "Proxy (Gemini)" },
  { value: "nova", label: "Nova", group: "Proxy (Gemini)" },
  { value: "shimmer", label: "Shimmer", group: "Proxy (Gemini)" },
  { value: "Charon", label: "Charon", group: "Proxy (Gemini)" },
  { value: "Orus", label: "Orus", group: "Proxy (Gemini)" },
];

/** Grupos na ordem do catálogo, para o `<optgroup>` do seletor. */
export const VOICE_GROUPS: string[] = [...new Set(VOICE_CATALOG.map((v) => v.group))];

/** Texto legível de um valor de `agents.voice` (inclusive um que não esteja no catálogo). */
export function voiceLabel(value?: string | null): string {
  const bruto = String(value ?? "").trim();
  if (!bruto) return "voz padrão do sistema";
  return VOICE_CATALOG.find((v) => v.value === bruto)?.label ?? bruto;
}

