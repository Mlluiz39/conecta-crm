/**
 * Leitura de sentimento do lead — o que decide se a IA sai da conversa.
 *
 * Regra do negócio (definida pelo dono): transferir para outro **agente** é rotina e o bot
 * continua atendendo; desligar a IA e chamar um humano só quando o cliente estiver muito
 * irritado, insatisfeito ou frustrado com o atendimento. Pedir "falar com vendas" não é
 * reclamação — é pedido de setor.
 *
 * É heurística de palavra-chave de propósito: roda antes de qualquer chamada de modelo (custo
 * zero, resultado determinístico) e é fácil de auditar quando o comportamento surpreender.
 */

export type Sentimento = {
  /** Sinal claro de irritação/insatisfação com o atendimento. */
  forte: boolean;
  /** Sinal fraco (reclamação pontual, demora) — só pesa quando se repete. */
  leve: boolean;
  /** O cliente rejeitou explicitamente o atendimento automático (robô/bot/IA). */
  rejeitaBot: boolean;
  /** Trechos que dispararam a leitura (para o log e para o alerta). */
  evidencias: string[];
};

/** Irritação explícita com o atendimento. */
const FORTES = [
  "péssimo",
  "pessimo",
  "horrível",
  "horrivel",
  "uma vergonha",
  "que vergonha",
  "absurdo",
  "palhaçada",
  "palhacada",
  "que decepção",
  "decepção",
  "decepcionado",
  "decepcionada",
  "indignado",
  "indignada",
  "revoltado",
  "revoltada",
  "muito irritado",
  "muito irritada",
  "estou irritado",
  "estou irritada",
  "que raiva",
  "não aguento mais",
  "nao aguento mais",
  "cansado de",
  "cansada de",
  "insatisfeito",
  "insatisfeita",
  "frustrado",
  "frustrada",
  "frustração",
  "frustracao",
  "frustrante",
  "ninguém me responde",
  "ninguem me responde",
  "não me respondem",
  "nao me respondem",
  "descaso",
  "desrespeito",
  "falta de respeito",
  "péssimo atendimento",
  "pessimo atendimento",
  "atendimento péssimo",
  "atendimento pessimo",
  "atendimento ruim",
  "que atendimento",
  "quero cancelar",
  "vou cancelar",
  "cancelar o contrato",
  "vou processar",
  "procon",
  "reclamação formal",
  "reclamacao formal",
];

/** Rejeição do atendimento automático: quer uma pessoa, não o robô. */
const REJEICAO_BOT = [
  "robô",
  "robo",
  "chatbot",
  "não quero falar com bot",
  "nao quero falar com bot",
  "não quero falar com robô",
  "nao quero falar com robo",
  "atendimento automático",
  "atendimento automatico",
  "atendimento robotizado",
  "falar com uma pessoa de verdade",
  "quero uma pessoa de verdade",
  "sempre a mesma resposta",
  "resposta automática",
  "resposta automatica",
];

/** Reclamação pontual: só vira transbordo se repetir. */
const LEVES = [
  "reclamação",
  "reclamacao",
  "reclamar",
  "demora",
  "demorado",
  "demorando",
  "não funciona",
  "nao funciona",
  "não resolve",
  "nao resolve",
  "de novo isso",
  "outra vez",
  "insatisfação",
  "insatisfacao",
];

/** "Grito": caixa alta ou pontuação repetida. Reforça o sinal fraco. */
function estaGritando(texto: string): boolean {
  if (/!{2,}|\?{3,}/.test(texto)) return true;
  const palavras = texto.match(/\b[A-ZÀ-Ú]{4,}\b/g) ?? [];
  return palavras.length >= 2;
}

function acharTermos(texto: string, termos: string[]): string[] {
  return termos.filter((t) => texto.includes(t));
}

/** Lê uma mensagem do lead. */
export function avaliarSentimento(mensagem: string): Sentimento {
  const texto = String(mensagem ?? "").toLowerCase();
  const evidencias: string[] = [];

  const fortes = acharTermos(texto, FORTES);
  const rejeicao = acharTermos(texto, REJEICAO_BOT);
  const leves = acharTermos(texto, LEVES);
  const gritando = estaGritando(String(mensagem ?? ""));

  evidencias.push(...fortes, ...rejeicao, ...leves);

  // Rejeitar o robô já é motivo para passar a conversa a uma pessoa.
  const forte = fortes.length > 0 || rejeicao.length > 0 || (gritando && leves.length > 0);

  return {
    forte,
    leve: !forte && (leves.length > 0 || gritando),
    rejeitaBot: rejeicao.length > 0,
    evidencias: [...new Set(evidencias)],
  };
}

/**
 * Lê a conversa toda (mensagens anteriores + a atual) e decide se o cliente está claramente
 * insatisfeito: um sinal forte basta; dois sinais fracos também.
 */
export function clienteInsatisfeito(mensagensDoLead: string[]): Sentimento & { motivador: boolean } {
  const leituras = mensagensDoLead.filter(Boolean).map(avaliarSentimento);
  const atual = leituras[leituras.length - 1] ?? avaliarSentimento("");

  const fortes = leituras.filter((l) => l.forte);
  const leves = leituras.filter((l) => l.leve);
  const motivador = leituras.length > 0 && (fortes.length > 0 || leves.length >= 2);

  return {
    motivador,
    forte: fortes.length > 0,
    leve: leves.length > 0,
    rejeitaBot: leituras.some((l) => l.rejeitaBot),
    evidencias: [...new Set([...atual.evidencias, ...leituras.flatMap((l) => l.evidencias)])],
  };
}
