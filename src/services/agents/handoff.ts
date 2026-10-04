import type { HandoffRuleKey } from "@/types/domain";

/** Palavras que sinalizam pedido de humano. */
const HUMAN_KEYWORDS = [
  "atendente",
  "humano",
  "pessoa",
  "gerente",
  "falar com alguém",
  "falar com alguem",
  "atendimento humano",
  "supervisor",
];

/**
 * Avalia as regras de handoff habilitadas do agente contra a mensagem e o
 * contexto. Retorna a primeira regra acionada, ou null.
 *
 * ponytail: sentimento_negativo fica como gancho (necessita classificador);
 * upgrade = chamada Haiku de análise de sentimento antes do loop principal.
 */
export function evaluateHandoff(params: {
  enabledRules: HandoffRuleKey[];
  message: string;
  consecutiveFailures: number;
  withinBusinessHours: boolean;
}): HandoffRuleKey | null {
  const { enabledRules, message, consecutiveFailures, withinBusinessHours } =
    params;
  const lower = message.toLowerCase();

  if (
    enabledRules.includes("cliente_pede_humano") &&
    HUMAN_KEYWORDS.some((k) => lower.includes(k))
  ) {
    return "cliente_pede_humano";
  }

  if (
    enabledRules.includes("fora_do_horario") &&
    !withinBusinessHours
  ) {
    return "fora_do_horario";
  }

  if (
    enabledRules.includes("3_falhas_seguidas") &&
    consecutiveFailures >= 3
  ) {
    return "3_falhas_seguidas";
  }

  return null;
}
