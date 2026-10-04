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
  const required = {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
  for (const [key, value] of Object.entries(required)) {
    if (!value) throw new Error(`Variável de ambiente ausente: ${key}`);
  }
  return {
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    defaultModel:
      process.env.ANTHROPIC_DEFAULT_MODEL ?? "claude-opus-5-5",
    cernio: {
      apiUrl: process.env.CERNIO_API_URL ?? "",
      apiKey: process.env.CERNIO_API_KEY ?? "",
      webhookSecret: process.env.CERNIO_WEBHOOK_SECRET ?? "",
    },
    cronSecret: process.env.CRON_SECRET ?? "",
  };
}
