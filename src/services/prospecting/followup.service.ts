import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { generateFollowUp } from "@/services/prospecting/agent-outreach";
import { isFollowupEligible, readFollowupCount } from "@/services/prospecting/followup-rules";

/**
 * Follow-up de fechamento: para leads que já receberam a primeira abordagem e
 * não responderam depois de N horas, o agente manda UMA retomada curta.
 *
 * O controle de quantas retomadas já saíram fica em contacts.custom_fields.followup
 * (jsonb) — evita DDL e mantém o histórico por lead.
 */

export type FollowupCandidate = {
  contactId: string;
  name: string;
  phone: string | null;
  email: string | null;
  conversationId: string;
  contactChannelId: string;
  firstTouchAt: string;
  followupsSent: number;
};

export type FollowupRunResult = {
  candidates: number;
  queued: number;
  sent: number;
  skipped: number;
  details: { name: string; action: "enviado" | "pulado" | "falhou"; reason?: string }[];
};

/** Lista leads que merecem retomada. */
export async function findFollowupCandidates(params: {
  organizationId: string;
  hours: number;
  maxFollowups: number;
  limit: number;
}): Promise<FollowupCandidate[]> {
  const supabase = createAdminClient();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, phone, email, custom_fields")
    .eq("organization_id", params.organizationId)
    .limit(1000);
  if (!contacts || contacts.length === 0) return [];

  const contactIds = contacts.map((c) => c.id);
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, contact_id, channel_id")
    .eq("organization_id", params.organizationId)
    .in("contact_id", contactIds);
  if (!conversations || conversations.length === 0) return [];

  const convIds = conversations.map((c) => c.id);
  const { data: messages } = await supabase
    .from("messages")
    .select("conversation_id, direction, created_at")
    .eq("organization_id", params.organizationId)
    .in("conversation_id", convIds);
  if (!messages) return [];

  const byConversation = new Map<string, { firstOut: string | null; lastIn: string | null }>();
  for (const m of messages) {
    const key = String(m.conversation_id);
    const entry = byConversation.get(key) ?? { firstOut: null, lastIn: null };
    const at = String(m.created_at);
    if (m.direction === "out") {
      if (!entry.firstOut || new Date(at).getTime() < new Date(entry.firstOut).getTime()) {
        entry.firstOut = at;
      }
    } else if (m.direction === "in") {
      if (!entry.lastIn || new Date(at).getTime() > new Date(entry.lastIn).getTime()) {
        entry.lastIn = at;
      }
    }
    byConversation.set(key, entry);
  }

  const now = Date.now();
  const candidates: FollowupCandidate[] = [];
  const seenContacts = new Set<string>();

  for (const conv of conversations) {
    const contact = contacts.find((c) => c.id === conv.contact_id);
    if (!contact || seenContacts.has(contact.id)) continue;
    const stats = byConversation.get(String(conv.id));
    if (!stats?.firstOut) continue;

    const followupsSent = readFollowupCount(contact.custom_fields);
    const eligible = isFollowupEligible({
      firstTouchAt: stats.firstOut,
      lastInboundAt: stats.lastIn,
      now,
      minHours: params.hours,
      followupsSent,
      maxFollowups: params.maxFollowups,
    });
    if (!eligible) continue;

    seenContacts.add(contact.id);
    candidates.push({
      contactId: contact.id,
      name: contact.name ?? "",
      phone: contact.phone,
      email: contact.email,
      conversationId: String(conv.id),
      contactChannelId: String(conv.channel_id),
      firstTouchAt: stats.firstOut,
      followupsSent,
    });
    if (candidates.length >= params.limit) break;
  }

  return candidates;
}

/** Gera e enfileira os follow-ups (ou só lista, com dryRun). */
export async function runFollowups(params: {
  organizationId: string;
  hours: number;
  maxFollowups?: number;
  limit?: number;
  dryRun?: boolean;
  briefing?: { offer?: string; goal?: string; notes?: string };
}): Promise<FollowupRunResult> {
  const maxFollowups = params.maxFollowups ?? 1;
  const limit = params.limit ?? 5;

  const candidates = await findFollowupCandidates({
    organizationId: params.organizationId,
    hours: params.hours,
    maxFollowups,
    limit,
  });

  const result: FollowupRunResult = {
    candidates: candidates.length,
    queued: 0,
    sent: 0,
    skipped: 0,
    details: [],
  };
  if (params.dryRun || candidates.length === 0) {
    return result;
  }

  const supabase = createAdminClient();
  const { flushOutbox } = await import("@/services/messaging/inbound.service");
  const hermesConfigured = Boolean(serverEnv().hermes.bin);

  for (const candidate of candidates) {
    if (!candidate.phone) {
      result.skipped++;
      result.details.push({ name: candidate.name, action: "pulado", reason: "sem telefone" });
      continue;
    }

    const { text, source } = await generateFollowUp(
      { id: candidate.contactId, name: candidate.name, phone: candidate.phone, email: candidate.email },
      params.briefing ?? {},
      hermesConfigured,
    );

    const { error: msgErr } = await supabase.from("messages").insert({
      organization_id: params.organizationId,
      conversation_id: candidate.conversationId,
      direction: "out",
      sender_type: "agent_ai",
      content: text,
      status: "pendente",
    });
    if (msgErr) {
      result.skipped++;
      result.details.push({ name: candidate.name, action: "falhou", reason: msgErr.message });
      continue;
    }
    result.queued++;

    // Marca a retomada no contato (jsonb, sem DDL)
    const { data: contact } = await supabase
      .from("contacts")
      .select("custom_fields")
      .eq("id", candidate.contactId)
      .single();
    const customFields =
      contact?.custom_fields && typeof contact.custom_fields === "object"
        ? (contact.custom_fields as Record<string, unknown>)
        : {};
    await supabase
      .from("contacts")
      .update({
        custom_fields: {
          ...customFields,
          followup: {
            count: candidate.followupsSent + 1,
            lastAt: new Date().toISOString(),
            source,
          },
        },
      })
      .eq("id", candidate.contactId);

    result.details.push({ name: candidate.name, action: "enviado" });
  }

  if (result.queued > 0) {
    result.sent = await flushOutbox(result.queued).catch(() => 0);
  }
  return result;
}
