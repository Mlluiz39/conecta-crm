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

export function evaluateHandoff(params: {
  enabledRules: HandoffRuleKey[];
  message: string;
  consecutiveFailures: number;
  withinBusinessHours: boolean;
}): HandoffRuleKey | null {
  const { enabledRules, message, consecutiveFailures, withinBusinessHours } = params;
  const lower = message.toLowerCase();

  if (
    enabledRules.includes("cliente_pede_humano") &&
    HUMAN_KEYWORDS.some((k) => lower.includes(k))
  ) {
    return "cliente_pede_humano";
  }

  if (enabledRules.includes("fora_do_horario") && !withinBusinessHours) {
    return "fora_do_horario";
  }

  if (enabledRules.includes("falhas_seguidas") && consecutiveFailures >= 3) {
    return "falhas_seguidas";
  }

  return null;
}
