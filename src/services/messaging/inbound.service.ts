import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAgentForConversation } from "@/services/agents/engine";
import { getMessageProvider } from "./index";
import type { InboundMessage } from "./types";

export type InboundOutcome = {
  status: "processed" | "duplicate" | "ignored" | "invalid_signature";
  messages: number;
};

/** Normaliza telefone/@ em chave estável para casar contato. */
function normalizeHandle(from: string): string {
  return from.replace(/[^\d+]/g, "");
}

/**
 * Processa o webhook de um provider: valida assinatura, garante idempotência,
 * materializa contato/conversa/mensagem e dispara o agente.
 * Roda server-side com service role (ignora RLS).
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
    // Idempotência de 1º nível: unique (provider, external_event_id).
    const { error: dupError } = await supabase.from("webhook_events").insert({
      provider: provider.name,
      event_type: msg.kind,
      external_event_id: msg.externalEventId,
      signature_valid: true,
      payload: msg.raw,
      status: "received",
    });
    if (dupError) {
      // 23505 = already exists → já processado.
      if (dupError.code === "23505") continue;
      throw new Error(dupError.message);
    }

    // Resolve a organização pelo canal externo.
    const { data: channelRow } = await supabase
      .from("agent_channels")
      .select("organization_id")
      .eq("external_account_id", msg.externalAccountId)
      .maybeSingle();

    if (!channelRow) {
      await supabase
        .from("webhook_events")
        .update({ status: "ignored", error: "canal não mapeado" })
        .eq("provider", provider.name)
        .eq("external_event_id", msg.externalEventId);
      continue;
    }

    const organizationId = channelRow.organization_id as string;
    const handle = normalizeHandle(msg.from);

    // Upsert contato por telefone.
    const { data: contact } = await supabase
      .from("contacts")
      .upsert(
        {
          organization_id: organizationId,
          name: msg.fromName ?? handle,
          phone: handle,
          origin_channel: msg.channel,
          last_interaction_at: msg.timestamp,
        },
        { onConflict: "organization_id,phone", ignoreDuplicates: false },
      )
      .select("id")
      .single();

    // Upsert conversa.
    const { data: conv } = await supabase
      .from("conversations")
      .upsert(
        {
          organization_id: organizationId,
          contact_id: contact!.id,
          channel: msg.channel,
          last_message_at: msg.timestamp,
          last_inbound_at: msg.timestamp,
        },
        { onConflict: "organization_id,contact_id,channel", ignoreDuplicates: false },
      )
      .select("id, unread_count")
      .single();

    // Grava a mensagem inbound (dedup de 2º nível via external_message_id).
    const { error: msgError } = await supabase.from("messages").insert({
      organization_id: organizationId,
      conversation_id: conv!.id,
      direction: "inbound",
      sender_type: "contact",
      kind: msg.kind === "interactive" ? "interactive" : msg.kind,
      body: msg.text ?? null,
      media_url: msg.mediaUrl ?? null,
      external_message_id: msg.externalMessageId,
      status: "delivered",
      created_at: msg.timestamp,
    });
    if (msgError && msgError.code !== "23505") throw new Error(msgError.message);

    await supabase
      .from("conversations")
      .update({ unread_count: (conv!.unread_count ?? 0) + 1 })
      .eq("id", conv!.id);

    await supabase
      .from("webhook_events")
      .update({ organization_id: organizationId, status: "processed", processed_at: new Date().toISOString() })
      .eq("provider", provider.name)
      .eq("external_event_id", msg.externalEventId);

    // Dispara o agente (se aplicável) e enfileira a resposta.
    if (msg.text) {
      const result = await runAgentForConversation({
        supabase,
        organizationId,
        conversationId: conv!.id,
        inboundText: msg.text,
        trigger: "webhook",
      });

      if (result.handled && result.reply) {
        await supabase.from("message_outbox").insert({
          organization_id: organizationId,
          conversation_id: conv!.id,
          payload: { to: handle, text: result.reply, accountId: msg.externalAccountId },
          status: "pending",
        });
      }
    }

    processed++;
  }

  return { status: processed > 0 ? "processed" : "duplicate", messages: processed };
}

/** Consome um item da outbox e envia pelo provider (usado por cron/worker). */
export async function flushOutbox(limit = 20): Promise<number> {
  const provider = getMessageProvider();
  const supabase = createAdminClient();
  const { data: due } = await supabase
    .from("message_outbox")
    .select("id, payload, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at")
    .limit(limit);

  let sent = 0;
  for (const item of due ?? []) {
    const p = item.payload as { to: string; text: string; accountId: string };
    const res = await provider.sendText(p.accountId, p.to, p.text);
    if (res.ok) {
      sent++;
      await supabase.from("message_outbox").update({ status: "sent" }).eq("id", item.id);
      await supabase
        .from("messages")
        .update({ status: "sent", external_message_id: res.externalMessageId ?? null })
        .eq("conversation_id", (item.payload as any).conversation_id ?? "")
        .eq("status", "queued");
    } else {
      const attempts = (item.attempts ?? 0) + 1;
      await supabase
        .from("message_outbox")
        .update({
          status: attempts >= 5 ? "failed" : "pending",
          attempts,
          last_error: res.error ?? "erro desconhecido",
          next_attempt_at: new Date(Date.now() + attempts * 60_000).toISOString(),
        })
        .eq("id", item.id);
    }
  }
  return sent;
}
