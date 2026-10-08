import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Áudio do atendimento:
 *  - `transcribeAudio`: voz do lead → texto (o agente responde o que ele falou);
 *  - `synthesizeSpeech`: resposta do agente → voz (quando o lead mandou voz).
 *
 * Duas formas de gerar voz:
 *  1. **Chatterbox local** (MIT, roda na própria VPS — `deploy/tts/`): serviço
 *     OpenAI-compatible em `/v1/audio/speech`, com vozes clonadas por agente
 *     (`chatterbox:<nome>`) a partir de amostras de ~10s;
 *  2. **Proxy** já configurado (Gemini via 9router) — o caminho antigo, que segue como
 *     padrão e como reserva: se o serviço local falhar ou estourar o tempo, a resposta
 *     sai em voz pelo proxy em vez de virar silêncio.
 *
 * A saída vai como **OGG/OPUS** (o que o WhatsApp usa em nota de voz): o serviço local já
 * pode devolver opus, e o que vier em wav/mp3 é convertido aqui com ffmpeg (existe na imagem).
 */

function cfgAudio() {
  const { anthropicApiKey, aiBaseUrl, voice } = serverEnv();
  return {
    base: (aiBaseUrl || "").replace(/\/+$/, ""),
    key: anthropicApiKey,
    ...voice,
  };
}

/** `piper:faber` / `chatterbox:vendedor` → serviço local; qualquer outro valor → proxy. */
export function interpretarVoz(voice?: string | null): {
  provedor: "piper" | "chatterbox" | "proxy";
  nome: string;
} {
  const bruto = String(voice ?? "").trim();
  const casou = bruto.match(/^(piper|chatterbox):(.+)$/i);
  if (casou) {
    return {
      provedor: casou[1].toLowerCase() as "piper" | "chatterbox",
      nome: casou[2].trim(),
    };
  }
  return { provedor: "proxy", nome: bruto };
}

/** Converte wav/mp3 → ogg/opus (ffmpeg) para a nota de voz do WhatsApp. */
function paraOpus(entrada: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    void (async () => {
      try {
        const { spawn } = await import("node:child_process");
        const ff = spawn("ffmpeg", [
          "-hide_banner", "-loglevel", "error",
          "-i", "pipe:0",
          "-vn", "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1",
          "-f", "ogg", "pipe:1",
        ]);
        const pedacos: Buffer[] = [];
        ff.stdout.on("data", (c: Buffer) => pedacos.push(c));
        ff.on("error", () => resolve(null));
        ff.on("close", (code) =>
          resolve(code === 0 && pedacos.length > 0 ? Buffer.concat(pedacos) : null),
        );
        ff.stdin.end(entrada);
      } catch {
        resolve(null);
      }
    })();
  });
}

/** Deixa o áudio no formato de nota de voz do WhatsApp (ogg/opus), best-effort. */
async function garantirOpus(
  buf: Buffer,
  mimetype: string,
): Promise<{ base64: string; mimetype: string }> {
  if (/ogg|opus/i.test(mimetype)) return { base64: buf.toString("base64"), mimetype: "audio/ogg" };
  const opus = await paraOpus(buf);
  if (opus) return { base64: opus.toString("base64"), mimetype: "audio/ogg" };
  console.warn("[audio] ffmpeg indisponível: mandando o áudio como veio");
  return { base64: buf.toString("base64"), mimetype };
}

/**
 * Voz por um serviço local (Piper ou Chatterbox) — os dois falam o mesmo dialeto
 * OpenAI-compatible (`/v1/audio/speech`), então só muda a base. `voice` é o nome da voz
 * instalada no serviço (Piper: arquivo `.onnx`; Chatterbox: amostra cadastrada).
 */
async function vozPeloServicoLocal(
  texto: string,
  voz: string,
  base: string,
): Promise<{ base64: string; mimetype: string } | null> {
  const { language, timeoutMs } = cfgAudio();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: texto,
        ...(voz ? { voice: voz } : {}),
        response_format: "opus",
        language,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(`[audio] TTS local ${base} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return null;
    return garantirOpus(buf, res.headers.get("content-type") || "audio/wav");
  } catch (err) {
    console.warn(`[audio] TTS local ${base} falhou:`, (err as Error).message);
    return null;
  }
}

/** Voz pelo proxy OpenAI-compatible (Gemini) — caminho antigo, agora também reserva. */
async function vozPeloProxy(
  texto: string,
  voz: string,
): Promise<{ base64: string; mimetype: string } | null> {
  const { base, key, speechModel, timeoutMs } = cfgAudio();
  if (!base || !key) return null;
  const modelos = speechModel && speechModel !== "auto" ? [speechModel, "auto"] : ["auto"];

  for (const modelo of modelos) {
    try {
      const res = await fetch(`${base}/audio/speech`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelo, input: texto, voice: voz }),
        signal: AbortSignal.timeout(Math.min(timeoutMs, 60_000)),
      });
      if (!res.ok) {
        // 429/cota estourada é o caso comum: registra alto e tenta o próximo modelo.
        console.warn(`[audio] TTS ${modelo} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) continue;
      return garantirOpus(buf, res.headers.get("content-type") || "audio/wav");
    } catch (err) {
      console.warn(`[audio] TTS ${modelo} falhou:`, (err as Error).message);
    }
  }
  return null;
}

/** Voz do lead em texto. Falha → "" (o webhook segue e o agente não responde, como antes). */
export async function transcribeAudio(input: {
  base64: string;
  mimetype?: string;
}): Promise<string> {
  const { base, key, transcribeModel } = cfgAudio();
  if (!base || !key || !input?.base64) return "";

  try {
    const mimetype = input.mimetype || "audio/ogg";
    const bytes = Buffer.from(input.base64, "base64");
    if (bytes.length < 512) return "";
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: mimetype }), `audio.${extensao(mimetype)}`);
    form.append("model", transcribeModel);
    form.append("language", "pt");

    const res = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.warn(`[audio] transcrição HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      return "";
    }
    const data = (await res.json()) as { text?: string };
    return String(data?.text ?? "").trim();
  } catch (err) {
    console.warn("[audio] transcrição falhou:", (err as Error).message);
    return "";
  }
}

/**
 * Resposta do agente em voz. `null` = usar texto (TTS indisponível ou resposta longa).
 *
 * Ordem: serviço local (`piper`/`chatterbox`, quando a voz do agente tem o prefixo ou quando
 * `TTS_PROVIDER` aponta para ele); senão o proxy. Em qualquer caso, se o escolhido falhar,
 * tenta o outro antes de desistir — melhor voz diferente do que lead sem resposta.
 */
export async function synthesizeSpeech(
  text: string,
  voice?: string | null,
): Promise<{ base64: string; mimetype: string } | null> {
  const { provider, defaultVoice, maxChars, piperUrl, chatterboxUrl } = cfgAudio();
  const limpo = String(text ?? "").trim();
  if (!limpo) return null;
  if (limpo.length > maxChars) {
    console.log(`[audio] resposta com ${limpo.length} chars passa de ${maxChars}: vai como texto`);
    return null;
  }

  const alvo = interpretarVoz(voice);
  // Sem prefixo, o provedor configurado decide; `auto` deixa a escolha por agente.
  const localPedido: "piper" | "chatterbox" | null =
    alvo.provedor !== "proxy"
      ? alvo.provedor
      : provider === "piper" || provider === "chatterbox"
        ? provider
        : null;

  if (localPedido) {
    const base = localPedido === "piper" ? piperUrl : chatterboxUrl;
    const nomeVoz = alvo.nome || (localPedido === "piper" ? "" : defaultVoice);
    const audio = await vozPeloServicoLocal(limpo, nomeVoz, base);
    if (audio) return audio;
    // Reserva: o lead recebe a resposta em voz de qualquer forma.
    console.warn(`[audio] caindo para o proxy (${localPedido} não respondeu)`);
    return vozPeloProxy(limpo, defaultVoice);
  }

  const audio = await vozPeloProxy(limpo, alvo.nome || defaultVoice);
  if (audio) return audio;
  // Sem voz pelo proxy: se algum serviço local estiver no ar, tenta antes de desistir.
  if (provider === "auto") {
    return (await vozPeloServicoLocal(limpo, "", piperUrl)) ??
      (await vozPeloServicoLocal(limpo, "", chatterboxUrl));
  }
  return null;
}

function extensao(mimetype: string): string {
  if (mimetype.includes("ogg")) return "ogg";
  if (mimetype.includes("mpeg") || mimetype.includes("mp3")) return "mp3";
  if (mimetype.includes("mp4") || mimetype.includes("m4a")) return "m4a";
  if (mimetype.includes("wav")) return "wav";
  return "ogg";
}
