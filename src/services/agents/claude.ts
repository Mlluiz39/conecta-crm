import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

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
 * Executa o loop do agente com suporte dual:
 * 1. Se BASE_URL estiver configurada (ex.: 9router, OneAPI, LiteLLM): usa protocolo padrão OpenAI (/v1/chat/completions)
 * 2. Se não houver BASE_URL: usa o SDK nativo da Anthropic
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

  // ── 1. PROTOCOLO OPENAI (9router, OneAPI, LiteLLM, OpenAI) ──
  if (env.aiBaseUrl) {
    const rawUrl = env.aiBaseUrl.replace(/\/$/, "");
    const endpoint = rawUrl.endsWith("/chat/completions")
      ? rawUrl
      : rawUrl.endsWith("/v1")
        ? `${rawUrl}/chat/completions`
        : `${rawUrl}/v1/chat/completions`;

    // Converte ferramentas para o formato de function calling da OpenAI
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

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`9router HTTP ${res.status}: ${errText}`);
        }

        const data = await res.json();
        const choice = data.choices?.[0];
        const message = choice?.message;

        tokensIn += data.usage?.prompt_tokens ?? 0;
        tokensOut += data.usage?.completion_tokens ?? 0;

        // Se o modelo invocou ferramentas (tool_calls)
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

        // Resposta final de texto
        const reply = (message?.content || "").trim();
        return {
          reply,
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
        const reply = res.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();

        return {
          reply,
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

/** Função utilitária para gerar texto simples (usada no 'melhorar prompt com IA') */
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
      }),
    });

    if (!res.ok) {
      throw new Error(`9router HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    return (data.choices?.[0]?.message?.content || "").trim();
  }

  const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
  const res = await anthropic.messages.create({
    model: env.defaultModel,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
