/**
 * Regras puras do lembrete de follow-up (testáveis sem banco).
 *
 * O que conta como "esperando resposta": a última mensagem da conversa é nossa
 * e já passou tempo suficiente. Quem respondeu não entra, e quem já foi
 * lembrado dentro da janela também não.
 */

export type ConversaParaLembrete = {
  conversationId: string;
  contactName: string;
  /** Timestamp da última mensagem da conversa. */
  ultimaMensagemEm: string;
  /** 'in' = do lead, 'out' = nossa. */
  ultimaDirecao: "in" | "out" | null;
  /** Última vez que o time foi lembrado desta conversa. */
  lembradoEm?: string | null;
};

export type MotivoDeDescarte = "sem_mensagem" | "lead_respondeu" | "lembrado_ha_pouco" | "antiga_demais";

export type AvaliacaoLembrete =
  | { incluir: true; horasSemResposta: number }
  | { incluir: false; motivo: MotivoDeDescarte };

/**
 * Decide se a conversa entra no lembrete.
 * @param conversa dados da conversa
 * @param agora timestamp atual (ms)
 * @param horasSemResposta janela mínima sem resposta
 * @param horasEntreLembretes intervalo mínimo entre dois lembretes da mesma conversa
 * @param horasMaximas teto de idade: conversa esquecida há muito tempo não deve
 *   apitar para sempre (o lead antigo já não é prioridade e o aviso vira ruído)
 */
export function avaliarLembrete(
  conversa: ConversaParaLembrete,
  agora: number,
  horasSemResposta: number,
  horasEntreLembretes: number,
  horasMaximas = 24 * 7,
): AvaliacaoLembrete {
  if (!conversa.ultimaDirecao) return { incluir: false, motivo: "sem_mensagem" };
  if (conversa.ultimaDirecao === "in") return { incluir: false, motivo: "lead_respondeu" };

  const ultima = new Date(conversa.ultimaMensagemEm).getTime();
  if (!Number.isFinite(ultima)) return { incluir: false, motivo: "sem_mensagem" };

  const horas = (agora - ultima) / 3_600_000;
  if (horas < horasSemResposta) return { incluir: false, motivo: "sem_mensagem" };
  if (horas > horasMaximas) return { incluir: false, motivo: "antiga_demais" };

  if (conversa.lembradoEm) {
    const lembrado = new Date(conversa.lembradoEm).getTime();
    if (Number.isFinite(lembrado) && agora - lembrado < horasEntreLembretes * 3_600_000) {
      return { incluir: false, motivo: "lembrado_ha_pouco" };
    }
  }

  return { incluir: true, horasSemResposta: Math.floor(horas) };
}

/**
 * Texto da notificação. Vários leads viram UM aviso (senão o celular recebe
 * uma notificação por lead e a pessoa desliga o recurso na primeira semana).
 */
export function textoDoLembrete(
  conversas: { contactName: string; horasSemResposta: number }[],
  limiteNomes = 3,
): { titulo: string; corpo: string; url: string } | null {
  if (conversas.length === 0) return null;

  if (conversas.length === 1) {
    const [unica] = conversas;
    return {
      titulo: `⏰ ${unica.contactName} está sem resposta`,
      corpo: `Já são ${unica.horasSemResposta}h desde a nossa última mensagem. Tocar abre a conversa.`,
      url: "/conversas",
    };
  }

  const nomes = conversas.slice(0, limiteNomes).map((c) => c.contactName);
  const restantes = conversas.length - nomes.length;
  const lista = nomes.join(", ") + (restantes > 0 ? ` e mais ${restantes}` : "");

  return {
    titulo: `⏰ ${conversas.length} leads esperando resposta`,
    corpo: `${lista}. Tocar abre a caixa de entrada.`,
    url: "/conversas",
  };
}
