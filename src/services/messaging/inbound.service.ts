import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAgentForConversation } from "@/services/agents/engine";
import { getMessageProvider } from "./index";

export type InboundOutcome = {
  status: "processed" | "duplicate" | "ignored" | "invalid_signature";
  messages: number;
};

function normalizeHandle(from: string): string {
  return from.replace(/[^\d+]/g, "");
}

/**
 * Processa webhook da Cernio:
 * Valida assinatura, salva webhook_events (idempotência), garante canal/contato/conversa e aciona IA.
 */
export async function handleInboundWebhook(params: {
  providerName: string;
  rawBody: string;
  headers: Headers;
}): Promise<InboundOutcome> {
  const provider = getMessageProvider(params.providerName);
  const supabase = createAdminClient();

  if (!provider.verifySignature(params.rawBody, params.headers)) {
    return { status: "invalid_signature", messages: 0 };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(params.rawBody);
  } catch {
    return { status: "ignored", messages: 0 };
  }

  const inbound = provider.parseInbound(payload);
  let processed = 0;

  for (const msg of inbound) {
    // 1. Idempotência em webhook_events: unique(provider, event_id)
    const { error: dupError } = await supabase.from("webhook_events").insert({
      provider: provider.name,
      event_id: msg.externalEventId,
      payload: msg.raw as any,
    });

    if (dupError) {
      if (dupError.code === "23505") continue; // Já processado
      throw new Error(dupError.message);
    }

    // 2. Resolve canal e organização
    let { data: channelRow } = await supabase
      .from("channels")
      .select("id, organization_id")
      .eq("cernio_channel_id", msg.externalAccountId)
      .maybeSingle();

    if (!channelRow) {
      // Se não achar por cernio_channel_id, busca o primeiro canal do tipo ou usa a primeira organização
      const { data: fallbackOrg } = await supabase.from("organizations").select("id").limit(1).single();
      if (!fallbackOrg) continue;

      const { data: newChan } = await supabase
        .from("channels")
        .upsert(
          {
            organization_id: fallbackOrg.id,
            type: msg.channel,
            name: `Canal ${msg.channel.toUpperCase()}`,
            cernio_channel_id: msg.externalAccountId || "default",
            status: "conectado",
          },
          { onConflict: "organization_id,type,cernio_channel_id" },
        )
        .select("id, organization_id")
        .single();
      channelRow = newChan;
    }

    if (!channelRow) continue;
    const organizationId = channelRow.organization_id;
    const handle = normalizeHandle(msg.from);

    // 3. Upsert contato
    const { data: contact } = await supabase
      .from("contacts")
      .upsert(
        {
          organization_id: organizationId,
          name: msg.fromName || handle || "Lead Inbound",
          phone: handle || null,
        },
        { onConflict: "organization_id,phone" },
      )
      .select("id")
      .single();

    if (!contact) continue;

    // 4. Upsert conversa (unique channel_id, external_id)
    const externalConvId = msg.externalMessageId || `conv_${handle}`;
    const { data: conv } = await supabase
      .from("conversations")
      .upsert(
        {
          organization_id: organizationId,
          contact_id: contact.id,
          channel_id: channelRow.id,
          channel_type: msg.channel,
          external_id: externalConvId,
          status: "aberta",
        },
        { onConflict: "channel_id,external_id" },
      )
      .select("id")
      .single();

    if (!conv) continue;

    // 5. Insere mensagem recebida (trigger on_message_insert atualiza last_message_at e unread_count automaticamente)
    const { error: msgErr } = await supabase.from("messages").insert({
      organization_id: organizationId,
      conversation_id: conv.id,
      direction: "in",
      sender_type: "contact",
      content: msg.text || "",
      external_id: msg.externalMessageId,
      status: "entregue",
      created_at: msg.timestamp,
    });

    if (msgErr && msgErr.code !== "23505") {
      console.error("Erro ao salvar mensagem:", msgErr);
    }

    await supabase
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", provider.name)
      .eq("event_id", msg.externalEventId);

    // 6. Aciona o agente de IA para responder à conversa
    if (msg.text) {
      const res = await runAgentForConversation({
        supabase,
        organizationId,
        conversationId: conv.id,
        inboundText: msg.text,
      });

      // Se o agente gerou resposta, envia imediatamente pelo provider
      if (res.handled && res.reply) {
        await provider.sendText(msg.externalAccountId, handle, res.reply).catch(() => null);
      }
    }

    processed++;
  }

  return { status: processed > 0 ? "processed" : "duplicate", messages: processed };
}

export async function flushOutbox(): Promise<number> {
  // Mantido para compatibilidade da rota cron
  return 0;
}
