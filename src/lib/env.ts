/**
 * Leitura de variáveis de ambiente. Não valida em build (para não quebrar
 * `next build` sem secrets); falha cedo no uso server-side.
 */

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

/** Número vindo do ambiente: vazio/ inválido cai no padrão (0 é valor legítimo). */
function numeroEnv(nome: string, padrao: number): number {
  const bruto = process.env[nome];
  if (bruto === undefined || bruto.trim() === "") return padrao;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : padrao;
}

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
    handoff: {
      /**
       * Minutos de silêncio (sem resposta humana) até a IA retomar sozinha uma conversa que
       * ficou em transbordo. 0 desliga a retomada automática.
       */
      autoResumeMinutes: numeroEnv("HANDOFF_AUTO_RESUME_MINUTES", 30),
      /**
       * Quantas vezes o lead precisa pedir humano para o transbordo automático valer.
       * 1 = desliga na primeira menção (comportamento antigo, deixava lead no vácuo).
       */
      pedidosAteTransbordar: numeroEnv("HANDOFF_HUMANO_PEDIDOS", 2),
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
      /**
       * Chat do dono (CEO). Cai para `ALERTS_TELEGRAM_CHAT_ID` quando não configurado — é o
       * mesmo número que já recebe os alertas. Mensagem do dono vira conversa interna e o
       * agente responde em modo interno (serviços + andamento do CRM, só leitura).
       */
      ownerChatIds: (process.env.TELEGRAM_OWNER_CHAT_IDS ?? process.env.ALERTS_TELEGRAM_CHAT_ID ?? "")
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
      /**
       * Quem gera a voz:
       *  - `proxy`      → endpoint OpenAI-compatible já configurado (Gemini via proxy) — padrão;
       *  - `piper`      → serviço local leve (MIT, CPU, perto do tempo real) — recomendado;
       *  - `chatterbox` → serviço local que clona timbre (mais natural, ~10x mais lento em CPU);
       *  - `mlvoice`    → MLVoice Engine (Pocket TTS) — endpoint próprio, fora do dialeto OpenAI;
       *  - `auto`       → decide por agente, pelo prefixo da voz.
       *
       * Por agente: `agents.voice = "piper:faber"`, `"chatterbox:vendedor"` ou
       * `"mlvoice:rafael"` usa o motor local; qualquer outro valor continua indo para o proxy.
       */
      provider: (process.env.TTS_PROVIDER ?? "auto").toLowerCase(),
      /** Base do serviço local (OpenAI-compatible: /v1/audio/speech, /voices). */
      chatterboxUrl: (process.env.CHATTERBOX_URL ?? "http://127.0.0.1:4123").replace(/\/+$/, ""),
      /** Serviço local leve (Piper, CPU) — o padrão quando se quer voz própria sem GPU. */
      piperUrl: (process.env.PIPER_URL ?? "http://127.0.0.1:4124").replace(/\/+$/, ""),
      /**
       * MLVoice Engine (Pocket TTS). Dialeto próprio: `POST /v1/tts` com `X-API-Key` no
       * cabeçalho — por isso não passa por `vozPeloServicoLocal` (que fala OpenAI).
       * Vale a URL completa (`.../v1/tts`) ou só a base (`...:8765`) — o código completa.
       */
      mlvoiceUrl: (process.env.MLVOICE_URL ?? "http://127.0.0.1:8765/v1/tts").replace(/\/+$/, ""),
      /** Chave do MLVoice. Vazio = motor desligado (cai no Piper/proxy sem quebrar nada). */
      mlvoiceApiKey: process.env.MLVOICE_API_KEY ?? "",
      /**
       * Voz pedida ao motor (ex.: `rafael`) quando o agente não tem voz própria em
       * `agents.voice`. O MLVoice Engine v2 valida contra a lista dele (`/health`) — nome fora
       * dela devolve HTTP 422. A lista do painel está em `VOICE_CATALOG` (`types/domain.ts`).
       */
      mlvoiceVoice: process.env.MLVOICE_VOICE ?? "",
      /** Idioma mandado ao Chatterbox (pt = português, o finetune pt-BR usa o mesmo id). */
      language: process.env.TTS_LANGUAGE ?? "pt",
      /** Voz do TTS quando o agente que atendeu não tem voz própria. */
      defaultVoice: process.env.TTS_VOICE ?? "alloy",
      /** `auto` deixa o proxy escolher o provedor de TTS/STT. */
      speechModel: process.env.TTS_MODEL ?? "auto",
      transcribeModel: process.env.TRANSCRIBE_MODEL ?? "auto",
      /** Resposta maior que isso vira texto: nota de voz longa é ruim de ouvir. */
      maxChars: Number(process.env.TTS_MAX_CHARS ?? 600),
      /**
       * Teto de espera da geração. No proxy (Gemini) 60s bastam; no Chatterbox em CPU a
       * síntese é lenta, então o padrão é maior — quem tem GPU pode baixar.
       */
      timeoutMs: numeroEnv("TTS_TIMEOUT_MS", 180_000),
    },
  };
}
