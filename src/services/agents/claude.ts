import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    const env = serverEnv();
    client = new Anthropic({
      apiKey: env.anthropicApiKey,
      baseURL: env.anthropicBaseUrl,
    });
  }
  return client;
}

export type ToolSchema = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
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
 * Loop de tool use do Claude. Executa apenas as ferramentas passadas em
 * `tools` (já filtradas por agente).
 */
export async function runAgentLoop(params: {
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  tools: ToolSchema[];
  executeTool: (key: string, input: unknown) => Promise<unknown>;
}): Promise<AgentLoopResult> {
  const startedAt = Date.now();
  const anthropic = getAnthropic();
  const convo: Anthropic.MessageParam[] = [...params.messages];
  const toolCalls: ToolCallRecord[] = [];
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const createPayload: any = {
        model: params.model,
        max_tokens: 2048,
        system: params.system,
        messages: convo,
      };

      // Anthropic rejeita array vazio de tools (deve ser omitido se length === 0)
      if (params.tools && params.tools.length > 0) {
        createPayload.tools = params.tools;
      }

      const res = await anthropic.messages.create(createPayload);

      tokensIn += res.usage.input_tokens;
      tokensOut += res.usage.output_tokens;

      if (res.stop_reason === "refusal") {
        return {
          reply: "⚠️ A solicitação foi recusada pelos filtros de segurança do modelo.",
          toolCalls,
          stopReason: "refusal",
          tokensIn,
          tokensOut,
          latencyMs: Date.now() - startedAt,
          error: "Recusado por segurança",
        };
      }

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

      // Executa as tool_use e devolve todos os tool_result numa única mensagem
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
      reply: "⚠️ Limite de iterações de ferramentas atingido.",
      toolCalls,
      stopReason: "max_iterations",
      tokensIn,
      tokensOut,
      latencyMs: Date.now() - startedAt,
      error: "Limite de iterações de ferramentas atingido",
    };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    console.error("[Claude API Erro]", err);
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
