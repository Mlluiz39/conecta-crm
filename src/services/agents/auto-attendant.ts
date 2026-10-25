/**
 * Atendimento automático do outro lado: a IA não fala com robô.
 *
 * Problema real (25/10/2026): de 10 conversas que "responderam" na prospecção, **8 eram o
 * atendimento automático do próprio negócio** — menu de opções, template de boas-vindas,
 * aviso de horário. A IA leu aquilo como se fosse o lead, respondeu ao menu, e emendou
 * segunda e terceira mensagem na mesma máquina (a Bijukeiras devolveu o mesmo template 3x).
 * Consequências: o dono nunca viu a abordagem, a conversa ficou marcada como "lead respondeu"
 * e o único jeito de saber era ler as mensagens uma por uma.
 *
 * A regra aqui é deliberadamente assimétrica: parar é barato (o humano troca de canal e fala
 * com o responsável); deixar passar é caro (a IA se queima, gasta token e polui o funil). Por
 * isso qualquer sinal FORTE basta, e dois sinais característicos somados também — mas frases
 * comuns de gente ("número errado", "tudo bem?", "me manda um e-mail") nunca casam.
 *
 * Módulo puro (sem `server-only`, sem I/O) para ser usado pelo motor e testado direto.
 */

/** Motivo gravado em `conversations.handoff_reason` quando a IA sai por causa do robô. */
export const MOTIVO_ATENDIMENTO_AUTOMATICO = "atendimento_automatico";

export type DeteccaoAtendimentoAutomatico = {
  detectado: boolean;
  /** Quais regras casaram — vai para a nota da conversa, para o humano saber por quê. */
  sinais: string[];
  /** O template chegou repetido na mesma conversa (loop de atendimento automático). */
  repeticao: boolean;
};

/**
 * Sinal que sozinho já caracteriza máquina: ninguém escreve "responda com o número da opção
 * desejada" numa conversa de pessoa para pessoa.
 */
const SINAIS_FORTES: readonly { nome: string; regra: RegExp }[] = [
  { nome: "diz que é atendimento automático", regra: /(atendimento|resposta|mensagem)\s+autom[áa]tic[oa]/i },
  { nome: "assistente virtual", regra: /assistente\s+virtual|\brob[ôo]\b|chat\s?bot/i },
  { nome: "menu por número", regra: /responda\s+com\s+(o\s+)?n[úu]mero|op[çc][ãa]o\s+desejada|escolha\s+uma\s+op[çc][ãa]o|digite\s+(a\s+)?op[çc][ãa]o/i },
  { nome: "menu com emoji numerado", regra: /[1-9]\ufe0f?\u20e3/ },
  { nome: "lista numerada de opções", regra: /(?:^|\n)\s*(?:1️⃣|1\ufe0f?\u20e3|1\s*[-–)])\s*[^\n]{0,60}\n\s*(?:2️⃣|2\ufe0f?\u20e3|2\s*[-–)])/i },
];

/**
 * Sinal característico de template de negócio. Dois deles juntos já são máquina; um sozinho
 * pode ser gente simpática, então não basta.
 */
const SINAIS_MEDIOS: readonly { nome: string; regra: RegExp }[] = [
  { nome: "boas-vindas de template", regra: /seja\s+(muito\s+)?bem[\s-]?vind[oa]|bem[\s-]?vind[oa]\s+(a|à|ao)\b/i },
  { nome: "agradece o contato", regra: /agradece\s+(o\s+)?seu\s+contato|obrigad[oa]\s+por\s+(entrar\s+em\s+)?contato|obrigad[oa]\s+pelo\s+contato/i },
  { nome: "promete retorno", regra: /em\s+breve,?\s+(te\s+)?retornaremos|iremos\s+(te\s+)?atender|vamos\s+(te\s+)?atender|responderemos\s+assim\s+que\s+poss[íi]vel|logo\s+mais\s+iremos/i },
  { nome: "aguarde um momento", regra: /aguarde\s+um\s+momento/i },
  { nome: "horário de atendimento", regra: /nosso\s+hor[áa]rio\s+de\s+atendimento|hor[áa]rio\s+de\s+atendimento\s+(é|de)\s/i },
  { nome: "link da agenda", regra: /link\s+de\s+nossa\s+agenda|nossa\s+agenda\s+online|acesse\s+(o\s+)?link\s+(da|de)\s+(nossa\s+)?agenda/i },
  { nome: "pergunta de central", regra: /como\s+podemos\s+ajudar|em\s+que\s+podemos\s+ajudar/i },
  { nome: "aviso de endereço/horário", regra: /leia\s+com\s+aten[çc][ãa]o|endere[çc]o\s+e\s+hor[áa]rio/i },
  { nome: "instrução de agendamento", regra: /para\s+agendar\s+(o\s+)?(seu\s+)?(hor[áa]rio|atendimento)|agende\s+(pelo|no|por)\s+(link|app|site)/i },
  { nome: "aviso de feriado/status", regra: /nos\s+feriados|deixamos\s+avisos/i },
];

/** Compara texto sem acento, sem emoji e sem espaço duplicado — para achar repetição. */
function normalizar(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Decide se a mensagem recebida é de atendimento automático.
 *
 * @param mensagem - o texto que acabou de entrar.
 * @param historicoInbound - mensagens anteriores **do lead** nesta conversa (mais antiga
 *   primeiro), sem a atual. Serve só para detectar template repetido.
 */
export function detectarAtendimentoAutomatico(params: {
  mensagem: string;
  historicoInbound?: string[];
}): DeteccaoAtendimentoAutomatico {
  const mensagem = String(params.mensagem ?? "");
  if (!mensagem.trim()) return { detectado: false, sinais: [], repeticao: false };

  const sinais: string[] = [];

  for (const { nome, regra } of SINAIS_FORTES) {
    if (regra.test(mensagem)) sinais.push(nome);
  }
  if (sinais.length > 0) return { detectado: true, sinais, repeticao: false };

  const medios = SINAIS_MEDIOS.filter(({ regra }) => regra.test(mensagem)).map(({ nome }) => nome);

  // Template repetido é sinal objetivo de loop: o mesmo texto voltando na mesma conversa.
  // Um humano não repete a mensagem idêntica três vezes seguidas.
  const minha = normalizar(mensagem);
  const repeticao =
    minha.length >= 20 &&
    (params.historicoInbound ?? []).some((anterior) => normalizar(anterior) === minha);
  if (repeticao) return { detectado: true, sinais: ["template repetido"], repeticao: true };

  if (medios.length >= 2) return { detectado: true, sinais: medios, repeticao: false };

  return { detectado: false, sinais: medios, repeticao: false };
}
