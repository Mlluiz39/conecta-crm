import "server-only";
import type { InboundMessage, MessageProvider, SendResult } from "./types";

/**
 * Adapter Evolution API (Baileys).
 * POST /message/sendText/{instance} {number, text} — sem template/24h.
 * Webhook: {event: "MESSAGES_UPSERT", instance, data: {key, pushName, message, messageTimestamp}}
 * Sem HMAC: identidade via campo `apikey` no payload (ou header apikey).
 */
export function createEvolutionProvider(cfg: {
  apiUrl: string;
  apiKey: string;
  instance: string;
}): MessageProvider {
  const base = (cfg.apiUrl || "").replace(/\/+$/, "");

  function api(path: string, init?: RequestInit) {
    return fetch(`${base}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        apikey: cfg.apiKey,
        ...(init?.headers ?? {}),
      },
    });
  }

  /** BR: dígitos + 55 se não tiver DDI. */
  function toNumber(to: string): string {
    const n = String(to).replace(/\D/g, "");
    if (n.length <= 11) return `55${n}`;
    return n;
  }

  async function sendText(accountId: string, to: string, text: string): Promise<SendResult> {
    if (!cfg.apiKey) {
      return { ok: false, error: "Evolution: API key não configurada" };
    }
    const instance = accountId && accountId !== "default" ? accountId : cfg.instance;
    if (!instance) {
      return { ok: false, error: "Evolution: instância não configurada" };
    }

    try {
      const res = await api(`/message/sendText/${encodeURIComponent(instance)}`, {
        method: "POST",
        body: JSON.stringify({ number: toNumber(to), text }),
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
      }
      const data = (await res.json()) as any;
      return { ok: true, externalMessageId: data?.key?.id || data?.id || `evo_${Date.now()}` };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  return {
    name: "evolution",

    verifySignature(rawBody: string, headers: Headers): boolean {
      if (!cfg.apiKey) return true; // dev sem chave

      try {
        const p = JSON.parse(rawBody) as any;
        // Evolution envia `apikey` (chave da instância) no corpo do webhook
        if (typeof p?.apikey === "string" && p.apikey !== cfg.apiKey) return false;
        if (typeof p?.apikey === "string") return true;
      } catch {
        return false;
      }

      // Sem apikey no corpo: aceita header correspondente (chamadas manuais/teste)
      const h =
        headers.get("apikey") ||
        headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (h) return h === cfg.apiKey;
      // Sem identificação nenhuma: libera em dev (produção: webhook sem segredo é inseguro)
      return true;
    },

    parseInbound(payload: unknown): InboundMessage[] {
      const p = payload as any;
      if (!p || typeof p !== "object") return [];

      const event = String(p.event ?? "").toUpperCase();
      if (event && !event.startsWith("MESSAGES_")) return []; // grupos/status/instância
      if (event === "MESSAGES_UPDATE") return []; // só entregas/acks

      const m = p.data;
      if (!m?.key?.remoteJid) return [];
      if (m.key.fromMe) return []; // eco do que enviamos

      const jid = String(m.key.remoteJid);
      // grupos (@g.us) e LIDs linkados (sem telefone) ficam de fora
      if (jid.endsWith("@g.us") || jid.endsWith("@lid")) return [];

      const number = jid.split("@")[0];
      if (!/^\d{7,}$/.test(number)) return [];

      const msg = m.message ?? {};
      const text: string =
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.documentMessage?.caption ||
        msg.buttonsResponseMessage?.selectedDisplayText ||
        msg.templateButtonReplyMessage?.selectedDisplayText ||
        "";

      const kind: InboundMessage["kind"] = msg.imageMessage
        ? "image"
        : msg.audioMessage
          ? "audio"
          : msg.videoMessage
            ? "video"
            : msg.documentMessage
              ? "document"
              : "text";

      // Sem conteúdo (ex.: evento de status sem mensagem) → ignora
      if (!text && kind === "text") return [];

      return [
        {
          externalEventId: `evo_${m.key.id}`,
          externalMessageId: String(m.key.id || `evo_${Date.now()}`),
          externalConversationId: jid, // thread estável = remoteJid
          channel: "whatsapp",
          externalAccountId: String(p.instance || cfg.instance),
          from: number,
          fromName: m.pushName || undefined,
          kind,
          text: text || undefined,
          // mídia pura: baixar exige endpoint dedicado — avisa o agente via content vazio
          timestamp: m.messageTimestamp
            ? new Date(Number(m.messageTimestamp) * 1000).toISOString()
            : p.date_time || new Date().toISOString(),
          raw: p,
        },
      ];
    },

    sendText,

    async sendTemplate(accountId, to, templateName, variables): Promise<SendResult> {
      // Evolution não usa templates Meta: renderiza as variáveis e envia texto puro
      const rendered = String(templateName).replace(/\{\{(\w+)\}\}/g, (_, k) => variables?.[k] ?? "");
      return sendText(accountId, to, rendered || templateName);
    },

    async markRead() {
      // Evolution marcação de leitura: POST /read-messages — dispensada por ora
    },
  };
}
