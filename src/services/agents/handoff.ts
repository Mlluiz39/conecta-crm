import type { HandoffRuleKey } from "@/types/domain";

/**
 * Palavras que sinalizam pedido de humano.
 *
 * "gerente" e "pessoa" saíram da lista: são palavras do dia a dia ("uma pessoa me indicou
 * vocês", "o gerente de vocês") e desligavam o atendimento por nada. Ficaram só as que
 * realmente pedem uma pessoa do time.
 */
const HUMAN_KEYWORDS = [
  "atendente",
  "humano",
  "atendimento humano",
  "falar com alguém",
  "falar com alguem",
  "supervisor",
];

/** Quem pede humano uma vez está perguntando; quem pede duas está pedindo. */
export const PEDIDOS_ATE_TRANSBORDAR = 2;

export function pedeHumano(texto: string): boolean {
  const lower = String(texto ?? "").toLowerCase();
  return HUMAN_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Mensagem de espera enviada ao lead quando o transbordo automático acontece.
 *
 * Transbordar sem avisar deixava o lead no vácuo (silêncio depois de pedir uma pessoa) —
 * e é isso que trava a conversa na cabeça dele. Ele recebe isto e a conversa vai para o
 * humano, que é avisado no Telegram.
 */
export function mensagemDeTransbordo(): string {
  return "Já chamei uma pessoa do time para continuar daqui — só um instante, por favor.";
}

export function evaluateHandoff(params: {
  enabledRules: HandoffRuleKey[];
  message: string;
  consecutiveFailures: number;
  withinBusinessHours: boolean;
  /**
   * Mensagens anteriores do lead nesta conversa (mais antiga primeiro), sem a atual.
   * Serve para contar quantas vezes ele já pediu humano.
   */
  historicoInbound?: string[];
  /** Quantas menções disparam o transbordo (1 = desliga na primeira, como era antes). */
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

  if (enabledRules.includes("cliente_pede_humano")) {
    // Só transborda quando o pedido se repete: na primeira menção a IA continua atendendo
    // (e pode resolver), em vez de calar a conversa. Config: HANDOFF_HUMANO_PEDIDOS.
    const necessarios = Math.max(1, pedidosNecessarios ?? PEDIDOS_ATE_TRANSBORDAR);
    const mencoes = [...(historicoInbound ?? []), message].filter(pedeHumano).length;
    if (mencoes >= necessarios) return "cliente_pede_humano";
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
