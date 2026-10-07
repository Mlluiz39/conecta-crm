import type { HandoffRuleKey } from "@/types/domain";
// Extensão explícita: os testes rodam com `node --test` (strip de tipos), que não resolve
// import sem extensão. `allowImportingTsExtensions` já está no tsconfig e o Next resolve igual.
import { clienteInsatisfeito } from "./sentiment.ts";

/**
 * Quando a IA sai da conversa.
 *
 * Regra do negócio (dita pelo dono): pedir para falar com outro **setor/agente** é rotina —
 * isso é transferência entre agentes (`delegar_para`/roteamento), e o bot continua atendendo.
 * Desligar a IA e chamar um humano é para quando o cliente está muito irritado, insatisfeito
 * ou frustrado com o atendimento (ver `sentiment.ts`).
 *
 * Foi a lista antiga de palavras ("atendente", "humano", "gerente", "pessoa") que fazia o
 * atendimento cair por qualquer menção — inclusive em conversa normal.
 */

/** Quem pede humano uma vez está perguntando; quem pede repedidamente está pedindo. */
export const PEDIDOS_ATE_TRANSBORDAR = 2;

/**
 * Mensagem de espera enviada ao lead quando o transbordo automático acontece.
 *
 * Transbordar sem avisar deixava o lead no vácuo (silêncio depois de reclamar) — e é isso
 * que trava a conversa na cabeça dele. Ele recebe isto e a conversa vai para o humano, que é
 * avisado no Telegram pelo alerta `pediu_humano`.
 */
export function mensagemDeTransbordo(): string {
  return "Sinto muito por isso. Já chamei uma pessoa do time para cuidar de você — só um instante, por favor.";
}

export function evaluateHandoff(params: {
  enabledRules: HandoffRuleKey[];
  message: string;
  consecutiveFailures: number;
  withinBusinessHours: boolean;
  /**
   * Mensagens anteriores do lead nesta conversa (mais antiga primeiro), **sem a atual**.
   * Serve para ler o sentimento da conversa e contar pedidos repetidos.
   */
  historicoInbound?: string[];
  /** Quantos pedidos repetidos disparam o transbordo (1 = desliga na primeira menção). */
  pedidosNecessarios?: number;
}): HandoffRuleKey | null {
  const {
    enabledRules,
    message,
    consecutiveFailures,
    withinBusinessHours,
    historicoInbound,
    pedidosNecessarios,
  } = params;

  const conversa = [...(historicoInbound ?? []), message].filter(Boolean);
  const sentimento = clienteInsatisfeito(conversa);

  // 1. Rejeitou o atendimento automático ("não quero falar com robô") → passa para uma pessoa.
  //    Vem antes do sentimento geral porque é o sinal mais específico (e o motivo registrado
  //    fica certo). Pedir "falar com vendas/atendente" NÃO entra aqui: isso é transferência de
  //    setor e o roteamento resolve — o bot continua respondendo.
  if (enabledRules.includes("cliente_pede_humano") && sentimento.rejeitaBot) {
    return "cliente_pede_humano";
  }

  // 2. Cliente muito irritado/insatisfeito com o atendimento → passa para uma pessoa.
  if (enabledRules.includes("sentimento_negativo") && sentimento.motivador) {
    return "sentimento_negativo";
  }

  // 3. Pedido de humano que se repete muito, mesmo sem irritação explícita.
  //    O mínimo é 2: uma menção isolada é pergunta, não pedido.
  if (enabledRules.includes("cliente_pede_humano")) {
    const necessarios = Math.max(PEDIDOS_ATE_TRANSBORDAR, pedidosNecessarios ?? PEDIDOS_ATE_TRANSBORDAR);
    const pedidos = conversa.filter(pedeHumano).length;
    if (pedidos >= necessarios) return "cliente_pede_humano";
  }

  if (enabledRules.includes("fora_do_horario") && !withinBusinessHours) {
    return "fora_do_horario";
  }

  if (enabledRules.includes("falhas_seguidas") && consecutiveFailures >= 3) {
    return "falhas_seguidas";
  }

  return null;
}

/**
 * Pedido explícito de uma pessoa do time (usado só como reforço do transbordo; o roteamento
 * para outro agente acontece antes, no motor).
 */
const HUMANO = [
  "falar com um atendente",
  "falar com atendente",
  "falar com um humano",
  "falar com humano",
  "atendimento humano",
  "quero um atendente",
  "quero atendente",
  "me passa para um atendente",
  "falar com alguém",
  "falar com alguem",
  "falar com uma pessoa",
  "supervisor",
];

export function pedeHumano(texto: string): boolean {
  const lower = String(texto ?? "").toLowerCase();
  return HUMANO.some((k) => lower.includes(k));
}

/**
 * Handoff não é para sempre.
 *
 * Quando o transbordo é automático (regra de palavra-chave ou a própria IA chamando
 * `derivar_para_atendente`) e **ninguém assume a conversa**, o lead que volta a escrever fica
 * no vácuo: o motor para no `bot_active = false` e a mensagem nunca é respondida. Foi o que
 * aconteceu em 07/10/2026 — o lead (dono) escreveu "Ola" e "Oi" e não teve resposta.
 *
 * Regra da retomada, deliberadamente conservadora:
 *  * só vale para conversa **sem `assigned_to`** — se um humano assumiu no CRM, quem manda é ele;
 *  * o relógio conta da última atividade humana: o instante do transbordo (`bot_disabled_at`)
 *    ou a última mensagem escrita por um humano no CRM, o que for mais recente;
 *  * passado `minutos` (config `HANDOFF_AUTO_RESUME_MINUTES`, 0 desliga), a IA volta.
 */
export function avaliarRetomadaAutomatica(params: {
  /** Quando a IA foi desligada nesta conversa. */
  botDisabledAt: string | null;
  /** Última mensagem de humano no CRM depois do transbordo (null = nenhuma). */
  ultimaHumanaEm?: string | null;
  /** Alguém assumiu a conversa? Então não retomamos. */
  assumidaPorHumano: boolean;
  agora?: Date;
  minutos: number;
}): { retomar: boolean; minutosParados: number | null; motivo?: string } {
  const { botDisabledAt, ultimaHumanaEm, assumidaPorHumano, minutos } = params;

  if (!Number.isFinite(minutos) || minutos <= 0) {
    return { retomar: false, minutosParados: null, motivo: "retomada_automatica_desligada" };
  }
  if (assumidaPorHumano) {
    return { retomar: false, minutosParados: null, motivo: "humano_assumiu" };
  }

  const marcos = [botDisabledAt, ultimaHumanaEm]
    .filter((v): v is string => Boolean(v))
    .map((v) => new Date(v).getTime())
    .filter((t) => Number.isFinite(t));
  if (marcos.length === 0) {
    // Sem data de transbordo não dá para medir silêncio: melhor não retomar do que atropelar.
    return { retomar: false, minutosParados: null, motivo: "sem_data_de_transbordo" };
  }

  const agora = (params.agora ?? new Date()).getTime();
  const minutosParados = Math.floor((agora - Math.max(...marcos)) / 60_000);
  return {
    retomar: minutosParados >= minutos,
    minutosParados,
    motivo: minutosParados >= minutos ? undefined : "silencio_curto",
  };
}

/** Texto que entra no prompt para a IA não agir como se nada tivesse acontecido. */
export function avisoRetomada(minutosParados: number): string {
  return [
    "[RETOMADA APÓS TRANSBORDO]",
    `Você havia passado este atendimento para um humano e ninguém respondeu por ${minutosParados} min.`,
    "O cliente voltou a falar: retome o atendimento você mesmo, sem citar sistemas internos",
    "e sem prometer de novo que alguém vai chamar.",
  ].join(" ");
}
