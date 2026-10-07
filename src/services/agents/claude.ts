import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { sanitizeAiReply } from "./sanitizer";

export type ToolSchema = {
  name: string;
  description: string;
  input_schema: any;
};

export type ToolCallRecord = {
  tool_key: string;
  input: unknown;
  output: unknown;
};

export type AgentLoopResult = {
  reply: string;
  toolCalls: ToolCallRecord[];
  stopReason: string | null;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  error?: string;
};

const MAX_ITERATIONS = 5;

/**
 * Trata respostas de gateways OpenAI / 9router que podem retornar JSON simples
 * ou stream SSE ("data: { ... }").
 */
function parseOpenAiResponse(rawText: string): any {
  const trimmed = rawText.trim();

  // 1. Se for JSON direto
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // continua para tentativa de parsing SSE
    }
  }

  // 2. Se o gateway retornou Server-Sent Events (SSE / streaming com prefixo "data: ")
  if (trimmed.includes("data:")) {
    let fullContent = "";
    const toolCallsMap = new Map<number, any>();
    let finishReason = "stop";
    let promptTokens = 0;
    let completionTokens = 0;

    const lines = trimmed.split("\n");
    for (const line of lines) {
      const lineTrim = line.trim();
      if (!lineTrim.startsWith("data:") || lineTrim === "data: [DONE]") continue;

      const jsonStr = lineTrim.slice(5).trim();
      try {
        const chunk = JSON.parse(jsonStr);
        const choice = chunk.choices?.[0];

        if (choice?.delta?.content) {
          fullContent += choice.delta.content;
        } else if (choice?.message?.content) {
          fullContent += choice.message.content;
        }

        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }

        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
          completionTokens = chunk.usage.completion_tokens ?? completionTokens;
        }

        // Se houver chamada de ferramenta no chunk
        if (choice?.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallsMap.has(idx)) {
              toolCallsMap.set(idx, {
                id: tc.id || `call_${idx}`,
                type: "function",
                function: { name: tc.function?.name || "", arguments: "" },
              });
            }
            const existing = toolCallsMap.get(idx);
            if (tc.function?.name) existing.function.name = tc.function.name;
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
          }
        }
      } catch {
        // ignora chunk corrompido
      }
    }

    const toolCalls = Array.from(toolCallsMap.values());

    return {
      choices: [
        {
          finish_reason: finishReason,
          message: {
            role: "assistant",
            content: fullContent,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          },
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
      },
    };
  }

  return JSON.parse(trimmed);
}

/**
 * Executa o loop do agente com suporte dual:
 * 1. 9router / OpenAI format: suporte a tool_calls nativos, stream SSE e tool calls embutidos no content
 * 2. Anthropic SDK nativo
 */
/** Um alvo de LLM (endpoint OpenAI-compatible + chave + modelo). */
export type LlmTarget = { label: string; endpoint: string; apiKey: string; model: string };

function endpointDeChat(baseUrl: string): string {
  const raw = (baseUrl || "").replace(/\/+$/, "");
  if (!raw) return "";
  if (raw.endsWith("/chat/completions")) return raw;
  if (raw.endsWith("/v1")) return `${raw}/chat/completions`;
  return `${raw}/v1/chat/completions`;
}

function rotuloDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 40) || "fallback";
  }
}

/**
 * Cadeia de LLM: o primário vem do env (ex.: freellmapi + modelo `auto`) e os fallbacks de
 * `AI_FALLBACK_TARGETS` (JSON). Sem isso, um 502 do proxy deixa o cliente sem resposta —
 * foi o que aconteceu em 07/10/2026.
 *
 *   AI_FALLBACK_TARGETS='[{"baseUrl":"https://openrouter.ai/api/v1","apiKey":"sk-...","model":"qwen/qwen3.8-flash"}]'
 */
export function llmTargets(modeloPrincipal: string): LlmTarget[] {
  const env = serverEnv();
  const alvos: LlmTarget[] = [];
  if (env.aiBaseUrl) {
    alvos.push({
      label: "principal",
      endpoint: endpointDeChat(env.aiBaseUrl),
      apiKey: env.anthropicApiKey,
      model: modeloPrincipal,
    });
  }
  const bruto = process.env.AI_FALLBACK_TARGETS ?? "";
  if (bruto.trim()) {
    try {
      const lista = JSON.parse(bruto) as { baseUrl?: string; apiKey?: string; model?: string; label?: string }[];
      for (const item of Array.isArray(lista) ? lista : []) {
        if (!item?.baseUrl) continue;
        alvos.push({
          label: item.label || rotuloDe(item.baseUrl),
          endpoint: endpointDeChat(item.baseUrl),
          apiKey: item.apiKey || "",
          model: item.model || modeloPrincipal,
        });
      }
    } catch (err) {
      console.error("[llm] AI_FALLBACK_TARGETS não é JSON válido:", (err as Error).message);
    }
  }
  return alvos;
}

export async function runAgentLoop(params: {
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  tools: ToolSchema[];
  executeTool: (key: string, input: unknown) => Promise<unknown>;
}): Promise<AgentLoopResult> {
  const startedAt = Date.now();
  const env = serverEnv();
  const toolCalls: ToolCallRecord[] = [];
  let tokensIn = 0;
  let tokensOut = 0;

  // ── 1. PROTOCOLO OPENAI (9router, OneAPI, LiteLLM) ──
  if (env.aiBaseUrl) {
    const rawUrl = env.aiBaseUrl.replace(/\/$/, "");
    const endpoint = rawUrl.endsWith("/chat/completions")
      ? rawUrl
      : rawUrl.endsWith("/v1")
        ? `${rawUrl}/chat/completions`
        : `${rawUrl}/v1/chat/completions`;

    // Converte ferramentas para o formato function calling da OpenAI
    const openAiTools = params.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    // Mensagens em formato OpenAI
    const openAiMessages: any[] = [
      { role: "system", content: params.system },
      ...params.messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
    ];

    const alvos = llmTargets(params.model || env.defaultModel);
    let alvoAtual = 0;

    try {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const payload: any = {
          model: alvos[alvoAtual].model,
          messages: openAiMessages,
          stream: false, // Força não-streaming para evitar SSE
        };

        if (openAiTools.length > 0) {
          payload.tools = openAiTools;
        }

        // Chamada com cadeia de fallback: proxy fora do ar não pode calar o atendimento.
        let resposta: { text: string } | null = null;
        let ultimoErro = "sem alvos configurados";
        while (alvoAtual < alvos.length) {
          const alvo = alvos[alvoAtual];
          payload.model = alvo.model;
          try {
            const res = await fetch(alvo.endpoint, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${alvo.apiKey}`,
              },
              body: JSON.stringify(payload),
            });
            const raw = await res.text();
            if (res.ok) {
              resposta = { text: raw };
              break;
            }
            ultimoErro = `HTTP ${res.status} em "${alvo.label}": ${raw.slice(0, 180)}`;
          } catch (err) {
            ultimoErro = `falha de rede em "${alvo.label}": ${(err as Error).message}`;
          }
          console.warn(`[llm] alvo "${alvo.label}" falhou, tentando o próximo — ${ultimoErro}`);
          alvoAtual++;
        }
        if (!resposta) {
          throw new Error(`todos os alvos de LLM falharam — último erro: ${ultimoErro}`);
        }

        const data = parseOpenAiResponse(resposta.text);
        const choice = data.choices?.[0];
        const message = choice?.message;

        tokensIn += data.usage?.prompt_tokens ?? 0;
        tokensOut += data.usage?.completion_tokens ?? 0;

        // A) Modelo invocou ferramentas via tool_calls nativos da OpenAI
        if (message?.tool_calls && message.tool_calls.length > 0) {
          openAiMessages.push(message);

          for (const call of message.tool_calls) {
            let args = {};
            try {
              args =
                typeof call.function.arguments === "string"
                  ? JSON.parse(call.function.arguments)
                  : call.function.arguments;
            } catch {
              args = {};
            }

            let output: any;
            try {
              output = await params.executeTool(call.function.name, args);
            } catch (e: any) {
              output = { error: e.message };
            }

            toolCalls.push({
              tool_key: call.function.name,
              input: args,
              output,
            });

            openAiMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify(output ?? null),
            });
          }
          continue;
        }

        // B) Modelo embutiu a chamada de ferramenta como JSON em content (fallback para modelos customizados)
        if (message?.content) {
          const rawContent = message.content.trim();
          if (rawContent.startsWith("{") && rawContent.endsWith("}")) {
            try {
              const parsed = JSON.parse(rawContent);
              const toolName = parsed.name || parsed.tool || parsed.function?.name;
              const toolArgs =
                parsed.arguments || parsed.parameters || parsed.input || parsed.function?.arguments || {};

              if (toolName && typeof toolName === "string") {
                const args = typeof toolArgs === "string" ? JSON.parse(toolArgs) : toolArgs;
                let output: any;
                try {
                  output = await params.executeTool(toolName, args);
                } catch (e: any) {
                  output = { error: e.message };
                }

                toolCalls.push({
                  tool_key: toolName,
                  input: args,
                  output,
                });

                openAiMessages.push(message);
                openAiMessages.push({
                  role: "user",
                  content: `[Resultado da ação ${toolName}]: ${JSON.stringify(output ?? null)}. Formule agora a resposta em texto amigável e natural para o cliente, sem nenhum JSON ou código.`,
                });
                continue;
              }
            } catch {
              // Não era JSON de ferramenta
            }
          }
        }

        // Resposta final higienizada (sem JSON bruto vazado)
        const cleanReply = sanitizeAiReply(message?.content || "");

        return {
          reply: cleanReply || (message?.content || "").trim(),
          toolCalls,
          stopReason: choice?.finish_reason || "stop",
          tokensIn,
          tokensOut,
          latencyMs: Date.now() - startedAt,
        };
      }

      return {
        // Sem texto ao cliente: o engine trata `error` como turno falho.
        reply: "",
        toolCalls,
        stopReason: "max_iterations",
        tokensIn,
        tokensOut,
        latencyMs: Date.now() - startedAt,
      };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      console.error("[9router OpenAI Error]", err);
      return {
        reply: "",
        toolCalls,
        stopReason: "error",
        tokensIn,
        tokensOut,
        latencyMs: Date.now() - startedAt,
        error: errorMsg,
      };
    }
  }

  // ── 2. PROTOCOLO ANTHROPIC NATIVO ──
  try {
    const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
    const convo: Anthropic.MessageParam[] = [...params.messages];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const createPayload: any = {
        model: params.model || env.defaultModel,
        max_tokens: 2048,
        system: params.system,
        messages: convo,
      };

      if (params.tools && params.tools.length > 0) {
        createPayload.tools = params.tools;
      }

      const res = await anthropic.messages.create(createPayload);

      tokensIn += res.usage.input_tokens;
      tokensOut += res.usage.output_tokens;

      if (res.stop_reason !== "tool_use") {
        const rawText = res.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();

        const reply = sanitizeAiReply(rawText);

        return {
          reply: reply || rawText,
          toolCalls,
          stopReason: res.stop_reason,
          tokensIn,
          tokensOut,
          latencyMs: Date.now() - startedAt,
        };
      }

      convo.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        let output: unknown;
        let isError = false;
        try {
          output = await params.executeTool(block.name, block.input);
        } catch (err) {
          output = { error: (err as Error).message };
          isError = true;
        }
        toolCalls.push({ tool_key: block.name, input: block.input, output });
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output ?? null),
          is_error: isError,
        });
      }
      convo.push({ role: "user", content: results });
    }

    return {
      reply: "⚠️ Limite de iterações atingido.",
      toolCalls,
      stopReason: "max_iterations",
      tokensIn,
      tokensOut,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    console.error("[Claude API Error]", err);
    return {
      reply: `⚠️ Erro da IA: ${errorMsg}`,
      toolCalls,
      stopReason: "error",
      tokensIn,
      tokensOut,
      latencyMs: Date.now() - startedAt,
      error: errorMsg,
    };
  }
}

/** Função utilitária para gerar texto simples */
export async function generateText(prompt: string, systemPrompt?: string): Promise<string> {
  const env = serverEnv();

  if (env.aiBaseUrl) {
    const rawUrl = env.aiBaseUrl.replace(/\/$/, "");
    const endpoint = rawUrl.endsWith("/chat/completions")
      ? rawUrl
      : rawUrl.endsWith("/v1")
        ? `${rawUrl}/chat/completions`
        : `${rawUrl}/v1/chat/completions`;

    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.anthropicApiKey}`,
      },
      body: JSON.stringify({
        model: env.defaultModel,
        messages,
        stream: false,
      }),
    });

    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`9router HTTP ${res.status}: ${rawText}`);
    }

    const data = parseOpenAiResponse(rawText);
    return sanitizeAiReply((data.choices?.[0]?.message?.content || "").trim());
  }

  const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
  const res = await anthropic.messages.create({
    model: env.defaultModel,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return sanitizeAiReply(raw);
}
