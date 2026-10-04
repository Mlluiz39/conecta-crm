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

    try {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const payload: any = {
          model: params.model || env.defaultModel,
          messages: openAiMessages,
          stream: false, // Força não-streaming para evitar SSE
        };

        if (openAiTools.length > 0) {
          payload.tools = openAiTools;
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.anthropicApiKey}`,
          },
          body: JSON.stringify(payload),
        });

        const rawText = await res.text();
        if (!res.ok) {
          throw new Error(`9router HTTP ${res.status}: ${rawText}`);
        }

        const data = parseOpenAiResponse(rawText);
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
        reply: "⚠️ Limite de iterações de ferramentas atingido.",
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
        reply: `⚠️ Erro do 9router: ${errorMsg}`,
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
