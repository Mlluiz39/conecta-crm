import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Áudio do atendimento:
 *  - `transcribeAudio`: voz do lead → texto (o agente responde o que ele falou);
 *  - `synthesizeSpeech`: resposta do agente → voz (quando o lead mandou voz).
 *
 * Usa o mesmo endpoint OpenAI-compatible do LLM (`/audio/transcriptions` e `/audio/speech`),
 * ou seja, o mesmo proxy/chave já configurados — sem provedor extra.
 * A conversão para ogg/opus (exigida pela nota de voz do WhatsApp) é feita pela Evolution.
 */

function cfgAudio() {
  const { anthropicApiKey, aiBaseUrl, voice } = serverEnv();
  return {
    base: (aiBaseUrl || "").replace(/\/+$/, ""),
    key: anthropicApiKey,
    ...voice,
  };
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
 * Tenta o modelo fixo (`TTS_MODEL`) e, se ele falhar, o `auto` do proxy — assim o timbre
 * é determinístico no dia a dia sem perder a resposta em voz quando o fixo cai.
 */
export async function synthesizeSpeech(
  text: string,
  voice?: string | null,
): Promise<{ base64: string; mimetype: string } | null> {
  const { base, key, defaultVoice, speechModel, maxChars } = cfgAudio();
  const limpo = String(text ?? "").trim();
  if (!base || !key || !limpo) return null;
  if (limpo.length > maxChars) {
    console.log(`[audio] resposta com ${limpo.length} chars passa de ${maxChars}: vai como texto`);
    return null;
  }

  const voz = voice?.trim() || defaultVoice;
  const modelos = speechModel && speechModel !== "auto" ? [speechModel, "auto"] : ["auto"];

  for (const modelo of modelos) {
    try {
      const res = await fetch(`${base}/audio/speech`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelo, input: limpo, voice: voz }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        // 429/cota estourada é o caso comum: registra alto e tenta o próximo modelo.
        console.warn(`[audio] TTS ${modelo} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) continue;
      return {
        base64: buf.toString("base64"),
        mimetype: res.headers.get("content-type") || "audio/wav",
      };
    } catch (err) {
      console.warn(`[audio] TTS ${modelo} falhou:`, (err as Error).message);
    }
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
