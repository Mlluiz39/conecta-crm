/**
 * Sufixo usado para achar contato quando o telefone foi gravado sem DDI.
 *
 * O CRM guarda telefone em formatos diferentes conforme a origem: o formulário
 * grava `55 + DDD + número`, uma importação antiga pode ter só `DDD + número`.
 * Comparar os últimos 9 dígitos (como o inbound fazia) ignora o DDD e faz
 * `11 97777-6666` casar com `21 97777-6666` — duas pessoas diferentes.
 *
 * A regra aqui preserva o DDD: 11 dígitos para celular, 10 para fixo.
 */
export function phoneSuffixForLookup(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.length <= 11) return digits;
  // 13 = 55 + DDD + 9 dígitos; 12 = 55 + DDD + 8 dígitos.
  return digits.length >= 13 ? digits.slice(-11) : digits.slice(-10);
}
