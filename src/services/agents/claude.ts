import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: serverEnv().anthropicApiKey });
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
 * `tools` (já filtradas por agente). `executeTool` roda server-side e devolve
 * o resultado serializável.
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
      const res = await anthropic.messages.create({
        model: params.model,
        max_tokens: 2048,
        system: [
          { type: "text", text: params.system, cache_control: { type: "ephemeral" } },
        ],
        tools: params.tools,
        messages: convo,
      });

      tokensIn += res.usage.input_tokens;
      tokensOut += res.usage.output_tokens;

      if (res.stop_reason === "refusal") {
        return {
          reply: "",
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

      // Executa as tool_use e devolve TODOS os tool_result numa única mensagem.
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
      reply: "",
      toolCalls,
      stopReason: "max_iterations",
      tokensIn,
      tokensOut,
      latencyMs: Date.now() - startedAt,
      error: "Limite de iterações de ferramentas atingido",
    };
  } catch (err) {
    return {
      reply: "",
      toolCalls,
      stopReason: "error",
      tokensIn,
      tokensOut,
      latencyMs: Date.now() - startedAt,
      error: (err as Error).message,
    };
  }
}
