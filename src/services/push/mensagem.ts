/**
 * Resumo curto da mensagem do lead para o corpo da notificação.
 * Módulo puro (sem "server-only", sem dependência) de propósito: é a única
 * parte desta feature que dá para testar sem navegador nem serviço de push.
 */
/** Prévia curta da mensagem do lead (o corpo da notificação não cabe tudo). */
export function resumirMensagem(texto: string, limite = 120): string {
  const limpo = String(texto ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpo) return "Mensagem recebida";
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo;
}
