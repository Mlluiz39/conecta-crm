import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { InboundMessage, MessageProvider, SendResult } from "./types";

/**
 * Adapter Telegram (Bot API) — o bot é o mesmo dos alertas (`TELEGRAM_BOT_TOKEN`), mas aqui
 * ele é um **canal de atendimento**: quem escreve para o bot vira contato + conversa no CRM,
 * o agente responde e a resposta sai pela outbox (igual ao WhatsApp).
 *
 * Diferenças que importam em relação ao WhatsApp/Evolution:
 *  * **Não existe telefone.** O identificador do lead é o `chat.id`; ele mora em
 *    `contacts.telegram_chat_id` (como `instagram_handle`/`messenger_psid`), nunca em `phone`
 *    — senão o match por sufixo de telefone casaria um chat id com um número de WhatsApp.
 *  * **Assinatura é um segredo compartilhado**: o `setWebhook` manda o `secret_token` e o
 *    Telegram devolve no header `x-telegram-bot-api-secret-token`. Sem ele o endpoint é
 *    público (qualquer um faria o agente responder), então sem segredo configurado o
 *    webhook é recusado.
 *  * **Allowlist de chats**: `TELEGRAM_ALLOWED_CHAT_IDS` (só quem está na lista é atendido).
 *  * **Texto puro, sem `parse_mode`**: a resposta do modelo é dinâmica; markdown quebrado faz
 *    o Telegram devolver 400 e a mensagem se perde (mesma lição dos alertas).
 */

const API = "https://api.telegram.org";
/** Limite da Bot API é 4096; margem para não cortar entidade no meio. */
const MAX_CHARS = 4000;

export function createTelegramProvider(cfg: {
  token: string;
  /** Segredo combinado no setWebhook (valida que o POST veio do Telegram). */
  webhookSecret?: string;
  /** Chats autorizados a conversar (vazio = qualquer um; em produção sempre preencher). */
  allowedChatIds?: string[];
  /** Override da base da API (só para teste). */
  apiBase?: string;
}): MessageProvider {
  /** O prefixo numérico do token é o id do bot — casa com `channels.cernio_channel_id`. */
  const botId = String(cfg.token || "").split(":")[0] || "default";
  const base = (cfg.apiBase || API).replace(/\/+$/, "");
  const permitidos = new Set((cfg.allowedChatIds ?? []).map((v) => String(v).trim()).filter(Boolean));

  async function api(
    method: string,
    body?: Record<string, unknown> | FormData,
    timeoutMs = 20_000,
  ): Promise<{ ok: boolean; status: number; data: any; texto: string }> {
    const init: RequestInit = { method: "POST", signal: AbortSignal.timeout(timeoutMs) };
    if (body instanceof FormData) {
      init.body = body; // multipart: o fetch monta o boundary sozinho
    } else if (body) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${base}/bot${cfg.token}/${method}`, init);
    const texto = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(texto);
    } catch {
      // resposta não-JSON (proxy/erro de rede): fica no texto para o log
    }
    return { ok: res.ok && data?.ok !== false, status: res.status, data, texto };
  }

  /** Igualdade em tempo constante — o segredo do webhook não pode vazar por timing. */
  function iguais(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
  }

  function nome(remetente: any): string | undefined {
    const completo = [remetente?.first_name, remetente?.last_name].filter(Boolean).join(" ").trim();
    return completo || remetente?.username || undefined;
  }

  /** Quebra resposta longa em pedaços (a Bot API rejeita >4096). */
  function pedacos(texto: string): string[] {
    const t = String(texto ?? "");
    if (t.length <= MAX_CHARS) return [t];
    const partes: string[] = [];
    let resto = t;
    while (resto.length > MAX_CHARS) {
      // corta em quebra de linha/espaço perto do limite para não picar palavra
      const janela = resto.slice(0, MAX_CHARS);
      const corte = Math.max(janela.lastIndexOf("\n"), janela.lastIndexOf(" "));
      const fim = corte > MAX_CHARS * 0.6 ? corte : MAX_CHARS;
      partes.push(resto.slice(0, fim).trimEnd());
      resto = resto.slice(fim).trimStart();
    }
    if (resto) partes.push(resto);
    return partes;
  }

  /** Envio de texto (função nomeada: `sendText` e `sendTemplate` usam a mesma implementação). */
  async function sendText(_accountId: string, to: string, text: string): Promise<SendResult> {
    if (!cfg.token) return { ok: false, error: "Telegram: TELEGRAM_BOT_TOKEN não configurado" };
    const chatId = String(to ?? "").trim();
    if (!chatId) return { ok: false, error: "Telegram: conversa sem chat id" };

    let ultimoId: string | undefined;
    try {
      for (const parte of pedacos(text)) {
        if (!parte) continue;
        const res = await api("sendMessage", {
          chat_id: chatId,
          text: parte,
          disable_web_page_preview: true,
        });
        if (!res.ok) {
          const detalhe = res.data?.description ?? res.texto.slice(0, 200);
          return { ok: false, error: `HTTP ${res.status}: ${detalhe}` };
        }
        ultimoId = String(res.data?.result?.message_id ?? ultimoId ?? "");
      }
      return { ok: true, externalMessageId: ultimoId };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  return {
    name: "telegram",

    /**
     * O Telegram manda o `secret_token` do setWebhook neste header. Sem segredo configurado
     * o endpoint ficaria aberto (qualquer POST faria o agente responder) — por isso recusa.
     */
    verifySignature(_rawBody, headers) {
      if (!cfg.webhookSecret) {
        console.error("[telegram] TELEGRAM_WEBHOOK_SECRET ausente — webhook recusado");
        return false;
      }
      const recebido = headers.get("x-telegram-bot-api-secret-token") ?? "";
      const ok = iguais(recebido, cfg.webhookSecret);
      if (!ok) console.warn("[telegram] webhook com secret_token inválido");
      return ok;
    },

    /** Um Update por request: `message` (e `edited_message`, que tratamos igual). */
    parseInbound(payload) {
      const update = payload as any;
      const m = update?.message ?? update?.edited_message;
      if (!m) return [];

      const chat = m.chat ?? {};
      // Grupo/canal não é atendimento 1:1: fica fora (e o bot não lê grupos por padrão).
      if (chat.type !== "private") return [];

      const chatId = String(chat.id ?? "");
      if (!chatId) return [];

      if (permitidos.size > 0 && !permitidos.has(chatId)) {
        console.log(`[telegram] chat ${chatId} fora da allowlist — ignorado`);
        return [];
      }

      const texto: string = m.text ?? m.caption ?? "";
      const kind: InboundMessage["kind"] = m.voice || m.audio
        ? "audio"
        : m.photo
          ? "image"
          : m.video
            ? "video"
            : m.document
              ? "document"
              : "text";

      // Sem texto e sem mídia conhecida (ex.: sticker, serviço) → nada para o agente
      if (!texto && kind === "text") return [];

      return [
        {
          externalEventId: `tg_${update.update_id ?? m.message_id}`,
          // id da mensagem é único por chat, não global — casa com unique(conversation_id, external_id)
          externalMessageId: String(m.message_id ?? `tg_${Date.now()}`),
          externalConversationId: `tg_${chatId}`, // thread estável = o chat
          channel: "telegram",
          externalAccountId: botId,
          from: chatId, // "telefone" do Telegram: o chat id
          fromName: nome(m.from),
          kind,
          text: texto || undefined,
          timestamp: m.date ? new Date(Number(m.date) * 1000).toISOString() : new Date().toISOString(),
          raw: update,
        },
      ];
    },

    async sendText(accountId, to, text) {
      return sendText(accountId, to, text);
    },

    async sendTemplate(accountId, to, templateName, variables) {
      const renderizado = String(templateName).replace(/\{\{(\w+)\}\}/g, (_, k) => variables?.[k] ?? "");
      return sendText(accountId, to, renderizado || templateName);
    },

    /**
     * "digitando…". O Telegram expira a ação sozinha (~5s), então renovar é papel do
     * chamador (`comDigitando` no inbound); `paused` não existe na API — só ignoramos.
     */
    async sendPresence(accountId, to, presence) {
      if (!cfg.token || presence === "paused") return;
      try {
        await api("sendChatAction", {
          chat_id: String(to),
          action: presence === "recording" ? "record_voice" : "typing",
        });
      } catch {
        // indicador é cosmético: nunca derruba o envio
      }
    },

    /**
     * Nota de voz do lead → base64 para o `transcribeAudio`. O `raw` guarda o update cru,
     * então o file_id do áudio está ali (é o único caminho: o webhook não traz o binário).
     */
    async fetchMediaBase64(_accountId, message) {
      if (!cfg.token) return null;
      try {
        const m = (message.raw as any)?.message ?? (message.raw as any)?.edited_message;
        const arquivo = m?.voice ?? m?.audio ?? m?.video_note;
        const fileId = arquivo?.file_id;
        if (!fileId) return null;

        const res = await api("getFile", { file_id: fileId });
        const caminho = res.data?.result?.file_path;
        if (!res.ok || !caminho) {
          console.warn(`[telegram] getFile ${fileId}: HTTP ${res.status}`);
          return null;
        }
        const bin = await fetch(`${base}/file/bot${cfg.token}/${caminho}`, {
          signal: AbortSignal.timeout(45_000),
        });
        if (!bin.ok) {
          console.warn(`[telegram] download ${caminho}: HTTP ${bin.status}`);
          return null;
        }
        const bytes = Buffer.from(await bin.arrayBuffer());
        return {
          base64: bytes.toString("base64"),
          mimetype: arquivo?.mime_type || bin.headers.get("content-type") || "audio/ogg",
        };
      } catch (err) {
        console.warn("[telegram] mídia falhou:", (err as Error).message);
        return null;
      }
    },

    /**
     * Áudio. A Bot API só aceita voz (sendVoice) em OGG/OPUS; o TTS devolve mp3/wav, então
     * mandamos como áudio (sendAudio), que toca no player do Telegram.
     */
    async sendVoice(accountId, to, audioBase64) {
      if (!cfg.token) return { ok: false, error: "Telegram: TELEGRAM_BOT_TOKEN não configurado" };
      try {
        const form = new FormData();
        form.append("chat_id", String(to));
        form.append("audio", new Blob([Buffer.from(audioBase64, "base64")], { type: "audio/mpeg" }), "audio.mp3");
        const res = await api("sendAudio", form, 45_000);
        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status}: ${res.data?.description ?? res.texto.slice(0, 200)}` };
        }
        return { ok: true, externalMessageId: String(res.data?.result?.message_id ?? `tg_${Date.now()}`) };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    /** Apaga a mensagem que NÓS enviamos (deleteMessage funciona só o nosso lado). */
    async deleteMessage(_accountId, target) {
      if (!cfg.token) return { ok: false, error: "Telegram: TELEGRAM_BOT_TOKEN não configurado" };
      const messageId = Number(String(target?.id ?? "").replace(/\D/g, ""));
      if (!messageId) return { ok: false, error: "Telegram: id da mensagem ausente" };
      try {
        const res = await api("deleteMessage", { chat_id: String(target.from), message_id: messageId });
        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status}: ${res.data?.description ?? res.texto.slice(0, 200)}` };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    // markRead fica de fora de propósito: a Bot API não expõe recibo de leitura.
  };
}
