import "server-only";
import { serverEnv } from "@/lib/env";
import { createCernioProvider } from "./cernio.adapter";
import { createEvolutionProvider } from "./evolution.adapter";
import { createTelegramProvider } from "./telegram.adapter";
import type { MessageProvider } from "./types";

export type { InboundMessage, MessageProvider, SendResult } from "./types";

function telegramProvider(): MessageProvider {
  const cfg = serverEnv().telegram;
  return createTelegramProvider({
    token: cfg.botToken,
    webhookSecret: cfg.webhookSecret,
    allowedChatIds: cfg.allowedChatIds,
    ownerChatIds: cfg.ownerChatIds,
  });
}

/** Registry de providers. Suporta 'evolution', 'telegram', 'zernio' e 'cernio'. */
const registry: Record<string, () => MessageProvider> = {
  evolution: () => createEvolutionProvider(serverEnv().evolution),
  telegram: telegramProvider,
  zernio: () => createCernioProvider(serverEnv().cernio),
  cernio: () => createCernioProvider(serverEnv().cernio),
};

/** Resolve o provider de mensageria ativo. Default: evolution (se EVOLUTION_INSTANCE set) senão zernio. */
export function getMessageProvider(name?: string): MessageProvider {
  const env = serverEnv();
  const defaultName = env.evolution.instance ? "evolution" : "zernio";
  const factory = registry[(name ?? defaultName).toLowerCase()] ?? registry[defaultName];
  return factory();
}

/**
 * Provider a partir do config do canal (tabela channels.config).
 * config.provider === "evolution" → Evolution; "telegram" → Bot API; senão Zernio/Cernio.
 */
export function providerFromConfig(cfg: any): MessageProvider {
  if (cfg?.provider === "telegram") return telegramProvider();
  if (cfg?.provider === "evolution" || cfg?.instance) {
    return createEvolutionProvider({
      apiUrl: cfg.apiUrl || process.env.EVOLUTION_API_URL || "",
      apiKey: cfg.apiKey || process.env.EVOLUTION_API_KEY || "",
      instance: cfg.instance || process.env.EVOLUTION_INSTANCE || "",
      instanceToken: cfg.instanceToken || process.env.EVOLUTION_INSTANCE_TOKEN || "",
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
