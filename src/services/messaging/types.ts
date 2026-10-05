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
  markRead(accountId: string, externalMessageId: string): Promise<void>;
}
