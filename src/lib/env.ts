/**
 * Leitura de variáveis de ambiente. Não valida em build (para não quebrar
 * `next build` sem secrets); falha cedo no uso server-side.
 */

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export function serverEnv() {
  const apiKey =
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "";

  const baseUrl =
    process.env.BASE_URL ||
    process.env.ANTHROPIC_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    undefined;

  const defaultModel =
    process.env.ANTHROPIC_DEFAULT_MODEL ||
    process.env.OPENAI_MODEL ||
    "my-combo";

  return {
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    anthropicApiKey: apiKey,
    aiBaseUrl: baseUrl,
    defaultModel,
    cernio: {
      apiUrl: process.env.CERNIO_API_URL ?? "https://api.zernio.com",
      apiKey: process.env.CERNIO_API_KEY ?? "",
      webhookSecret: process.env.CERNIO_WEBHOOK_SECRET ?? "",
    },
    evolution: {
      apiUrl: process.env.EVOLUTION_API_URL ?? "",
      apiKey: process.env.EVOLUTION_API_KEY ?? "",
      instance: process.env.EVOLUTION_INSTANCE ?? "",
    },
    cronSecret: process.env.CRON_SECRET ?? "",
  };
}
