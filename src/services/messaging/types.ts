import type { ChannelType } from "@/types/domain";

/** Mensagem normalizada de entrada, independente do provider. */
export interface InboundMessage {
  /** Id do evento no provider (idempotência de 1º nível). */
  externalEventId: string;
  /** Id da mensagem no provider (dedup de 2º nível). */
  externalMessageId: string;
  /** Id estável da conversa/thread no provider (chave de upsert da conversa). */
  externalConversationId?: string;
  channel: ChannelType;
  /** Conta do provider (phone_number_id / page_id) p/ resolver a organização. */
  externalAccountId: string;
  /** Telefone/@ do remetente. */
  from: string;
  fromName?: string;
  kind: "text" | "image" | "audio" | "video" | "document" | "interactive";
  text?: string;
  mediaUrl?: string;
  timestamp: string; // ISO
  /**
   * Conversa interna: quem escreveu é o dono da empresa (não um lead). O canal marca isso
   * (ex.: o chat do CEO no Telegram) e o CRM grava `conversations.is_internal` — a conversa
   * sai do inbox de leads e dos alertas, e o agente responde em modo interno.
   */
  internal?: boolean;
  raw: unknown;
}

export interface SendResult {
  ok: boolean;
  externalMessageId?: string;
  error?: string;
}

/**
 * Contrato de mensageria. Trocar Cernio por Meta Cloud API direto = novo
 * adapter registrado em provider-registry, sem tocar no webhook handler.
 */
export interface MessageProvider {
  readonly name: string;
  /** Valida a assinatura do webhook (HMAC/segredo do provider). */
  verifySignature(rawBody: string, headers: Headers): boolean;
  /** Normaliza o payload do webhook em 0..n mensagens. */
  parseInbound(payload: unknown): InboundMessage[];
  sendText(accountId: string, to: string, text: string): Promise<SendResult>;
  sendTemplate(
    accountId: string,
    to: string,
    templateName: string,
    variables: Record<string, string>,
  ): Promise<SendResult>;
  /**
   * Marca como lida a mensagem recebida do lead (tick azul). Opcional: providers sem
   * suporte apenas ignoram.
   */
  markRead?(accountId: string, message: { id: string; from: string }): Promise<void>;
  /** Baixa a mídia recebida (áudio do lead vem criptografado no payload do webhook). */
  fetchMediaBase64?(
    accountId: string,
    message: { id: string; raw?: unknown },
  ): Promise<{ base64: string; mimetype: string } | null>;
  /** Envia nota de voz. Opcional: provider sem suporte cai no texto. */
  sendVoice?(accountId: string, to: string, audioBase64: string): Promise<SendResult>;
  /**
   * Apaga a mensagem para todos no WhatsApp (revoke). Só vale para mensagem ENVIADA por nós:
   * o WhatsApp não deixa apagar no aparelho do lead uma mensagem que ele mesmo escreveu.
   */
  deleteMessage?(
    accountId: string,
    target: { id: string; from: string },
  ): Promise<{ ok: boolean; error?: string }>;
  /** Indicador de atividade (opcional: provider sem suporte simplesmente ignora). */
  sendPresence?(
    accountId: string,
    to: string,
    presence: "composing" | "recording" | "paused",
    delayMs?: number,
  ): Promise<void>;
}
