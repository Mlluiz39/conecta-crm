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

/** `chatterbox:vendedor` → serviço local; qualquer outro valor → voz do proxy. */
export function interpretarVoz(voice?: string | null): {
  provedor: "chatterbox" | "proxy";
  nome: string;
} {
  const bruto = String(voice ?? "").trim();
  const casou = bruto.match(/^chatterbox:(.+)$/i);
  if (casou) return { provedor: "chatterbox", nome: casou[1].trim() };
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
 * Voz pelo serviço local (Chatterbox). `voice` é o nome da voz na biblioteca do serviço
 * (`/voices`) — normalmente uma amostra clonada do próprio agente.
 */
async function chirpChatterbox(
  texto: string,
  voz: string,
): Promise<{ base64: string; mimetype: string } | null> {
  const { chatterboxUrl, language, timeoutMs } = cfgAudio();
  if (!chatterboxUrl) return null;
  try {
    const res = await fetch(`${chatterboxUrl}/v1/audio/speech`, {
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
      console.warn(`[audio] chatterbox HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return null;
    return garantirOpus(buf, res.headers.get("content-type") || "audio/ogg");
  } catch (err) {
    console.warn("[audio] chatterbox falhou:", (err as Error).message);
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
 * Ordem: serviço local (Chatterbox) quando a voz do agente é `chatterbox:<nome>` ou quando
 * `TTS_PROVIDER=chatterbox`; senão o proxy. Em qualquer caso, se o escolhido falhar, tenta o
 * outro antes de desistir — melhor voz diferente do que lead sem resposta.
 */
export async function synthesizeSpeech(
  text: string,
  voice?: string | null,
): Promise<{ base64: string; mimetype: string } | null> {
  const { provider, defaultVoice, maxChars } = cfgAudio();
  const limpo = String(text ?? "").trim();
  if (!limpo) return null;
  if (limpo.length > maxChars) {
    console.log(`[audio] resposta com ${limpo.length} chars passa de ${maxChars}: vai como texto`);
    return null;
  }

  const alvo = interpretarVoz(voice);
  const nomeVoz = alvo.nome || (alvo.provedor === "chatterbox" ? "" : defaultVoice);

  const usaChatterbox = alvo.provedor === "chatterbox" || provider === "chatterbox";
  const usaProxy = alvo.provedor === "proxy" && provider !== "chatterbox";

  if (usaChatterbox) {
    const audio = await chirpChatterbox(limpo, nomeVoz);
    if (audio) return audio;
    // Reserva: o lead recebe a resposta em voz de qualquer forma.
    console.warn("[audio] caindo para o proxy (chatterbox não respondeu)");
    return vozPeloProxy(limpo, defaultVoice);
  }

  if (usaProxy) {
    const audio = await vozPeloProxy(limpo, nomeVoz);
    if (audio) return audio;
    // Sem voz pelo proxy: se o serviço local estiver configurado, tenta ele antes de desistir.
    if (provider === "auto") return chirpChatterbox(limpo, "");
    return null;
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
