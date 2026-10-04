import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  InboundMessage,
  MessageProvider,
  SendResult,
} from "./types";

/**
 * Adapter Cernio. O contrato REST/webhook da Cernio ainda não está
 * documentado, então o parsing é best-effort e a assinatura é HMAC-SHA256
 * do corpo cru com o CERNIO_WEBHOOK_SECRET. Ajustar aqui quando as
 * credenciais/contrato chegarem — nada mais no sistema depende do formato.
 *
 * ponytail: enchimento mínimo; upgrade = validar campos reais do payload.
 */
export function createCernioProvider(cfg: {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
}): MessageProvider {
  return {
    name: "cernio",

    verifySignature(rawBody: string, headers: Headers): boolean {
      // Sem segredo configurado (dev), aceita — não trave o ambiente local.
      if (!cfg.webhookSecret) return true;
      const signature =
        headers.get("x-cernio-signature") ?? headers.get("x-hub-signature-256");
      if (!signature) return false;

      const expected = createHmac("sha256", cfg.webhookSecret)
        .update(rawBody)
        .digest("hex");
      const provided = signature.replace(/^sha256=/, "");

      const a = Buffer.from(expected);
      const b = Buffer.from(provided);
      return a.length === b.length && timingSafeEqual(a, b);
    },

    parseInbound(payload: unknown): InboundMessage[] {
      const p = payload as any;
      // Formatos aceitos: { messages: [...] } ou um único objeto de mensagem.
      const items: any[] = Array.isArray(p?.messages)
        ? p.messages
        : p?.message
          ? [p.message]
          : p?.id
            ? [p]
            : [];

      return items
        .filter((m) => m && m.id && m.from)
        .map((m) => ({
          externalEventId: String(m.event_id ?? m.id),
          externalMessageId: String(m.id),
          channel: (m.channel ?? "whatsapp") as InboundMessage["channel"],
          externalAccountId: String(m.account_id ?? m.phone_number_id ?? ""),
          from: String(m.from),
          fromName: m.from_name ? String(m.from_name) : undefined,
          kind: (m.type ?? "text") as InboundMessage["kind"],
          text: m.text ? String(m.text) : undefined,
          mediaUrl: m.media_url ? String(m.media_url) : undefined,
          timestamp: m.timestamp
            ? new Date(m.timestamp).toISOString()
            : new Date().toISOString(),
          raw: m,
        }));
    },

    async sendText(accountId, to, text): Promise<SendResult> {
      // ponytail: stub — troca por POST real quando houver contrato Cernio.
      if (!cfg.apiUrl || !cfg.apiKey) {
        return { ok: true, externalMessageId: `stub_${Date.now()}` };
      }
      try {
        const res = await fetch(`${cfg.apiUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({ account_id: accountId, to, type: "text", text }),
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        const data = (await res.json()) as { id?: string };
        return { ok: true, externalMessageId: data.id };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    async sendTemplate(accountId, to, templateName, variables): Promise<SendResult> {
      if (!cfg.apiUrl || !cfg.apiKey) {
        return { ok: true, externalMessageId: `stub_${Date.now()}` };
      }
      try {
        const res = await fetch(`${cfg.apiUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            account_id: accountId,
            to,
            type: "template",
            template: templateName,
            variables,
          }),
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        const data = (await res.json()) as { id?: string };
        return { ok: true, externalMessageId: data.id };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    async markRead() {
      // no-op no stub
    },
  };
}
