import "server-only";
import { serverEnv } from "@/lib/env";
import { createCernioProvider } from "./cernio.adapter";
import type { MessageProvider } from "./types";

export type { InboundMessage, MessageProvider, SendResult } from "./types";

/** Registry de providers. Suporta 'zernio' e 'cernio'. */
const registry: Record<string, () => MessageProvider> = {
  zernio: () => createCernioProvider(serverEnv().cernio),
  cernio: () => createCernioProvider(serverEnv().cernio),
};

/** Resolve o provider de mensageria ativo. Default: zernio. */
export function getMessageProvider(name = "zernio"): MessageProvider {
  const factory = registry[name.toLowerCase()] ?? registry.zernio;
  return factory();
}
