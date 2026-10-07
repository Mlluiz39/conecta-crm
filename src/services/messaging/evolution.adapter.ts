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

  function api(path: string, init?: RequestInit, timeoutMs = 15_000) {
    return fetch(`${base}${path}`, {
      ...init,
      // timeout: Evolution em reconexão pode pendurar — nunca travar a outbox
      signal: AbortSignal.timeout(timeoutMs),
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

  /**
   * A conta do WhatsApp está em modo LID: envio para `@s.whatsapp.net` volta com ack ERROR e
   * não chega no celular; envio para o `@lid` correspondente entrega (SERVER_ACK/DELIVERY_ACK/READ).
   * O webhook do 2.3.7 esconde o LID (manda o PN), mas o `findMessages` devolve: as mensagens
   * recebidas têm `remoteJid` = LID e `remoteJidAlt` = telefone — é esse par que dá o mapeamento.
   */
  const lidCache = new Map<string, { lid: string | null; at: number }>();
  const LID_TTL_MS = 10 * 60 * 1000;

  async function resolveLid(instance: string, pnJid: string): Promise<string | null> {
    const cached = lidCache.get(pnJid);
    if (cached && Date.now() - cached.at < LID_TTL_MS) return cached.lid;
    let lid: string | null = null;
    try {
      const res = await api(`/chat/findMessages/${encodeURIComponent(instance)}`, {
        method: "POST",
        body: JSON.stringify({ where: { key: { remoteJidAlt: pnJid } } }),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const records: any[] = data?.messages?.records ?? (Array.isArray(data) ? data : []);
        for (const r of records) {
          const rj = String(r?.key?.remoteJid ?? "");
          if (rj.endsWith("@lid")) {
            lid = rj;
            break;
          }
        }
      }
    } catch {
      lid = null;
    }
    lidCache.set(pnJid, { lid, at: Date.now() });
    return lid;
  }

  /** Destino efetivo: jid explícito vai como está; telefone tenta o LID antes do PN. */
  async function resolveTo(instance: string, to: string): Promise<string> {
    const v = toNumber(to);
    if (v.includes("@")) return v;
    const digits = v.replace(/\D/g, "");
    const lid = await resolveLid(instance, `${digits}@s.whatsapp.net`);
    if (lid) {
      console.log(`[evolution] destino ${digits} → LID ${lid}`);
      return lid;
    }
    return digits;
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
      const alvo = await resolveTo(instance, to);
      const res = await api(`/message/sendText/${encodeURIComponent(instance)}`, {
        method: "POST",
        body: JSON.stringify({ number: alvo, text }),
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

    /** "digitando…" (composing) / limpa o indicador (paused). */
    async sendPresence(accountId, to, presence, delayMs = 0) {
      const instance = accountId && accountId !== "default" ? accountId : cfg.instance;
      if (!cfg.apiKey || !instance) return;
      try {
        const alvo = await resolveTo(instance, to);
        const res = await api(`/chat/sendPresence/${encodeURIComponent(instance)}`, {
          method: "POST",
          body: JSON.stringify({ number: alvo, delay: Math.max(0, delayMs), presence }),
        });
        if (!res.ok) console.warn(`[evolution] presence ${presence} falhou: HTTP ${res.status}`);
      } catch {
        // indicador é cosmético: nunca derruba o envio
      }
    },

    async sendTemplate(accountId, to, templateName, variables): Promise<SendResult> {
      // Evolution não usa templates Meta: renderiza as variáveis e envia texto puro
      const rendered = String(templateName).replace(/\{\{(\w+)\}\}/g, (_, k) => variables?.[k] ?? "");
      return sendText(accountId, to, rendered || templateName);
    },

    /** Base64 da mídia recebida: o payload do webhook traz o arquivo criptografado. */
    async fetchMediaBase64(accountId, message) {
      const instance = accountId && accountId !== "default" ? accountId : cfg.instance;
      if (!cfg.apiKey || !instance || !message?.id) return null;
      try {
        const raw = message.raw as any;
        const key = raw?.data?.key ?? raw?.key;
        const res = await api(
          `/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`,
          {
            method: "POST",
            body: JSON.stringify({ message: { key }, convertToMp4: false }),
          },
          45_000,
        );
        if (!res.ok) {
          console.warn(`[evolution] mídia ${message.id}: HTTP ${res.status}`);
          return null;
        }
        const data = (await res.json()) as any;
        const b64 = String(data?.base64 ?? "").replace(/^data:[^,]+,/, "");
        if (!b64) return null;
        return { base64: b64, mimetype: String(data?.mimetype ?? "audio/ogg") };
      } catch (err) {
        console.warn("[evolution] mídia falhou:", (err as Error).message);
        return null;
      }
    },

    /**
     * Nota de voz. A Evolution converte sozinha para ogg/opus (ffmpeg está na imagem) —
     * aceita o WAV que o TTS devolve.
     */
    async sendVoice(accountId, to, audioBase64) {
      const instance = accountId && accountId !== "default" ? accountId : cfg.instance;
      if (!cfg.apiKey) return { ok: false, error: "Evolution: API key não configurada" };
      if (!instance) return { ok: false, error: "Evolution: instância não configurada" };
      try {
        const alvo = await resolveTo(instance, to);
        const res = await api(
          `/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`,
          { method: "POST", body: JSON.stringify({ number: alvo, audio: audioBase64, delay: 1200 }) },
          45_000,
        );
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
        const data = (await res.json()) as any;
        return { ok: true, externalMessageId: data?.key?.id || data?.id || `evo_${Date.now()}` };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    /** Apaga para todos no WhatsApp (revoke): DELETE /chat/deleteMessageForEveryone. */
    async deleteMessage(accountId, target) {
      const instance = accountId && accountId !== "default" ? accountId : cfg.instance;
      if (!cfg.apiKey) return { ok: false, error: "Evolution: API key não configurada" };
      if (!instance || !target?.id) return { ok: false, error: "Evolution: instância ou mensagem ausente" };
      try {
        const alvo = await resolveTo(instance, target.from);
        const res = await api(`/chat/deleteMessageForEveryone/${encodeURIComponent(instance)}`, {
          method: "DELETE",
          body: JSON.stringify({ id: target.id, remoteJid: alvo, fromMe: true }),
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    /** Tick azul para o lead: POST /chat/markMessageAsRead {readMessages: [{remoteJid, fromMe, id}]} */
    async markRead(accountId, message) {
      const instance = accountId && accountId !== "default" ? accountId : cfg.instance;
      if (!cfg.apiKey || !instance || !message?.id) return;
      try {
        const alvo = await resolveTo(instance, message.from);
        const res = await api(`/chat/markMessageAsRead/${encodeURIComponent(instance)}`, {
          method: "POST",
          body: JSON.stringify({
            readMessages: [{ remoteJid: alvo, fromMe: false, id: message.id }],
          }),
        });
        console.log(`[evolution] lida → ${alvo} (${message.id}) HTTP ${res.status}`);
      } catch {
        // recibo de leitura é cosmético: nunca derruba o processamento do webhook
      }
    },
  };
}
