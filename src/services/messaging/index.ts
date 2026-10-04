import "server-only";
import { serverEnv } from "@/lib/env";
import { createCernioProvider } from "./cernio.adapter";
import type { MessageProvider } from "./types";

export type { InboundMessage, MessageProvider, SendResult } from "./types";

/** Registry de providers. Adicionar Meta Cloud API = registrar aqui. */
const registry: Record<string, () => MessageProvider> = {
  cernio: () => createCernioProvider(serverEnv().cernio),
};

/** Resolve o provider de mensageria ativo. Default: cernio. */
export function getMessageProvider(name = "cernio"): MessageProvider {
  const factory = registry[name] ?? registry.cernio;
  return factory();
}
