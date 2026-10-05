import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  InboundMessage,
  MessageProvider,
  SendResult,
} from "./types";

/**
 * Adapter Zernio (também compatível com Cernio).
 * Documentação oficial: https://docs.zernio.com (OpenAPI: https://zernio.com/openapi.json)
 * Webhook: evento `message.received`, assinatura HMAC-SHA256 em X-Zernio-Signature.
 * Envio: POST /v1/inbox/conversations (create) ou /{conversationId}/messages.
 */
export function createCernioProvider(cfg: {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
}): MessageProvider {
  const normalizedApiUrl = (cfg.apiUrl || "https://api.zernio.com").replace(/\/$/, "");

  function api(path: string, init?: RequestInit) {
    return fetch(`${normalizedApiUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
        ...(init?.headers ?? {}),
      },
    });
  }

  /** Busca conversa existente do participante (evita criar thread duplicada). */
  async function findConversation(accountId: string, participantId: string): Promise<string | null> {
    const res = await api(
      `/v1/inbox/conversations?accountId=${encodeURIComponent(accountId)}&limit=100`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ id: string; participantId?: string }> };
    const hit = (data.data ?? []).find(
      (c) => c.participantId && c.participantId.replace(/[^\d]/g, "") === participantId,
    );
    return hit?.id ?? null;
  }

  /** POST com retry Direct Send (utility) quando a janela de 24h do WhatsApp expirou. */
  async function sendConversationMessage(
    accountId: string,
    participantId: string,
    body: Record<string, unknown>,
  ): Promise<SendResult> {
    const convId = await findConversation(accountId, participantId);

    let res = convId
      ? await api(`/v1/inbox/conversations/${convId}/messages`, {
          method: "POST",
          body: JSON.stringify({ accountId, ...body }),
        })
      : await api(`/v1/inbox/conversations`, {
          method: "POST",
          body: JSON.stringify({ accountId, participantId, ...body }),
        });

    // Fora da janela de 24h: WhatsApp exige template ou Direct Send (utility)
    if (!res.ok && convId) {
      const errText = await res.text();
      if (/template|24\s*hour|window|service.*notification/i.test(errText)) {
        res = await api(`/v1/inbox/conversations/${convId}/messages`, {
          method: "POST",
          body: JSON.stringify({ accountId, ...body, category: "utility" }),
        });
        if (res.ok) {
          const d = (await res.json()) as any;
          return { ok: true, externalMessageId: d?.id ?? d?.message?.id ?? `zernio_${Date.now()}` };
        }
        return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
      }
      return { ok: false, error: `HTTP ${res.status}: ${errText}` };
    }

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
    }
    const data = (await res.json()) as any;
    return {
      ok: true,
      externalMessageId: data?.id ?? data?.message?.id ?? data?._id ?? `zernio_${Date.now()}`,
    };
  }

  return {
    name: "zernio",

    verifySignature(rawBody: string, headers: Headers): boolean {
      // Sem segredo configurado (dev) aceita — em produção preencha CERNIO_WEBHOOK_SECRET
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

      // ── Formato oficial Zernio: evento message.received ──
      if (p && typeof p === "object" && typeof p.event === "string") {
        if (p.event !== "message.received" || !p.message) return [];
        const m = p.message;
        if (m.direction === "outgoing") return []; // ignora mensagens de saída (eco)

        const platform = m.platform === "facebook" ? "messenger" : m.platform;
        const channel = ["whatsapp", "instagram", "messenger"].includes(platform)
          ? platform
          : "whatsapp";
        const att = Array.isArray(m.attachments) ? m.attachments[0] : undefined;
        const sender = m.sender ?? {};

        return [
          {
            externalEventId: String(p.id ?? m.id),
            externalMessageId: String(m.id),
            channel: channel as InboundMessage["channel"],
            externalAccountId: String(p.account?.accountId ?? ""),
            from: String(sender.phoneNumber ?? sender.id ?? ""),
            fromName: sender.name ?? undefined,
            kind: (att?.type && att.type !== "share" ? att.type : m.text ? "text" : "text") as InboundMessage["kind"],
            text: m.text ? String(m.text) : undefined,
            mediaUrl: att?.url ?? undefined,
            timestamp: m.sentAt ?? p.timestamp ?? new Date().toISOString(),
            raw: p,
          },
        ];
      }

      // ── Formatos legados/compat (Cernio e testes) ──
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
        // Falha honesta: outbox retenta e marca 'falhou' em vez de sumir com a mensagem.
        return { ok: false, error: "Zernio: API key não configurada (Conexões ou env CERNIO_API_KEY)" };
      }

      const participantId = String(to).replace(/[^\d]/g, "");
      if (!participantId) return { ok: false, error: `Telefone inválido: ${to}` };

      try {
        return await sendConversationMessage(accountId, participantId, { message: text });
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    async sendTemplate(accountId, to, templateName, variables): Promise<SendResult> {
      if (!cfg.apiKey) {
        return { ok: false, error: "Zernio: API key não configurada" };
      }

      const participantId = String(to).replace(/[^\d]/g, "");
      try {
        return await sendConversationMessage(accountId, participantId, {
          templateName,
          templateParams: Object.values(variables ?? {}),
        });
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    async markRead(accountId, conversationId) {
      if (!cfg.apiKey || !conversationId) return;
      await api(`/v1/inbox/conversations/${conversationId}/read`, {
        method: "POST",
        body: JSON.stringify({ accountId }),
      }).catch(() => null);
    },
  };
}
