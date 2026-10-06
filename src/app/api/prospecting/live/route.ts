import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { temperatureFromTagNames } from "@/lib/data/lead-temperature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export type LiveProspectingItem = {
  messageId: string;
  conversationId: string;
  contactId: string | null;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  channelType: string;
  status: string;
  content: string;
  /** Assunto quando o canal é e-mail (guardado no início do conteúdo) */
  subject: string | null;
  createdAt: string;
  replied: boolean;
  repliedAt: string | null;
  queued: boolean;
  /** Disparo manual (botão "Enviar agora") e/ou fora da janela 9–18h */
  manual: boolean;
  outsideWindow: boolean;
  /** Detalhes do lead/conversa, para o popup */
  temperature: string | null;
  opportunityValue: number | null;
  threadMessages: number;
  threadLastAt: string | null;
};

export type LiveProspectingResponse = {
  generatedAt: string;
  summary: { queued: number; sentToday: number; replied: number; waiting: number };
  items: LiveProspectingItem[];
};

/**
 * Atividade de prospecção em tempo real: últimas abordagens escritas pelo
 * agente (sender_type = agent_ai), com fila, envio, resposta e detalhes do lead
 * (temperatura, valor da oportunidade, tamanho da thread) para o popup.
 */
export async function GET() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const since = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();

  const { data: messages } = await supabase
    .from("messages")
    .select(
      `id, content, status, created_at, conversation_id, media,
       conversation:conversations!inner(
         id, channel_type, last_message_at,
         contact:contacts(id, name, phone, email)
       )`,
    )
    .eq("organization_id", organizationId)
    .eq("direction", "out")
    .eq("sender_type", "agent_ai")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(60);

  const rows = messages ?? [];
  if (rows.length === 0) {
    return NextResponse.json<LiveProspectingResponse>({
      generatedAt: new Date().toISOString(),
      summary: { queued: 0, sentToday: 0, replied: 0, waiting: 0 },
      items: [],
    });
  }

  const conversationIds = [...new Set(rows.map((m) => String(m.conversation_id)))];
  const contactIds = [
    ...new Set(
      rows
        .map((m) => {
          const conv = m.conversation as unknown as { contact?: { id?: string } | null } | null;
          return conv?.contact?.id ? String(conv.contact.id) : null;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  // Todas as mensagens das conversas envolvidas (respostas + contagem da thread)
  const { data: threadMessages } = await supabase
    .from("messages")
    .select("conversation_id, direction, created_at")
    .eq("organization_id", organizationId)
    .in("conversation_id", conversationIds)
    .gte("created_at", since);

  const inboundByConversation = new Map<string, string[]>();
  const countByConversation = new Map<string, number>();
  for (const m of threadMessages ?? []) {
    const key = String(m.conversation_id);
    countByConversation.set(key, (countByConversation.get(key) ?? 0) + 1);
    if (m.direction === "in") {
      const list = inboundByConversation.get(key) ?? [];
      list.push(String(m.created_at));
      inboundByConversation.set(key, list);
    }
  }

  // Detalhes do lead: temperatura (etiquetas) e valor da oportunidade
  const temperatureByContact = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: links } = await supabase
      .from("contact_tags")
      .select("contact_id, tag:tags(name)")
      .eq("organization_id", organizationId)
      .in("contact_id", contactIds);
    const namesByContact = new Map<string, string[]>();
    for (const link of links ?? []) {
      const key = String(link.contact_id);
      const name = (link.tag as unknown as { name?: string } | null)?.name;
      if (!name) continue;
      namesByContact.set(key, [...(namesByContact.get(key) ?? []), name]);
    }
    for (const [contactId, names] of namesByContact) {
      const temp = temperatureFromTagNames(names);
      if (temp) temperatureByContact.set(contactId, temp);
    }
  }

  const valueByContact = new Map<string, number>();
  if (contactIds.length > 0) {
    const { data: opps } = await supabase
      .from("opportunities")
      .select("contact_id, value")
      .eq("organization_id", organizationId)
      .in("contact_id", contactIds);
    for (const opp of opps ?? []) {
      const key = String(opp.contact_id);
      const value = Number(opp.value) || 0;
      valueByContact.set(key, Math.max(valueByContact.get(key) ?? 0, value));
    }
  }

  const items: LiveProspectingItem[] = rows.map((m) => {
    const conv = m.conversation as unknown as {
      id?: string;
      channel_type?: string;
      last_message_at?: string | null;
      contact?: { id?: string; name?: string | null; phone?: string | null; email?: string | null } | null;
    } | null;

    const conversationId = String(m.conversation_id);
    const inbounds = (inboundByConversation.get(conversationId) ?? []).sort();
    const createdMs = new Date(m.created_at).getTime();
    const repliedAt = inbounds.find((at) => new Date(at).getTime() > createdMs) ?? null;
    const rawContent = String(m.content ?? "");
    const subjectMatch = rawContent.match(/^Assunto:\s*(.+)$/m);

    const contactId = conv?.contact?.id ? String(conv.contact.id) : null;

    const marks = (m.media as { outreach?: { manual?: boolean; outsideWindow?: boolean } } | null)
      ?.outreach;

    return {
      messageId: String(m.id),
      conversationId,
      contactId,
      contactName: conv?.contact?.name ?? "Contato",
      contactPhone: conv?.contact?.phone ?? null,
      contactEmail: conv?.contact?.email ?? null,
      channelType: conv?.channel_type ?? "whatsapp",
      status: String(m.status),
      content: rawContent,
      subject: subjectMatch?.[1]?.trim() ?? null,
      createdAt: String(m.created_at),
      replied: Boolean(repliedAt),
      repliedAt,
      queued: m.status === "pendente",
      manual: Boolean(marks?.manual),
      outsideWindow: Boolean(marks?.outsideWindow),
      temperature: contactId ? (temperatureByContact.get(contactId) ?? null) : null,
      opportunityValue: contactId ? (valueByContact.get(contactId) ?? null) : null,
      threadMessages: countByConversation.get(conversationId) ?? 1,
      threadLastAt: conv?.last_message_at ? String(conv.last_message_at) : null,
    };
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return NextResponse.json<LiveProspectingResponse>({
    generatedAt: new Date().toISOString(),
    summary: {
      queued: items.filter((i) => i.queued).length,
      sentToday: items.filter((i) => new Date(i.createdAt).getTime() >= startOfToday.getTime()).length,
      replied: items.filter((i) => i.replied).length,
      waiting: items.filter((i) => !i.replied).length,
    },
    items: items.slice(0, 20),
  });
}
