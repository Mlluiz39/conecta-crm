import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificarEquipe } from "@/services/push/push";
import { avaliarLembrete, textoDoLembrete, type ConversaParaLembrete } from "@/services/push/lembretes-regras";

/**
 * Lembrete de follow-up: avisa no celular quais leads estão esperando resposta.
 *
 * A conversa entra quando a última mensagem é nossa e passaram N horas. O mesmo
 * lead não é lembrado de novo antes da janela (`horasEntreLembretes`), marcada em
 * `conversations.last_reminder_at` — sem isso, um cron de 30 em 30 minutos
 * viraria spam e a pessoa desligaria a notificação.
 *
 * Vários leads viram UM aviso: notificação por lead é o caminho mais rápido
 * para o recurso ser desativado.
 */

export type ResultadoLembretes = {
  avaliadas: number;
  pendentes: number;
  notificado: boolean;
  enviadas: number;
  detalhes: { conversa: string; nome: string; horas: number }[];
};

const HORAS_ENTRE_LEMBRETES = 12;
/** Depois disso o lead é assunto de outra conversa, não de notificação. */
const HORAS_MAXIMAS = 24 * 7;

export async function enviarLembretes(params: {
  organizationId: string;
  /** Janela mínima sem resposta, em horas. */
  horas?: number;
  /** Quantas conversas avaliar por rodada. */
  limite?: number;
  /** Não envia nada, só relata (útil para testar sem incomodar). */
  simular?: boolean;
}): Promise<ResultadoLembretes> {
  const horas = Math.max(1, Number(params.horas) || 24);
  const limite = Math.min(200, Math.max(1, Number(params.limite) || 60));
  const supabase = createAdminClient();

  // Candidatas: conversa de lead aberta, com movimento, sem nada muito recente.
  const { data: conversas, error } = await supabase
    .from("conversations")
    .select("id, last_message_at, last_reminder_at, is_internal, status, contact:contacts(name)")
    .eq("organization_id", params.organizationId)
    .eq("is_internal", false)
    .neq("status", "resolvida")
    .not("last_message_at", "is", null)
    // Mais recentes primeiro: se o aviso só couber alguns nomes, que sejam os
    // que a pessoa ainda tem na cabeça.
    .order("last_message_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  if (!conversas || conversas.length === 0) {
    return { avaliadas: 0, pendentes: 0, notificado: false, enviadas: 0, detalhes: [] };
  }

  // Direção da última mensagem de cada conversa (uma consulta por conversa, mas
  // o lote é pequeno e o cron roda a cada meia hora).
  const ultimas = await Promise.all(
    conversas.map(async (c) => {
      const { data } = await supabase
        .from("messages")
        .select("direction, created_at")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { conversa: c, ultima: data };
    }),
  );

  const agora = Date.now();
  const pendentes: (ConversaParaLembrete & { horasSemResposta: number })[] = [];

  for (const { conversa, ultima } of ultimas) {
    const nome = (conversa as unknown as { contact?: { name?: string } }).contact?.name ?? "Lead";
    const avaliacao = avaliarLembrete(
      {
        conversationId: conversa.id,
        contactName: nome,
        ultimaMensagemEm: String(ultima?.created_at ?? conversa.last_message_at),
        ultimaDirecao: (ultima?.direction as "in" | "out" | undefined) ?? null,
        lembradoEm: (conversa as { last_reminder_at?: string | null }).last_reminder_at ?? null,
      },
      agora,
      horas,
      HORAS_ENTRE_LEMBRETES,
      HORAS_MAXIMAS,
    );
    if (avaliacao.incluir) {
      pendentes.push({
        conversationId: conversa.id,
        contactName: nome,
        ultimaMensagemEm: String(ultima?.created_at ?? conversa.last_message_at),
        ultimaDirecao: "out",
        horasSemResposta: avaliacao.horasSemResposta,
      });
    }
  }

  if (pendentes.length === 0) {
    return { avaliadas: conversas.length, pendentes: 0, notificado: false, enviadas: 0, detalhes: [] };
  }

  const texto = textoDoLembrete(pendentes);
  let enviadas = 0;
  if (!params.simular && texto) {
    const r = await notificarEquipe(params.organizationId, {
      titulo: texto.titulo,
      corpo: texto.corpo,
      url: texto.url,
      tag: "lembrete-followup",
    });
    enviadas = r.enviadas;
  }

  // Marca como lembradas (mesmo sem push entregue: o aviso já foi emitido e não
  // deve repetir a cada rodada).
  if (!params.simular) {
    const agoraIso = new Date(agora).toISOString();
    await supabase
      .from("conversations")
      .update({ last_reminder_at: agoraIso })
      .in("id", pendentes.map((p) => p.conversationId));
  }

  return {
    avaliadas: conversas.length,
    pendentes: pendentes.length,
    notificado: enviadas > 0,
    enviadas,
    detalhes: pendentes.slice(0, 20).map((p) => ({
      conversa: p.conversationId,
      nome: p.contactName,
      horas: p.horasSemResposta,
    })),
  };
}
