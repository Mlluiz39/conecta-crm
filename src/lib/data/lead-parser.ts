/**
 * Parser de linhas de lead coladas/planilha.
 *
 * Formato recomendado: nome; telefone; email; empresa; cidade
 * Aceita separadores ; tab | e vírgula (quando não separa e-mail),
 * e reconhece telefone/e-mail em qualquer posição da linha.
 */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export type ParsedLead = {
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  city: string | null;
};

/** Normaliza telefone brasileiro para o formato E.164 sem "+" (ex.: 5511999998888). */
export function normalizePhone(raw: string): string | null {
  const digits = onlyDigits(raw);
  if (digits.length < 8 || digits.length > 13) return null;
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

export function parseLeadLine(line: string): ParsedLead | null {
  const raw = (line ?? "").trim();
  if (!raw) return null;

  const cells = raw
    .split(/\s*[;\t|]\s*/)
    .flatMap((part) => part.split(/\s*,\s*/))
    .map((p) => p.trim())
    .filter(Boolean);
  const list = cells.length > 0 ? cells : [raw];

  let name = "";
  let phone: string | null = null;
  let email: string | null = null;
  const rest: string[] = [];

  for (const cell of list) {
    const emailMatch = cell.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (!email && emailMatch) {
      email = emailMatch[0].toLowerCase();
      continue;
    }
    if (!phone && !/[a-zA-Z]/.test(cell)) {
      const normalized = normalizePhone(cell);
      if (normalized) {
        phone = normalized;
        continue;
      }
    }
    if (!name && /[a-zA-ZÀ-ÿ]/.test(cell)) {
      name = cell.replace(/\s+/g, " ");
      continue;
    }
    rest.push(cell);
  }

  if (!name || (!phone && !email)) return null;

  return {
    name,
    phone,
    email,
    company: rest[0] ?? null,
    city: rest[1] ?? null,
  };
}

/** Remove cabeçalho de planilha, se presente. */
export function stripHeader(lines: string[]): string[] {
  if (lines.length === 0) return lines;
  const first = lines[0].toLowerCase();
  const isHeader =
    (first.includes("nome") || first.includes("name") || first.includes("contato")) &&
    (first.includes("telefone") ||
      first.includes("phone") ||
      first.includes("celular") ||
      first.includes("email") ||
      first.includes("e-mail"));
  return isHeader ? lines.slice(1) : lines;
}
