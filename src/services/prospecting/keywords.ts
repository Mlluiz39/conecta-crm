/**
 * Palavras-chave do ciclo de prospecção.
 *
 * Servem para (1) classificar a temperatura do lead automaticamente e
 * (2) disparar alertas no Telegram quando o lead esquenta ou pede uma call.
 */

export const KEYWORDS = {
  /** Pediu call / reunião / horário → alerta imediato */
  call: [
    "call",
    "callzinha",
    "reuniao",
    "reunião",
    "agendar",
    "agenda",
    "marcar",
    "marca um horario",
    "marca um horário",
    "horario",
    "horário",
    "meet",
    "google meet",
    "zoom",
    "videochamada",
    "video chamada",
    "ligacao",
    "ligação",
    "telefone",
    "conversar por voz",
    "podemos falar",
    "bora falar",
  ],

  /** Sinais de fechamento → lead quente + alerta */
  fechamento: [
    "fechar",
    "fechado",
    "fechamos",
    "contratar",
    "contrato",
    "proposta",
    "aprovado",
    "aprovei",
    "assinar",
    "assinatura",
    "pix",
    "boleto",
    "cartao",
    "cartão",
    "forma de pagamento",
    "como pago",
    "quando comecamos",
    "quando começamos",
    "vamos comecar",
    "vamos começar",
    "pode emitir",
    "manda o link",
    "quero sim",
    "bora",
  ],

  /** Pediu orçamento/valor → alerta próprio + lead morno */
  orcamento: [
    "orcamento",
    "orçamento",
    "quanto custa",
    "quanto fica",
    "quanto sai",
    "quanto seria",
    "qual o valor",
    "valor",
    "valores",
    "preco",
    "preço",
    "precos",
    "preços",
    "tabela de precos",
    "tabela de preços",
    "me passa o valor",
    "me manda o valor",
    "quanto voces cobram",
    "quanto vocês cobram",
    "investimento",
  ],

  /** Interesse comercial sem pedir valor → lead morno */
  interesse: [
    "prazo",
    "quanto tempo",
    "como funciona",
    "o que inclui",
    "me manda mais detalhes",
    "manda mais detalhes",
    "tenho interesse",
    "gostei",
    "faz sentido",
    "pode ser",
    "quero entender",
    "me explica",
  ],

  /** Sem interesse / esfriou → lead frio */
  desinteresse: [
    "sem interesse",
    "nao tenho interesse",
    "não tenho interesse",
    "nao quero",
    "não quero",
    "depois",
    "mais para frente",
    "sem tempo",
    "esta caro",
    "está caro",
    "muito caro",
    "nao é o momento",
    "não é o momento",
    "nao preciso",
    "não preciso",
    "para de mandar",
    "nao me mande",
    "não me mande",
    "descadastrar",
    "sair da lista",
  ],
  /**
   * RISCO COMERCIAL — termos que o agente NUNCA deveria usar sozinho:
   * preço, desconto, prazo e fechamento. Serve para AVISAR o dono quando
   * o agente prometer algo que só o responsável pode decidir.
   */
  risco: [
    "R$",
    " reais",
    "conto",
    "mil reais",
    "desconto",
    "promoção",
    "promocao",
    "abatimento",
    "parcelo",
    "parcelamento",
    "fechado",
    "fechamos",
    "contrato assinado",
    "vou emitir",
    "boleto",
    "pix",
    "nota fiscal",
    "link de pagamento",
    "pagamento à vista",
    "pagamento a vista",
    "assinar o contrato",
    "contrato pronto",
    "entregamos em",
    "entrego em",
    "entrega em",
    "fica pronto em",
    "pronto em",
    "no ar em",
    "dias úteis",
    "dias uteis",
    "prazo de",
    "prazo é",
    "começamos",
    "comeco em",
    "começo em",
    "garantia de",
    "sem custo",
    "por conta da casa",
  ],
} as const;

export type KeywordGroup = keyof typeof KEYWORDS;

/** Normaliza para comparar (minúsculas, sem acento extra, espaços simples). */
export function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Grupos de INTENÇÃO do lead (usados para temperatura/alertas).
 * O grupo `risco` fica fora: ele vale apenas para o que o AGENTE escreve
 * (ver `commercialRiskHits`), senão "qual o prazo?" viraria "risco".
 */
export const INTENT_GROUPS: KeywordGroup[] = [
  "call",
  "fechamento",
  "orcamento",
  "interesse",
  "desinteresse",
];

/** Quais grupos de intenção aparecem no texto. */
export function matchGroups(text: string): KeywordGroup[] {
  const t = normalize(text);
  if (!t) return [];
  const hits: KeywordGroup[] = [];
  for (const group of INTENT_GROUPS) {
    if (KEYWORDS[group].some((k) => t.includes(normalize(k)))) hits.push(group);
  }
  return hits;
}

/** Palavra-chave específica que casou (para mostrar no alerta). */
export function firstMatch(text: string, group: KeywordGroup): string | null {
  const t = normalize(text);
  return KEYWORDS[group].find((k) => t.includes(normalize(k))) ?? null;
}

/** Termos de risco presentes no texto do AGENTE (o que ele não pode prometer). */
export function commercialRiskHits(text: string): string[] {
  const t = normalize(text);
  if (!t) return [];
  const hits = new Set<string>();
  // "prazo"/"entrega" só contam como risco quando o agente PROMETE (não quando o lead pergunta)
  for (const k of KEYWORDS.risco) {
    const needle = normalize(k);
    if (needle && t.includes(needle)) hits.add(needle === "r$" ? "valor em reais" : needle);
  }
  // valores numéricos grandes com contexto de preço (ex.: "por 2.500", "sai 1500")
  if (/(r\$\s?\d|[\d.]{3,}\s*(reais|mil))/.test(t)) hits.add("número de preço");
  return [...hits];
}

export type Temperature = "frio" | "morno" | "quente";

export type Classification = {
  temperature: Temperature;
  reasons: string[];
};

/**
 * Classifica a temperatura do lead a partir das mensagens dele:
 *  - fechamento ou pedido de call → **quente**
 *  - interesse (preço/prazo/orçamento) → **morno**
 *  - desinteresse explícito → **frio**
 *  - sem sinal e sem resposta → **frio** (informado por quem chama)
 */
export function classifyTemperature(texts: string[]): Classification {
  const reasons: string[] = [];
  let quente = false;
  let morno = false;
  let frio = false;

  for (const text of texts) {
    const groups = matchGroups(text);
    if (groups.includes("fechamento")) {
      quente = true;
      const kw = firstMatch(text, "fechamento");
      if (kw) reasons.push(`fechamento: "${kw}"`);
    }
    if (groups.includes("call")) {
      quente = true;
      const kw = firstMatch(text, "call");
      if (kw) reasons.push(`pediu call: "${kw}"`);
    }
    if (groups.includes("orcamento")) {
      morno = true;
      const kw = firstMatch(text, "orcamento");
      if (kw) reasons.push(`pediu orçamento: "${kw}"`);
    }
    if (groups.includes("interesse")) {
      morno = true;
      const kw = firstMatch(text, "interesse");
      if (kw) reasons.push(`interesse: "${kw}"`);
    }
    if (groups.includes("desinteresse")) {
      frio = true;
      const kw = firstMatch(text, "desinteresse");
      if (kw) reasons.push(`desinteresse: "${kw}"`);
    }
  }

  // Precedência: fechamento/call (quente) > desinteresse explícito (frio) > interesse (morno).
  // Isso evita que "não tenho interesse" vire morno por conter "tenho interesse".
  const temperature: Temperature = quente ? "quente" : frio ? "frio" : morno ? "morno" : "frio";
  return { temperature, reasons: [...new Set(reasons)].slice(0, 4) };
}
