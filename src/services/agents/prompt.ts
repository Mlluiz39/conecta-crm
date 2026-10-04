import type { PromptVariables } from "@/types/domain";

/**
 * Substitui variáveis {{chave}} no system prompt. Aplicado em runtime, na
 * leitura — nunca persistido (draft/published guardam os placeholders).
 * Variável ausente vira string vazia (não deixa "{{x}}" vazando pro modelo).
 */
export function renderPrompt(template: string, vars: PromptVariables): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
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
