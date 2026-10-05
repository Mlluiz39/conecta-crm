/**
 * Temperatura do lead (frio/morno/quente) — vive fora do arquivo de server
 * actions porque um arquivo `"use server"` só pode exportar funções async.
 */

export type LeadTemperature = "frio" | "morno" | "quente";

export const TEMPERATURE_TAGS: Record<LeadTemperature, { name: string; color: string }> = {
  frio: { name: "Lead frio", color: "#38BDF8" },
  morno: { name: "Lead morno", color: "#F59E0B" },
  quente: { name: "Lead quente", color: "#EF4444" },
};

export const TEMPERATURE_NAMES = Object.values(TEMPERATURE_TAGS).map((t) => t.name);

export const TEMPERATURE_EMOJI: Record<LeadTemperature, string> = {
  frio: "❄️",
  morno: "🌤️",
  quente: "🔥",
};

/** Lê a temperatura a partir dos nomes de etiqueta do contato. */
export function temperatureFromTagNames(names: (string | null | undefined)[]): LeadTemperature | null {
  for (const name of names) {
    for (const [key, def] of Object.entries(TEMPERATURE_TAGS)) {
      if (name === def.name) return key as LeadTemperature;
    }
  }
  return null;
}
