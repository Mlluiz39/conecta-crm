import { NextResponse } from "next/server";
import fs from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loadEnv() {
  const envFile = fs.existsSync(".env.local") ? ".env.local" : ".env";
  const content = fs.readFileSync(envFile, "utf-8");
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

export async function GET() {
  const env = loadEnv();
  const apiKey = env.ANTHROPIC_API_KEY || "";
  const rawBaseUrl = env.BASE_URL || env.ANTHROPIC_BASE_URL || "https://9router.agitapay.qzz.io/v1";
  const baseUrl = rawBaseUrl.replace(/\/$/, "");
  const model = env.ANTHROPIC_DEFAULT_MODEL || "my-combo";

  const results: any = {
    config: {
      apiKey: apiKey.slice(0, 10) + "...",
      baseUrl,
      model,
    },
  };

  // 1. Teste no formato OpenAI (/v1/chat/completions)
  try {
    const openAiUrl = baseUrl.endsWith("/v1")
      ? `${baseUrl}/chat/completions`
      : `${baseUrl}/v1/chat/completions`;

    const res1 = await fetch(openAiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Ola! Responda apenas com a palavra TESTE." }],
      }),
    });

    results.test_openai = {
      url: openAiUrl,
      status: res1.status,
      ok: res1.ok,
      data: await res1.json().catch(async () => await res1.text()),
    };
  } catch (e: any) {
    results.test_openai = { error: e.message };
  }

  // 2. Teste no formato Anthropic nativo (/v1/messages)
  try {
    const anthropicUrl = baseUrl.endsWith("/v1")
      ? `${baseUrl}/messages`
      : `${baseUrl}/v1/messages`;

    const res2 = await fetch(anthropicUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 100,
        messages: [{ role: "user", content: "Ola! Responda apenas com a palavra TESTE." }],
      }),
    });

    results.test_anthropic = {
      url: anthropicUrl,
      status: res2.status,
      ok: res2.ok,
      data: await res2.json().catch(async () => await res2.text()),
    };
  } catch (e: any) {
    results.test_anthropic = { error: e.message };
  }

  return NextResponse.json(results);
}
