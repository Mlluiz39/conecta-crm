import type { PromptVariables } from "@/types/domain";

/** Variáveis que o engine preenche. Chaves fora desta lista (ex: exemplos
 * internos do prompt como {{solucao}}) permanecem intactas. */
const KNOWN_VARIABLES = new Set([
  "nome_empresa",
  "nome_contato",
  "horario_atendimento",
  "canal",
  "nome_agente",
  "funcao_agente",
]);

/**
 * Substitui variáveis {{chave}} no system prompt. Aplicado em runtime, na
 * leitura — nunca persistido (draft/published guardam os placeholders).
 * Variável conhecida mas ausente vira string vazia (não vaza "{{x}}").
 * Chave desconhecida fica intacta para não degradar exemplos internos do prompt.
 */
export function renderPrompt(template: string, vars: PromptVariables): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
    if (!KNOWN_VARIABLES.has(key)) return match;
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

/** Variáveis presentes num template (para validação no editor). */
export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    found.add(m[1]);
  }
  return [...found];
}
