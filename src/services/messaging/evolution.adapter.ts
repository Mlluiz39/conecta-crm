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
  /** Token da instância (`instance.token` na Evolution) — é o que chega no `apikey` do webhook. */
  instanceToken?: string;
}): MessageProvider {
  const base = (cfg.apiUrl || "").replace(/\/+$/, "");

  function api(path: string, init?: RequestInit) {
    return fetch(`${base}${path}`, {
      ...init,
      // timeout: Evolution em reconexão pode pendurar — nunca travar a outbox
      signal: AbortSignal.timeout(15_000),
      headers: {
        "content-type": "application/json",
        apikey: cfg.apiKey,
        ...(init?.headers ?? {}),
      },
    });
  }

  /** Telefone cru vira 55+; jid completo (@lid / @s.whatsapp.net) vai como está. */
  function toNumber(to: string): string {
    const v = String(to).trim();
    if (v.includes("@")) return v;
    const n = v.replace(/\D/g, "");
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
      // Aceita a chave global (chamadas de API/manuais) E o token da instância (o que a
      // Evolution realmente manda no corpo do webhook).
      const aceitos = new Set([cfg.apiKey, cfg.instanceToken].filter((v): v is string => Boolean(v?.trim())));
      if (aceitos.size === 0) return true; // dev sem chave

      try {
        const p = JSON.parse(rawBody) as any;
        if (typeof p?.apikey === "string") return aceitos.has(p.apikey);
      } catch {
        return false;
      }

      // Sem apikey no corpo: aceita header correspondente (chamadas manuais/teste)
      const h =
        headers.get("apikey") ||
        headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (h) return aceitos.has(h);
      // Sem identificação nenhuma: libera (o endpoint não recebe segredo em alguns setups)
      return true;
    },

    parseInbound(payload: unknown): InboundMessage[] {
      const p = payload as any;
      if (!p || typeof p !== "object") return [];

      // evento chega "messages.upsert" (ponto) — normaliza p/ underscore
      const event = String(p.event ?? "").toUpperCase().replace(/\./g, "_");
      if (event && !event.startsWith("MESSAGES_")) return []; // grupos/status/instância
      if (event === "MESSAGES_UPDATE") return []; // só entregas/acks

      const m = p.data;
      if (!m?.key?.remoteJid) return [];
      if (m.key.fromMe) return []; // eco do que enviamos

      const jid = String(m.key.remoteJid);
      // grupos (@g.us) ficam de fora; @lid (identidade vinculada) é remetente válido
      if (jid.endsWith("@g.us")) return [];

      const isLid = jid.endsWith("@lid");
      const number = jid.split("@")[0];
      if (isLid ? !/^\d{6,}$/.test(number) : !/^\d{7,}$/.test(number)) return [];

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
          from: isLid ? jid : number, // LID só existe como jid; PN vai só com dígitos (telefone canônico)
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
