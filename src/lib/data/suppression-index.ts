/**
 * Índice de supressão (opt-out) em memória — puro para poder ser testado sem banco.
 *
 * A mesma regra serve para três consumidores: enfileirar prospecção, enviar o
 * ciclo e escolher follow-up. Ter uma implementação só evita o clássico "a fila
 * bloqueou, mas o follow-up mandou".
 */

export type SuppressionRow = {
  contact_id: string | null;
  phone: string | null;
  email: string | null;
};

export type SuppressionIndex = {
  contactIds: Set<string>;
  phones: Set<string>;
  emails: Set<string>;
};

export function normalizeSuppressionPhone(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  // WhatsApp pode identificar o contato por LID (`...@lid`), que não é telefone.
  if (!value || value.includes("@")) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return null;
  // Contatos antigos podem ter sido gravados sem DDI (10–11 dígitos); a fila
  // compara sempre no mesmo formato (55 + DDD + número).
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

export function normalizeSuppressionEmail(raw: string | null | undefined): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  return email || null;
}

export function buildSuppressionIndex(rows: SuppressionRow[] | null | undefined): SuppressionIndex {
  const index: SuppressionIndex = {
    contactIds: new Set(),
    phones: new Set(),
    emails: new Set(),
  };

  for (const row of rows ?? []) {
    if (row.contact_id) index.contactIds.add(String(row.contact_id));
    const phone = normalizeSuppressionPhone(row.phone);
    if (phone) index.phones.add(phone);
    const email = normalizeSuppressionEmail(row.email);
    if (email) index.emails.add(email);
  }

  return index;
}

export function isSuppressed(
  index: SuppressionIndex,
  target: { contactId?: string | null; phone?: string | null; email?: string | null },
): boolean {
  if (target.contactId && index.contactIds.has(String(target.contactId))) return true;
  const phone = normalizeSuppressionPhone(target.phone);
  if (phone && index.phones.has(phone)) return true;
  const email = normalizeSuppressionEmail(target.email);
  if (email && index.emails.has(email)) return true;
  return false;
}
