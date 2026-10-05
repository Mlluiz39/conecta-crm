import "server-only";
import { serverEnv } from "@/lib/env";
import { createCernioProvider } from "./cernio.adapter";
import { createEvolutionProvider } from "./evolution.adapter";
import type { MessageProvider } from "./types";

export type { InboundMessage, MessageProvider, SendResult } from "./types";

/** Registry de providers. Suporta 'evolution', 'zernio' e 'cernio'. */
const registry: Record<string, () => MessageProvider> = {
  evolution: () => createEvolutionProvider(serverEnv().evolution),
  zernio: () => createCernioProvider(serverEnv().cernio),
  cernio: () => createCernioProvider(serverEnv().cernio),
};

/** Resolve o provider de mensageria ativo. Default: evolution (se EVOLUTION_* set) senão zernio. */
export function getMessageProvider(name?: string): MessageProvider {
  const defaultName = serverEnv().evolution.instance ? "evolution" : "zernio";
  const factory = registry[(name ?? defaultName).toLowerCase()] ?? registry[defaultName];
  return factory();
}

/**
 * Provider a partir do config do canal (tabela channels.config).
 * config.provider === "evolution" → Evolution; caso contrário Zernio/Cernio.
 */
export function providerFromConfig(cfg: any): MessageProvider {
  if (cfg?.provider === "evolution" || cfg?.instance) {
    return createEvolutionProvider({
      apiUrl: cfg.apiUrl || process.env.EVOLUTION_API_URL || "",
      apiKey: cfg.apiKey || process.env.EVOLUTION_API_KEY || "",
      instance: cfg.instance || process.env.EVOLUTION_INSTANCE || "",
    });
  }
  if (cfg?.apiKey) {
    return createCernioProvider({
      apiUrl: cfg.apiUrl || "https://api.zernio.com",
      apiKey: cfg.apiKey,
      webhookSecret: cfg.webhookSecret || "",
    });
  }
  return getMessageProvider();
}
