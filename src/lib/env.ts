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
      // A Evolution manda o TOKEN DA INSTÂNCIA no campo `apikey` do webhook — que é
      // diferente da chave global usada para enviar. Sem aceitar os dois, o webhook
      // legítimo é recusado com 401.
      instanceToken: process.env.EVOLUTION_INSTANCE_TOKEN ?? "",
    },
    hermes: {
      bin: process.env.HERMES_BIN ?? "",
      home: process.env.HERMES_HOME ?? "",
    },
    telegram: {
      /** Mesmo bot dos alertas: é o bot do CRM — aqui ele atende, não só avisa. */
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
      /** secret_token do setWebhook: sem ele o webhook é recusado (endpoint é público). */
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
      /**
       * Quem pode conversar com o bot (chat ids separados por vírgula). Vazio = qualquer um,
       * o que deixa o agente respondendo qualquer pessoa que ache o @ do bot.
       */
      allowedChatIds: (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    },
    apify: {
      apiKey: process.env.APIFY_API_KEY ?? "",
      /** Actor do Google Maps usado na busca de empresas. */
      actor: process.env.APIFY_GOOGLE_MAPS_ACTOR ?? "compass~crawler-google-places",
    },
    aisa: {
      apiKey: process.env.AISA_API_KEY ?? "",
      baseUrl: process.env.AISA_API_URL ?? "https://api.aisa.one/apis/v1",
    },
    cronSecret: process.env.CRON_SECRET ?? "",
    voice: {
      /** Voz do TTS quando o agente que atendeu não tem voz própria. */
      defaultVoice: process.env.TTS_VOICE ?? "alloy",
      /** `auto` deixa o proxy escolher o provedor de TTS/STT. */
      speechModel: process.env.TTS_MODEL ?? "auto",
      transcribeModel: process.env.TRANSCRIBE_MODEL ?? "auto",
      /** Resposta maior que isso vira texto: nota de voz longa é ruim de ouvir. */
      maxChars: Number(process.env.TTS_MAX_CHARS ?? 600),
    },
  };
}
