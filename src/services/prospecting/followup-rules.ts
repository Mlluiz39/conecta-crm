/**
 * Regras puras do follow-up de fechamento (sem dependências de servidor,
 * para poderem ser testadas isoladamente).
 */

/** Lê quantos follow-ups já saíram para o contato (contacts.custom_fields.followup). */
export function readFollowupCount(customFields: unknown): number {
  if (!customFields || typeof customFields !== "object") return 0;
  const raw = (customFields as Record<string, unknown>).followup;
  if (!raw || typeof raw !== "object") return 0;
  const count = (raw as Record<string, unknown>).count;
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

/**
 * Decide se um lead é elegível a follow-up.
 * Regras: teve primeira mensagem nossa; ninguém respondeu depois dela;
 * já passou o tempo mínimo; e ainda não estourou o limite de retomadas.
 */
export function isFollowupEligible(input: {
  firstTouchAt: string | null;
  lastInboundAt: string | null;
  now: number;
  minHours: number;
  followupsSent: number;
  maxFollowups: number;
}): boolean {
  if (!input.firstTouchAt) return false;
  if (input.followupsSent >= input.maxFollowups) return false;

  const first = new Date(input.firstTouchAt).getTime();
  if (!Number.isFinite(first)) return false;
  if (input.now - first < input.minHours * 3600_000) return false;

  if (input.lastInboundAt) {
    const inbound = new Date(input.lastInboundAt).getTime();
    if (Number.isFinite(inbound) && inbound > first) return false; // lead respondeu
  }

  return true;
}

/** Horas desde o primeiro contato (para exibir na UI). */
export function hoursSince(iso: string, now = Date.now()): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((now - t) / 3600_000));
}
