/**
 * Detecta pedido de descadastro/opt-out na mensagem do lead.
 *
 * A regra é conservadora: "não tenho interesse" NÃO é opt-out (o lead pode
 * voltar), e "não quero falar com robô" é transbordo para humano, não bloqueio.
 * Só entra aqui o pedido explícito de parar de receber contato.
 */

function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const OPT_OUT_PATTERNS: RegExp[] = [
  // "pare de me mandar mensagem", "para de enviar", "pare de me contatar"
  /\b(par[ae]r?|parem) de (me )?(mandar|enviar|contatar|contactar|ligar|mensagens?|whatsapp)\b/,
  // "não me mande mais mensagem", "não me envie", "não me contate"
  /\bnao (me )?(mande|mandem|envie|enviem|contate|contatem|perturbe)\b/,
  // "não quero mais receber", "não quero receber mensagens", "não quero ser contatado"
  /\bnao quero (mais )?(receber|ser contatad[oa]|receber (mensagens?|whatsapp|contato))\b/,
  // "descadastrar", "descadastre", "desinscrever", "sair da lista"
  /\b(descadastr\w*|desinscrev\w*|sair da lista|remover da lista)\b/,
  // "me remove da lista", "me tira do grupo", "remover meu número"
  /\b(me )?(remove|remova|removam|remover|tira|tire|tirem) (da|do|meu|meus) (lista|numero|whatsapp|contato)\b/,
  // "cancelar o envio", "cancelar mensagens"
  /\bcancelar (o )?(envio|recebimento|mensagens?)\b/,
];

export function isOptOutMessage(text: string | null | undefined): boolean {
  const alvo = normalize(text ?? "");
  if (!alvo) return false;
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(alvo));
}
