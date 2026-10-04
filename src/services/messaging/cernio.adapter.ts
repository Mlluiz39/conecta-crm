import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  InboundMessage,
  MessageProvider,
  SendResult,
} from "./types";

/**
 * Adapter Zernio (também compatível com Cernio).
 * Documentação oficial: https://docs.zernio.com
 * Suporta mensagens e comentários de WhatsApp, Instagram e Messenger.
 */
export function createCernioProvider(cfg: {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
}): MessageProvider {
  const normalizedApiUrl = (cfg.apiUrl || "https://api.zernio.com").replace(/\/$/, "");

  return {
    name: "zernio",

    verifySignature(rawBody: string, headers: Headers): boolean {
      // Em desenvolvimento ou se o segredo não estiver configurado, aceita
      if (!cfg.webhookSecret) return true;

      const signature =
        headers.get("x-zernio-signature") ??
        headers.get("x-cernio-signature") ??
        headers.get("x-hub-signature-256") ??
        headers.get("x-signature");

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

      // Zernio suporta múltiplos formatos de evento:
      // 1. { messages: [...] }
      // 2. { data: { message: ... } } ou { data: [...] }
      // 3. { event: "message.created", data: { id, from, text ... } }
      // 4. { id, from, text, channel ... }
      let items: any[] = [];

      if (Array.isArray(p?.messages)) {
        items = p.messages;
      } else if (Array.isArray(p?.data)) {
        items = p.data;
      } else if (p?.data && typeof p.data === "object") {
        items = [p.data];
      } else if (p?.message && typeof p.message === "object") {
        items = [p.message];
      } else if (p?.id) {
        items = [p];
      }

      return items
        .filter((m) => m && (m.id || m.message_id || m.comment_id))
        .map((m) => {
          const id = String(m.id || m.message_id || m.comment_id || `msg_${Date.now()}`);
          const from = String(m.from || m.sender_id || m.phone || m.user_id || m.author || "desconhecido");
          const channel = (m.channel || m.channel_type || m.platform || "whatsapp").toLowerCase();
          const validChannel = ["whatsapp", "instagram", "messenger"].includes(channel) ? channel : "whatsapp";

          const text = m.text || m.content || m.body || m.message || "";
          const accountId = String(m.account_id || m.channel_id || m.phone_number_id || m.instance_id || "");

          return {
            externalEventId: String(m.event_id || m.id || `evt_${Date.now()}`),
            externalMessageId: id,
            channel: validChannel as InboundMessage["channel"],
            externalAccountId: accountId,
            from,
            fromName: m.from_name || m.sender_name || m.author_name || undefined,
            kind: (m.type || m.media_type || "text") as InboundMessage["kind"],
            text: text ? String(text) : undefined,
            mediaUrl: m.media_url || m.url || undefined,
            timestamp: m.timestamp
              ? new Date(m.timestamp).toISOString()
              : new Date().toISOString(),
            raw: m,
          };
        });
    },

    async sendText(accountId, to, text): Promise<SendResult> {
      if (!cfg.apiKey) {
        console.warn("[Zernio] Sem API Key configurada. Mensagem simulada.");
        return { ok: true, externalMessageId: `stub_zernio_${Date.now()}` };
      }

      try {
        const res = await fetch(`${normalizedApiUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            account_id: accountId,
            channel_id: accountId,
            to,
            type: "text",
            text,
            content: text,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error("[Zernio sendText erro]", res.status, errText);
          return { ok: false, error: `HTTP ${res.status}: ${errText}` };
        }

        const data = (await res.json()) as { id?: string; message_id?: string };
        return { ok: true, externalMessageId: data.id || data.message_id || `zernio_${Date.now()}` };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    async sendTemplate(accountId, to, templateName, variables): Promise<SendResult> {
      if (!cfg.apiKey) {
        return { ok: true, externalMessageId: `stub_template_${Date.now()}` };
      }

      try {
        const res = await fetch(`${normalizedApiUrl}/v1/messages`, {
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
      // Suporte a confirmação de leitura
    },
  };
}
