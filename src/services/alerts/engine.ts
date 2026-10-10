import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyTemperature,
  commercialRiskHits,
  firstMatch,
  matchGroups,
} from "@/services/prospecting/keywords";
import { applyContactTemperature } from "@/services/prospecting/temperature";

/**
 * Alertas em tempo real para o Telegram (quando você não está no PC):
 *  - lead_contatado  → primeira abordagem enviada
 *  - lead_respondeu  → lead respondeu a abordagem
 *  - quer_fechar     → lead demonstrou intenção de fechar/contratar
 *  - call_marcada    → visita/call agendada
 *
 * O detector grava em `alerts` de forma idempotente (dedupe_key) e o notificador
 * envia o que ainda não foi avisado.
 */

export type AlertType =
  | "lead_contatado"
  | "lead_respondeu"
  | "quer_orcamento"
  | "quer_call"
  | "quer_fechar"
  | "lead_quente"
  | "risco_comercial"
  | "pediu_humano"
  | "call_marcada";

const LOOKBACK_DAYS = 3;
/** Eventos mais antigos que isso entram como histórico (não disparam mensagem). */
const FRESH_MINUTES = 15;



export type AlertConfig = {
  telegramEnabled: boolean;
  chatId: string | null;
  botName: string | null;
  /** Variáveis que faltam quando o Telegram está desligado (vira mensagem no /api/cron/alerts). */
  missing: string[];
};

/**
 * Config do Telegram dos alertas.
 *
 * O CRM tem o **próprio bot** (criado no @BotFather só para ele): a credencial vem das
 * variáveis do CRM (`TELEGRAM_BOT_TOKEN` + `ALERTS_TELEGRAM_CHAT_ID`), e de mais nenhum
 * lugar. Já existiu um fallback para o `.env` de um gateway externo; ele fazia o alerta
 * sair pelo bot errado sem ninguém perceber — bastava um alias sem `TELEGRAM_CHAT_ID`
 * para o alerta sumir em silêncio.
 */
export function alertConfig(): AlertConfig {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const chatId = (process.env.ALERTS_TELEGRAM_CHAT_ID ?? "").trim();
  const missing = [
    ...(token ? [] : ["TELEGRAM_BOT_TOKEN"]),
    ...(chatId ? [] : ["ALERTS_TELEGRAM_CHAT_ID"]),
  ];
  return {
    telegramEnabled: missing.length === 0,
    chatId: chatId || null,
    // o prefixo numérico do token É o id do bot — dá para conferir no Telegram qual bot enviou
    botName: token ? `bot ${token.split(":")[0]}` : null,
    missing,
  };
}

/**
 * Escapa o que o Telegram (parse_mode HTML) interpreta como marcação.
 *
 * Histórico: usávamos `parse_mode: "Markdown"` (legado). O texto do lead é dinâmico e
 * truncado em 160 caracteres — quando o corte caía no meio de uma entidade, o Telegram
 * devolvia `400 can't parse entities: Can't find end of the entity` e o alerta se perdia
 * (3 alertas assim em 06/10, comprovado reproduzindo a chamada). HTML só precisa de
 * &, < e > escapados e sobrevive a truncamento — por isso a troca.
 */
function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function telegramToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
}

export type DetectResult = {
  detected: number;
  byType: Record<string, number>;
};

/**
 * Varre os últimos dias e registra os alertas que ainda não existem.
 * Eventos antigos entram já marcados como notificados (viram histórico).
 */
export async function detectAlerts(organizationId: string): Promise<DetectResult> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const now = new Date();
  const freshLimit = new Date(now.getTime() - FRESH_MINUTES * 60_000);

  const result: DetectResult = { detected: 0, byType: {} };

  // ── dados base ───────────────────────────────────────────────────────
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, channel_type, is_internal, bot_active, handoff_reason, bot_disabled_at, contact:contacts(id, name, phone, email)")
    .eq("organization_id", organizationId)
    // Conversa interna (dono falando com o agente pelo Telegram) não gera alerta de lead.
    .eq("is_internal", false);
  const convById = new Map((conversations ?? []).map((c) => [String(c.id), c]));

  const { data: messages } = await supabase
    .from("messages")
    .select("id, conversation_id, direction, sender_type, content, created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, title, starts_at, created_at, contact:contacts(id, name)")
    .eq("organization_id", organizationId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  type Pending = {
    type: AlertType;
    conversationId?: string;
    contactId?: string | null;
    messageId?: string;
    appointmentId?: string;
    dedupeKey: string;
    title: string;
    body: string | null;
    payload: Record<string, unknown>;
    eventAt: string;
  };
  const pending: Pending[] = [];

  // ── lead contatado / lead respondeu / quer fechar ────────────────────
  const byConversation = new Map<string, typeof messages>();
  for (const m of messages ?? []) {
    const key = String(m.conversation_id);
    byConversation.set(key, [...(byConversation.get(key) ?? []), m]);
  }

  for (const [convId, msgs] of byConversation) {
    const conv = convById.get(convId);
    // Conversa que não está no mapa é interna (a query acima filtra `is_internal`) ou de outra
    // origem: sem conversa não há lead — antes isso virava alerta "Contato" fantasma.
    if (!conv) continue;
    const contact = (conv as { contact?: { id?: string; name?: string; phone?: string | null; email?: string | null } } | null)
      ?.contact;
    const contactName = contact?.name ?? contact?.phone ?? contact?.email ?? "Contato";
    const channel = (conv as { channel_type?: string } | undefined)?.channel_type ?? "whatsapp";

    const firstOut = msgs?.find((m) => m.direction === "out");
    const inbound = (msgs ?? []).filter((m) => m.direction === "in");
    // "respondeu" = primeira entrada DEPOIS da primeira abordagem nossa
    const firstReply =
      firstOut && inbound.find((m) => new Date(m.created_at) > new Date(firstOut.created_at));

    if (firstOut) {
      pending.push({
        type: "lead_contatado",
        conversationId: convId,
        contactId: contact?.id ?? null,
        messageId: String(firstOut.id),
        dedupeKey: `contatado:${convId}`,
        title: `Lead contatado — ${contactName}`,
        body: String(firstOut.content ?? "").slice(0, 200),
        payload: { canal: channel, contacto: contactName },
        eventAt: String(firstOut.created_at),
      });
    }

    // respondeu: primeira entrada depois da abordagem
    if (firstReply) {
      pending.push({
        type: "lead_respondeu",
        conversationId: convId,
        contactId: contact?.id ?? null,
        messageId: String(firstReply.id),
        dedupeKey: `respondeu:${convId}`,
        title: `Lead respondeu — ${contactName}`,
        body: String(firstReply.content ?? "").slice(0, 300),
        payload: { canal: channel, contacto: contactName },
        eventAt: String(firstReply.created_at),
      });
    }

    // ── UM alerta por mensagem do lead, com todos os sinais juntos ──────
    // (antes cada sinal virava um alerta e o Telegram recebia vários do mesmo lead)
    const inboundTexts = inbound.map((m) => String(m.content ?? ""));

    // temperatura do lead (automática) — calculada uma vez por conversa
    let temperature: "frio" | "morno" | "quente" | null = null;
    let tempReasons: string[] = [];
    let tempChanged = false;
    let tempPrevious: string | null = null;
    if (contact?.id && inboundTexts.length > 0) {
      const classified = classifyTemperature(inboundTexts);
      temperature = classified.temperature;
      tempReasons = classified.reasons;
      const change = await applyContactTemperature(contact.id, temperature);
      tempChanged = change.changed;
      tempPrevious = change.previous;
    }

    // Só a última mensagem do lead vira alerta (evita 10 alertas de uma vez
    // quando ele manda várias). Os sinais dela definem o tipo do alerta.
    const lastInbound = inbound.length > 0 ? inbound[inbound.length - 1] : null;
    for (const m of lastInbound ? [lastInbound] : []) {
      const text = String(m.content ?? "");
      if (!text.trim()) continue;
      const groups = matchGroups(text);

      // prioridade: fechamento > call > orçamento > resposta comum
      const kind: { type: AlertType; icon: string; label: string; gatilho?: string | null } =
        groups.includes("fechamento")
          ? { type: "quer_fechar", icon: "🔥", label: "Quer fechar", gatilho: firstMatch(text, "fechamento") }
          : groups.includes("call")
            ? { type: "quer_call", icon: "📞", label: "Quer uma call", gatilho: firstMatch(text, "call") }
            : groups.includes("orcamento")
              ? { type: "quer_orcamento", icon: "💰", label: "Quer orçamento", gatilho: firstMatch(text, "orcamento") }
              : { type: "lead_respondeu", icon: "💬", label: "Respondeu", gatilho: null };

      // extras que entram no MESMO alerta
      const extras: string[] = [];
      if (kind.type === "quer_fechar" && groups.includes("call")) extras.push("também quer call");
      if (kind.type === "quer_fechar" && groups.includes("orcamento")) extras.push("pediu orçamento");
      if (kind.type === "quer_call" && groups.includes("orcamento")) extras.push("pediu orçamento");

      // chave estável: mudar de temperatura não pode gerar o mesmo alerta duas vezes
      const dedupeKey = `msg:${m.id}`;

      pending.push({
        type: kind.type,
        conversationId: convId,
        contactId: contact?.id ?? null,
        messageId: String(m.id),
        dedupeKey,
        title: `${kind.icon} ${kind.label} — ${contactName}${extras.length ? ` (${extras.join(", ")})` : ""}`,
        body: text.slice(0, 400),
        payload: {
          canal: channel,
          contacto: contactName,
          gatilho: kind.gatilho ?? null,
          temperatura: temperature,
        },
        eventAt: String(m.created_at),
      });

      // primeira resposta da conversa → marca que entrou em prospecção (no próprio alerta)
      if (firstReply && String(firstReply.id) === String(m.id) && firstOut) {
        pending[pending.length - 1].payload.em_prospeccao = true;
      }
    }

    // Mudança de temperatura sem mensagem nova (ex.: esfriou por falta de resposta)
    if (temperature && tempChanged && inbound.length === 0) {
      const wentHot = temperature === "quente";
      const wentCold = temperature === "frio" && (tempPrevious === "quente" || tempPrevious === "morno");
      if (wentHot || wentCold) {
        pending.push({
          type: "lead_quente",
          conversationId: convId,
          contactId: contact?.id ?? null,
          dedupeKey: `temperatura:${contact?.id}:${temperature}:${new Date().toISOString().slice(0, 10)}`,
          title: wentHot ? `🔥 Lead quente — ${contactName}` : `❄️ Lead esfriou — ${contactName}`,
          body: tempReasons.length > 0 ? tempReasons.join(" · ") : `classificado como ${temperature}`,
          payload: { canal: channel, contacto: contactName, temperatura: temperature },
          eventAt: new Date().toISOString(),
        });
      }
    }

  }

  // ── RISCO COMERCIAL: o agente prometeu algo que só o dono decide? ────
  // (preço, desconto, prazo, boleto/pix, "fechado") — alerta imediato.
  for (const m of messages ?? []) {
    if (m.direction !== "out" || m.sender_type !== "agent_ai") continue;
    const text = String(m.content ?? "");
    const hits = commercialRiskHits(text);
    if (hits.length === 0) continue;

    // Mesma regra do laço principal: sem conversa no mapa (interna ou fora da organização)
    // não existe lead para alertar. Antes este laço ignorava o mapa e virava alerta
    // "Contato" fantasma — inclusive na conversa do dono com o gerente.
    const conv = convById.get(String(m.conversation_id));
    if (!conv) continue;
    const contact = (conv as { contact?: { id?: string; name?: string } } | null)?.contact;
    const nome = contact?.name ?? "Contato";
    const canal = (conv as { channel_type?: string }).channel_type ?? "whatsapp";

    pending.push({
      type: "risco_comercial",
      conversationId: String(m.conversation_id),
      contactId: contact?.id ?? null,
      messageId: String(m.id),
      dedupeKey: `risco:${m.id}`,
      title: `🚨 Possível promessa indevida — ${nome}`,
      body: `${hits.join(", ")} → "${text.slice(0, 180).replace(/\s+/g, " ")}"`,
      payload: { canal, contacto: nome, termos: hits },
      eventAt: String(m.created_at),
    });
  }

  // ── PEDIU HUMANO: a IA saiu da conversa e ninguém assumiu ainda ──────
  // Vale para transbordo por regra e para a própria IA chamando `derivar_para_atendente`.
  // É o par do freio no transbordo: ele só desliga quando precisa — e quando desliga, você
  // é avisado na hora em vez de descobrir depois que o lead esperou.
  for (const conversation of conversations ?? []) {
    const c = conversation as {
      id: string;
      channel_type?: string;
      bot_active?: boolean;
      handoff_reason?: string | null;
      bot_disabled_at?: string | null;
      contact?: { id?: string; name?: string; phone?: string | null; email?: string | null } | null;
    };
    if (c.bot_active !== false || !c.handoff_reason || !c.bot_disabled_at) continue;
    if (new Date(c.bot_disabled_at) < new Date(since)) continue;

    const nome = c.contact?.name ?? c.contact?.phone ?? c.contact?.email ?? "Contato";
    pending.push({
      type: "pediu_humano",
      conversationId: c.id,
      contactId: c.contact?.id ?? null,
      dedupeKey: `handoff:${c.id}:${c.bot_disabled_at}`,
      title: `🙋 Pediu atendimento humano — ${nome}`,
      body: "A IA saiu da conversa e ninguém assumiu ainda. Abra Conversas e responda o lead.",
      payload: { canal: c.channel_type ?? "whatsapp", contacto: nome, motivo: c.handoff_reason },
      eventAt: c.bot_disabled_at,
    });
  }

  // ── call/visita agendada ─────────────────────────────────────────────
  for (const appt of appointments ?? []) {    const contact = (appt as { contact?: { id?: string; name?: string } | null }).contact;
    pending.push({
      type: "call_marcada",
      contactId: contact?.id ?? null,
      appointmentId: String(appt.id),
      dedupeKey: `call:${appt.id}`,
      title: `📅 Call agendada — ${contact?.name ?? appt.title ?? "Contato"}`,
      body: `${appt.title ?? "Compromisso"} em ${new Date(String(appt.starts_at)).toLocaleString("pt-BR")}`,
      payload: { inicio: String(appt.starts_at) },
      eventAt: String(appt.created_at),
    });
  }

  if (pending.length === 0) return result;

  // Novos eventos (≤ FRESH_MINUTES) ficam pendentes de notificação; os antigos
  // entram como histórico (já notificados) para não disparar uma rajada.
  const rows = pending.map((p) => ({
    organization_id: organizationId,
    type: p.type,
    contact_id: p.contactId ?? null,
    conversation_id: p.conversationId ?? null,
    message_id: p.messageId ?? null,
    appointment_id: p.appointmentId ?? null,
    dedupe_key: p.dedupeKey,
    title: p.title,
    body: p.body,
    payload: p.payload,
    created_at: p.eventAt,
    notified_at: new Date(p.eventAt) < freshLimit ? now.toISOString() : null,
  }));

  const { data: inserted } = await supabase
    .from("alerts")
    .upsert(rows, { onConflict: "organization_id,dedupe_key", ignoreDuplicates: true })
    .select("id, type, notified_at");

  result.detected = inserted?.length ?? 0;
  for (const row of inserted ?? []) {
    result.byType[row.type] = (result.byType[row.type] ?? 0) + 1;
  }
  return result;
}

export type NotifyResult = {
  sent: number;
  failed: number;
  skipped: boolean;
  reason?: string;
  /** Alertas agrupados em uma única mensagem (por contato) */
  grouped?: number;
};

/**
 * Envia os alertas pendentes para o Telegram.
 *
 * Duas proteções contra aviso repetido:
 *  1. **claim atômico** — o alerta é marcado como notificado ANTES do envio
 *     (`update ... where notified_at is null returning id`), então duas execuções
 *     simultâneas (loop + botão) não mandam a mesma coisa duas vezes;
 *  2. **agrupamento por contato** — vários eventos do mesmo lead viram UMA mensagem.
 */
export async function notifyAlerts(
  organizationId: string,
  limit = 20,
): Promise<NotifyResult> {
  const config = alertConfig();
  if (!config.telegramEnabled) {
    return {
      sent: 0,
      failed: 0,
      skipped: true,
      reason: `Telegram não configurado (falta ${config.missing.join(", ")} no .env do CRM)`,
    };
  }

  const supabase = createAdminClient();
  const { data: pending } = await supabase
    .from("alerts")
    .select("id, type, title, body, payload, created_at, contact_id, conversation:conversations(id, is_internal)")
    .eq("organization_id", organizationId)
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!pending || pending.length === 0) return { sent: 0, failed: 0, skipped: false };

  /**
   * Conversa interna (dono falando com o gerente pelo Telegram) nunca vira alerta no celular
   * dele. Marcar como notificado aqui é a segunda barreira: se um alerta desses aparecer — o
   * que acontece quando uma instância antiga do CRM ainda escreve no mesmo banco — ele morre
   * aqui em vez de chegar no Telegram.
   */
  const daConversaInterna = (a: (typeof pending)[number]) =>
    Boolean((a as { conversation?: { is_internal?: boolean } | null }).conversation?.is_internal);
  const internos = pending.filter(daConversaInterna);
  if (internos.length > 0) {
    await supabase
      .from("alerts")
      .update({ notified_at: new Date().toISOString() })
      .in("id", internos.map((a) => String(a.id)));
    console.warn(`[alerts] ${internos.length} alerta(s) de conversa interna ignorado(s)`);
  }
  const paraEnviar = pending.filter((a) => !daConversaInterna(a));
  if (paraEnviar.length === 0) return { sent: 0, failed: 0, skipped: false };

  // agrupa por contato (ou por id quando não houver contato)
  const groups = new Map<string, typeof pending>();
  for (const alert of paraEnviar) {
    const key = alert.contact_id ? String(alert.contact_id) : `alert:${alert.id}`;
    groups.set(key, [...(groups.get(key) ?? []), alert]);
  }

  let sent = 0;
  let failed = 0;

  for (const [, alerts] of groups) {
    const ids = alerts.map((a) => String(a.id));
    const stamp = new Date().toISOString();

    // claim: só quem conseguir marcar envia
    const { data: claimed } = await supabase
      .from("alerts")
      .update({ notified_at: stamp })
      .in("id", ids)
      .is("notified_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue; // outra execução já pegou

    const claimedIds = new Set(claimed.map((c) => String(c.id)));
    const mine = alerts.filter((a) => claimedIds.has(String(a.id)));

    const primeiro = mine[0];
    const nome = (primeiro.payload as { contacto?: string } | null)?.contacto ?? primeiro.title;
    const linhas: string[] = [];
    linhas.push(
      mine.length > 1
        ? `<b>${escaparHtml(nome)} — ${mine.length} novidades</b>`
        : `<b>${escaparHtml(nome)}</b>`,
    );

    for (const alert of mine) {
      // rótulo = parte do título antes do travessão (ex.: "📞 Quer uma call")
      const label = escaparHtml(String(alert.title).split(" — ")[0].trim());
      const texto = String(alert.body ?? "").trim().replace(/\s+/g, " ");
      linhas.push(
        texto ? `• ${label}\n  <i>"${escaparHtml(texto.slice(0, 160))}"</i>` : `• ${label}`,
      );
    }

    linhas.push(
      `<i>${new Date(String(primeiro.created_at)).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })}</i>`,
    );

    const res = await fetch(`https://api.telegram.org/bot${telegramToken()}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: linhas.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch((e) => ({ ok: false, statusText: (e as Error).message }) as Response);

    if (res.ok) {
      sent++;
      // limpa erro de tentativas anteriores (senão a coluna fica mentindo no futuro)
      await supabase.from("alerts").update({ notify_error: null }).in("id", ids);
    } else {
      failed++;
      // devolve para a fila (tenta de novo na próxima rodada)
      await supabase
        .from("alerts")
        .update({
          notified_at: null,
          notify_error: `HTTP ${res.status ?? "?"} ${res.statusText ?? ""}`.slice(0, 200),
        })
        .in("id", ids);
    }
  }

  return { sent, failed, skipped: false, grouped: pending.length };
}

/** Detecta e notifica em uma chamada (usado pelo cron). */
export async function runAlertsCycle(organizationId: string): Promise<{
  detected: DetectResult;
  notified: NotifyResult;
}> {
  const detected = await detectAlerts(organizationId);
  const notified = await notifyAlerts(organizationId);
  return { detected, notified };
}
