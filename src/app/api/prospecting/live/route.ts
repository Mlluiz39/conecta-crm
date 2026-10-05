import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export type LiveProspectingItem = {
  messageId: string;
  contactName: string;
  contactPhone: string | null;
  channelType: string;
  status: string;
  content: string;
  createdAt: string;
  /** true quando o lead respondeu depois dessa mensagem */
  replied: boolean;
  /** true enquanto a mensagem ainda está na fila do outbox */
  queued: boolean;
};

export type LiveProspectingResponse = {
  generatedAt: string;
  summary: { queued: number; sentToday: number; replied: number; waiting: number };
  items: LiveProspectingItem[];
};

/**
 * Atividade de prospecção em tempo real: últimas abordagens escritas pelo
 * agente (sender_type = agent_ai), com fila, envio e resposta do lead.
 */
export async function GET() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const since = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();

  const { data: messages } = await supabase
    .from("messages")
    .select(
      `id, content, status, created_at, conversation_id,
       conversation:conversations!inner(
         id, channel_type,
         contact:contacts(id, name, phone)
       )`,
    )
    .eq("organization_id", organizationId)
    .eq("direction", "out")
    .eq("sender_type", "agent_ai")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(60);

  const rows = messages ?? [];
  const conversationIds = [...new Set(rows.map((m) => String(m.conversation_id)))];

  // Respostas dos leads (para marcar quem respondeu depois da abordagem)
  const inboundByConversation = new Map<string, string[]>();
  if (conversationIds.length > 0) {
    const { data: inbound } = await supabase
      .from("messages")
      .select("conversation_id, created_at")
      .eq("organization_id", organizationId)
      .eq("direction", "in")
      .in("conversation_id", conversationIds)
      .gte("created_at", since);

    for (const m of inbound ?? []) {
      const key = String(m.conversation_id);
      const list = inboundByConversation.get(key) ?? [];
      list.push(String(m.created_at));
      inboundByConversation.set(key, list);
    }
  }

  const items: LiveProspectingItem[] = rows.map((m) => {
    const conv = m.conversation as unknown as {
      channel_type?: string;
      contact?: { name?: string | null; phone?: string | null } | null;
    } | null;
    const inbounds = inboundByConversation.get(String(m.conversation_id)) ?? [];
    const replied = inbounds.some((at) => new Date(at).getTime() > new Date(m.created_at).getTime());

    return {
      messageId: String(m.id),
      contactName: conv?.contact?.name ?? "Contato",
      contactPhone: conv?.contact?.phone ?? null,
      channelType: conv?.channel_type ?? "whatsapp",
      status: String(m.status),
      content: String(m.content ?? ""),
      createdAt: String(m.created_at),
      replied,
      queued: m.status === "pendente",
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
