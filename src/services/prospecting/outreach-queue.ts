import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { generateFirstTouch, generateFirstTouchEmail } from "@/services/prospecting/agent-outreach";
import { holidayName } from "./holidays";
import { mergeContext } from "./enrichment";
import {
  ensureEmailConversation,
  ensureProspectConversation,
} from "@/services/prospecting/conversations";

/**
 * Ciclo de disparo da prospecção — pensado para não derrubar o WhatsApp:
 *  - janela de envio (padrão 9h–18h, seg–sáb);
 *  - teto diário de 15 a 20 leads (varia por dia, mas é estável no dia);
 *  - intervalos variados entre envios (não é rajada);
 *  - lead com telefone → WhatsApp; sem telefone e com e-mail → e-mail (Hermes).
 *
 * A fila fica em `outreach_queue` e é a memória do ciclo (quem já foi, quando,
 * por qual canal e com qual mensagem).
 */

export type OutreachBriefing = {
  offer?: string;
  goal?: string;
  notes?: string;
  value?: number;
};

export type OutreachQueueStatus = {
  pendentes: number;
  agendados: number;
  enviadosHoje: number;
  falhas: number;
  tetoHoje: number;
  proximoEnvio: string | null;
  dentroDaJanela: boolean;
  janela: { inicio: number; fim: number };
};

export type OutreachCycleResult = {
  ran: boolean;
  reason?: string;
  sent: number;
  failed: number;
  scheduled: number;
  channels: { whatsapp: number; email: number };
  details: { name: string; channel: string; ok: boolean; error?: string }[];
  nextAt: string | null;
};

/* ─────────────────────────── Configuração ─────────────────────────── */

function windowStart(): number {
  return Number(process.env.OUTREACH_WINDOW_START ?? 9) || 9;
}
function windowEnd(): number {
  return Number(process.env.OUTREACH_WINDOW_END ?? 18) || 18;
}
function minGapMinutes(): number {
  return Math.max(1, Number(process.env.OUTREACH_MIN_GAP_MIN ?? 5) || 5);
}

/** Teto do dia: 15 a 20 (varia por dia, estável dentro do mesmo dia). */
export function dailyTarget(date = new Date()): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return 15 + (dayOfYear % 6); // 15..20
}

/** Está dentro da janela de envio? (dias úteis: seg–sáb) */
export function insideWindow(date = new Date()): boolean {
  const dow = date.getDay(); // 0=dom
  if (dow === 0) return false;
  if (holidayName(date)) return false; // feriado: ninguém no trabalho para ler
  const hour = date.getHours() + date.getMinutes() / 60;
  return hour >= windowStart() && hour < windowEnd();
}

/** Próximo horário válido (hoje ou no próximo dia útil). */
export function nextWindowStart(date = new Date()): Date {
  const start = windowStart();
  const candidate = new Date(date);
  candidate.setMinutes(0, 0, 0);
  candidate.setHours(start);
  if (candidate <= date) candidate.setDate(candidate.getDate() + 1);
  while (candidate.getDay() === 0 || holidayName(candidate)) candidate.setDate(candidate.getDate() + 1);
  return candidate;
}

/**
 * Gera o próximo horário de disparo com intervalo variado:
 * distribui o que falta hoje até o fim da janela, com jitter de ±40%.
 */
export function nextSlot(now: Date, remainingToday: number): Date {
  const end = new Date(now);
  end.setHours(windowEnd(), 0, 0, 0);

  // Fora do horário útil (janela já fechou): o próximo disparo é no próximo
  // dia útil, no início da janela.
  if (end <= now || !insideWindow(now)) {
    return nextWindowStart(now);
  }

  const minutesLeft = Math.max(1, Math.floor((end.getTime() - now.getTime()) / 60_000));
  const slots = Math.max(1, remainingToday);
  const base = minutesLeft / slots;
  const jitter = 0.6 + Math.random() * 0.8; // 0,6x a 1,4x
  const gap = Math.max(minGapMinutes(), Math.round(base * jitter));

  const when = new Date(now.getTime() + gap * 60_000);
  return when > end ? end : when;
}

/* ─────────────────────────── Fila ─────────────────────────── */

/** Coloca contatos na fila (reenfileirar reinicia o item, sem duplicar). */
export async function enqueueOutreach(params: {
  organizationId: string;
  contactIds: string[];
  briefing?: OutreachBriefing;
}): Promise<{ queued: number; skipped: number }> {
  const supabase = createAdminClient();
  const ids = (params.contactIds ?? []).filter(Boolean).slice(0, 500);
  if (ids.length === 0) return { queued: 0, skipped: 0 };

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, phone, email")
    .eq("organization_id", params.organizationId)
    .in("id", ids);

  const rows = (contacts ?? [])
    .filter((c) => c.phone || c.email)
    .map((c) => ({
      organization_id: params.organizationId,
      contact_id: c.id,
      status: "pendente",
      channel: c.phone ? "whatsapp" : "email",
      scheduled_at: null,
      sent_at: null,
      attempts: 0,
      last_error: null,
      briefing: params.briefing ?? {},
    }));

  if (rows.length === 0) return { queued: 0, skipped: ids.length };

  const { data, error } = await supabase
    .from("outreach_queue")
    .upsert(rows, { onConflict: "organization_id,contact_id" })
    .select("id");
  if (error) throw new Error(error.message);

  return { queued: data?.length ?? 0, skipped: ids.length - rows.length };
}

/** Situação da fila para a tela. */
export async function outreachStatus(organizationId: string): Promise<OutreachQueueStatus> {
  const supabase = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const now = new Date();

  const { data: rows } = await supabase
    .from("outreach_queue")
    .select("status, scheduled_at, sent_at")
    .eq("organization_id", organizationId);

  const list = rows ?? [];
  const enviadosHoje = list.filter(
    (r) => r.status === "enviado" && r.sent_at && new Date(r.sent_at) >= startOfDay,
  ).length;
  const agendados = list.filter((r) => r.status === "pendente" && r.scheduled_at);
  const proximo = agendados
    .map((r) => new Date(String(r.scheduled_at)))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  return {
    pendentes: list.filter((r) => r.status === "pendente").length,
    agendados: agendados.length,
    enviadosHoje,
    falhas: list.filter((r) => r.status === "falhou").length,
    tetoHoje: dailyTarget(now),
    proximoEnvio: proximo ? proximo.toISOString() : null,
    dentroDaJanela: insideWindow(now),
    janela: { inicio: windowStart(), fim: windowEnd() },
  };
}

/* ─────────────────────────── Ciclo ─────────────────────────── */

async function sendOne(
  organizationId: string,
  item: {
    id: string;
    contact_id: string;
    briefing: OutreachBriefing | null;
    contact: {
      id: string;
      name: string | null;
      phone: string | null;
      email: string | null;
      custom_fields?: Record<string, unknown> | null;
    } | null;
  },
): Promise<{ ok: boolean; channel: string; messageId?: string; conversationId?: string; error?: string }> {
  const supabase = createAdminClient();
  const contact = item.contact;
  if (!contact) return { ok: false, channel: "?", error: "contato não encontrado" };

  const lead = {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    // o enriquecimento do Google Maps entra aqui: um detalhe real para personalizar a abordagem
    context: mergeContext(null, contact.custom_fields ?? null),
  };
  const briefing = item.briefing ?? {};

  // 1) WhatsApp quando tem telefone
  if (contact.phone) {
    const { data: chan } = await supabase
      .from("channels")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("type", "whatsapp")
      .eq("status", "conectado")
      .limit(1)
      .maybeSingle();
    if (!chan) return { ok: false, channel: "whatsapp", error: "WhatsApp não conectado" };

    const conv = await ensureProspectConversation(supabase, {
      organizationId,
      contactId: contact.id,
      channelId: chan.id,
      phone: contact.phone,
    });
    if (!conv) return { ok: false, channel: "whatsapp", error: "falha ao abrir a conversa" };

    const { text } = await generateFirstTouch(lead, briefing);
    const { data: msg, error } = await supabase
      .from("messages")
      .insert({
        organization_id: organizationId,
        conversation_id: conv.id,
        direction: "out",
        sender_type: "agent_ai",
        content: text,
        status: "pendente", // o flushOutbox envia respeitando o anti-flood
      })
      .select("id")
      .single();
    if (error) return { ok: false, channel: "whatsapp", error: error.message };

    const { flushOutbox } = await import("@/services/messaging/inbound.service");
    const sent = await flushOutbox(1).catch(() => 0);

    return {
      ok: sent > 0,
      channel: "whatsapp",
      messageId: msg?.id,
      conversationId: conv.id,
      error: sent > 0 ? undefined : "não saiu pelo outbox",
    };
  }

  // 2) E-mail quando só tem e-mail
  if (contact.email) {
    const { sendEmailViaHermes, hermesEmailStatus } = await import("@/services/email/hermes-email");
    if (!hermesEmailStatus().configured) {
      return { ok: false, channel: "email", error: "e-mail do Hermes não configurado" };
    }

    const { subject, body } = await generateFirstTouchEmail(lead, briefing);
    const result = await sendEmailViaHermes({ to: contact.email, subject, text: body });
    if (!result.ok) return { ok: false, channel: "email", error: result.error };

    const mailConv = await ensureEmailConversation(supabase, {
      organizationId,
      contactId: contact.id,
      email: contact.email,
    });
    let messageId: string | undefined;
    if (mailConv) {
      const { data: msg } = await supabase
        .from("messages")
        .insert({
          organization_id: organizationId,
          conversation_id: mailConv.id,
          direction: "out",
          sender_type: "agent_ai",
          content: `Assunto: ${subject}\n\n${body}`,
          status: "entregue",
          external_id: `hermes_email_${Date.now()}`,
        })
        .select("id")
        .single();
      messageId = msg?.id;
    }
    return { ok: true, channel: "email", messageId, conversationId: mailConv?.id };
  }

  return { ok: false, channel: "?", error: "contato sem telefone e sem e-mail" };
}

/**
 * Roda um ciclo: envia o que está vencido (dentro da janela e do teto diário) e
 * agenda os próximos com intervalo variado. `force` ignora janela/teto (teste).
 */
export async function runOutreachCycle(params: {
  organizationId: string;
  force?: boolean;
  limit?: number;
}): Promise<OutreachCycleResult> {
  const supabase = createAdminClient();
  const now = new Date();
  const result: OutreachCycleResult = {
    ran: false,
    sent: 0,
    failed: 0,
    scheduled: 0,
    channels: { whatsapp: 0, email: 0 },
    details: [],
    nextAt: null,
  };

  const target = dailyTarget(now);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const { data: all } = await supabase
    .from("outreach_queue")
    .select("id, status, scheduled_at, sent_at")
    .eq("organization_id", params.organizationId);

  const rows = all ?? [];
  const sentToday = rows.filter(
    (r) => r.status === "enviado" && r.sent_at && new Date(r.sent_at) >= startOfDay,
  ).length;
  const pending = rows.filter((r) => r.status === "pendente");

  if (pending.length === 0) {
    result.reason = "fila vazia";
    return result;
  }
  if (!params.force && !insideWindow(now)) {
    result.reason = `fora da janela (${windowStart()}h–${windowEnd()}h)`;
    return result;
  }

  const remainingToday = params.force ? (params.limit ?? pending.length) : Math.max(0, target - sentToday);
  if (remainingToday === 0) {
    result.reason = `teto do dia atingido (${sentToday}/${target})`;
    result.nextAt = nextWindowStart(now).toISOString();
    return result;
  }

  // Vencidos: já agendados para agora/passado; se nada agendado, agenda o lote
  const due = params.force
    ? pending
    : pending.filter((r) => r.scheduled_at && new Date(String(r.scheduled_at)) <= now);
  if (due.length === 0) {
    const toSchedule = pending.slice(0, Math.min(remainingToday, pending.length));
    let cursor = now;
    const slots: { id: string; at: Date }[] = [];
    for (let i = 0; i < toSchedule.length; i++) {
      cursor = nextSlot(cursor, toSchedule.length - i);
      slots.push({ id: toSchedule[i].id, at: new Date(cursor) });
    }
    for (const slot of slots) {
      await supabase
        .from("outreach_queue")
        .update({ scheduled_at: slot.at.toISOString(), updated_at: new Date().toISOString() })
        .eq("id", slot.id);
    }
    result.scheduled = slots.length;
    result.nextAt = slots[0]?.at.toISOString() ?? null;
    result.reason = `agendados ${slots.length} disparo(s)`;
    return result;
  }

  const batch = due.slice(0, Math.min(remainingToday, params.limit ?? 5));

  // dados dos contatos do lote
  const contactIds = batch.map((b) => String((b as { id: string }).id));
  const { data: queueRows } = await supabase
    .from("outreach_queue")
    .select("id, contact_id, briefing, contact:contacts(id, name, phone, email)")
    .in("id", contactIds);

  for (const item of queueRows ?? []) {
    const typed = item as unknown as {
      id: string;
      contact_id: string;
      briefing: OutreachBriefing | null;
      contact: {
      id: string;
      name: string | null;
      phone: string | null;
      email: string | null;
      custom_fields?: Record<string, unknown> | null;
    } | null;
    };
    const outcome = await sendOne(params.organizationId, typed);
    const name = typed.contact?.name ?? "(sem nome)";

    if (outcome.ok) {
      result.sent++;
      if (outcome.channel === "whatsapp") result.channels.whatsapp++;
      else result.channels.email++;
      await supabase
        .from("outreach_queue")
        .update({
          status: "enviado",
          channel: outcome.channel,
          sent_at: new Date().toISOString(),
          message_id: outcome.messageId ?? null,
          conversation_id: outcome.conversationId ?? null,
          attempts: 1,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", typed.id);
    } else {
      result.failed++;
      await supabase
        .from("outreach_queue")
        .update({
          status: "falhou",
          channel: outcome.channel,
          attempts: 1,
          last_error: outcome.error ?? "erro",
          updated_at: new Date().toISOString(),
        })
        .eq("id", typed.id);
    }
    result.details.push({ name, channel: outcome.channel, ok: outcome.ok, error: outcome.error });
  }

  // reagenda os que ainda estão pendentes
  const stillPending = pending.filter((p) => !batch.some((b) => b.id === p.id));
  if (stillPending.length > 0) {
    const remaining = Math.max(0, remainingToday - result.sent);
    const toSchedule = stillPending.filter((p) => !p.scheduled_at).slice(0, Math.max(remaining, 1));
    let cursor = new Date();
    for (const item of toSchedule) {
      cursor = nextSlot(cursor, toSchedule.length);
      await supabase
        .from("outreach_queue")
        .update({ scheduled_at: cursor.toISOString(), updated_at: new Date().toISOString() })
        .eq("id", item.id);
    }
    result.nextAt = toSchedule[0]
      ? String(cursor.toISOString())
      : (stillPending.find((p) => p.scheduled_at)?.scheduled_at as string | undefined) ?? null;
  }

  result.ran = true;
  result.reason = `${result.sent} enviado(s), ${result.failed} falha(s)`;
  return result;
}

/** Prompts/config visíveis para a tela (janela e teto). */
export function outreachConfig() {
  return {
    windowStart: windowStart(),
    windowEnd: windowEnd(),
    dailyTarget: dailyTarget(),
    minGap: minGapMinutes(),
    hermesReady: Boolean(serverEnv().hermes.bin),
  };
}
