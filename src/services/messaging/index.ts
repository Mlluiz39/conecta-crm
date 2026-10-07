import "server-only";
import { serverEnv } from "@/lib/env";
import { createCernioProvider } from "./cernio.adapter";
import { createEvolutionProvider } from "./evolution.adapter";
import { createHermesProvider } from "./hermes.adapter";
import { createTelegramProvider } from "./telegram.adapter";
import type { MessageProvider } from "./types";

export type { InboundMessage, MessageProvider, SendResult } from "./types";

function hermesProvider(): MessageProvider {
  const e = serverEnv();
  return createHermesProvider({ bin: e.hermes.bin, home: e.hermes.home });
}

function telegramProvider(): MessageProvider {
  const cfg = serverEnv().telegram;
  return createTelegramProvider({
    token: cfg.botToken,
    webhookSecret: cfg.webhookSecret,
    allowedChatIds: cfg.allowedChatIds,
  });
}

/** Registry de providers. Suporta 'hermes', 'evolution', 'telegram', 'zernio' e 'cernio'. */
const registry: Record<string, () => MessageProvider> = {
  hermes: hermesProvider,
  evolution: () => createEvolutionProvider(serverEnv().evolution),
  telegram: telegramProvider,
  zernio: () => createCernioProvider(serverEnv().cernio),
  cernio: () => createCernioProvider(serverEnv().cernio),
};

/** Resolve o provider de mensageria ativo. Default: hermes (se HERMES_BIN set) senão evolution. */
export function getMessageProvider(name?: string): MessageProvider {
  const env = serverEnv();
  const defaultName = env.hermes.bin ? "hermes" : env.evolution.instance ? "evolution" : "zernio";
  const factory = registry[(name ?? defaultName).toLowerCase()] ?? registry[defaultName];
  return factory();
}

/**
 * Provider a partir do config do canal (tabela channels.config).
 * config.provider === "hermes" → Hermes CLI; "evolution" → Evolution; "telegram" → Bot API;
 * senão Zernio/Cernio.
 */
export function providerFromConfig(cfg: any): MessageProvider {
  if (cfg?.provider === "hermes") return hermesProvider();
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
