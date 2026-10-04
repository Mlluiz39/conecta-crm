import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentRole,
  AgentToolKey,
  ChannelType,
  HandoffRuleKey,
  PromptVariables,
} from "@/types/domain";
import { AGENT_ROLE_LABEL, CHANNEL_LABEL } from "@/types/domain";
import { serverEnv } from "@/lib/env";
import { runAgentLoop } from "./claude";
import { evaluateHandoff } from "./handoff";
import { renderPrompt } from "./prompt";
import { executeTool, toolsForClaude } from "./tools";

const HISTORY_LIMIT = 20;

export type EngineResult = {
  handled: boolean;
  reply?: string;
  reason?: string;
  handoffRule?: HandoffRuleKey;
  aiRunId?: string;
};

/** Resolve o agente que atende um canal, pela regra de 1 ativo por canal. */
export async function resolveChannelAgent(
  supabase: SupabaseClient,
  organizationId: string,
  channel: ChannelType,
): Promise<{ agentId: string } | null> {
  const { data } = await supabase
    .from("agent_channels")
    .select("agent_id, agents!inner(is_active)")
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  const agent = (data as any).agents;
  if (!agent?.is_active) return null;
  return { agentId: data.agent_id };
}

/** Horário comercial simples derivado de organizations.settings. */
function isWithinBusinessHours(settings: any, now = new Date()): boolean {
  const start = Number(settings?.horario_inicio ?? 9);
  const end = Number(settings?.horario_fim ?? 18);
  const day = now.getDay(); // 0 dom .. 6 sáb
  if (day === 0 || day === 6) return false;
  const hour = now.getHours();
  return hour >= start && hour < end;
}

/**
 * Executa o agente para uma conversa. NÃO chama a IA se o bot estiver
 * desligado, se não houver prompt publicado, ou se uma regra de handoff
 * disparar.
 */
export async function runAgentForConversation(params: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
  inboundText: string;
  trigger?: "webhook" | "playground";
}): Promise<EngineResult> {
  const { supabase, organizationId, conversationId, inboundText } = params;
  const trigger = params.trigger ?? "webhook";

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, contact_id, channel, agent_id, bot_active, contact:contacts(id, name)")
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .single();
  if (!conv) return { handled: false, reason: "conversa_nao_encontrada" };
  if (!conv.bot_active) return { handled: false, reason: "bot_desativado" };

  // Resolve o agente: o da conversa ou o ativo do canal.
  let agentId = conv.agent_id as string | null;
  if (!agentId) {
    const resolved = await resolveChannelAgent(supabase, organizationId, conv.channel);
    agentId = resolved?.agentId ?? null;
  }
  if (!agentId) return { handled: false, reason: "sem_agente_no_canal" };

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, role, tone, settings, is_active")
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .single();
  if (!agent || !agent.is_active) return { handled: false, reason: "agente_inativo" };

  const { data: promptVersion } = await supabase
    .from("agent_prompt_versions")
    .select("id, prompt")
    .eq("agent_id", agentId)
    .eq("status", "published")
    .maybeSingle();
  if (!promptVersion) return { handled: false, reason: "sem_prompt_publicado" };

  const [{ data: toolRows }, { data: ruleRows }, { data: org }] = await Promise.all([
    supabase.from("agent_tools").select("tool_key, enabled").eq("agent_id", agentId).eq("enabled", true),
    supabase.from("agent_handoff_rules").select("rule_key, enabled, config").eq("agent_id", agentId).eq("enabled", true),
    supabase.from("organizations").select("name, settings, timezone").eq("id", organizationId).single(),
  ]);

  const enabledTools = (toolRows ?? []).map((r: any) => r.tool_key as AgentToolKey);
  const enabledRules = (ruleRows ?? []).map((r: any) => r.rule_key as HandoffRuleKey);

  // Regra de handoff antes de chamar a IA (economiza tokens).
  const rule = evaluateHandoff({
    enabledRules,
    message: inboundText,
    consecutiveFailures: 0,
    withinBusinessHours: isWithinBusinessHours(org?.settings, new Date()),
  });
  if (rule) {
    await supabase
      .from("conversations")
      .update({ bot_active: false, handoff_at: new Date().toISOString(), handoff_reason: rule })
      .eq("id", conversationId);
    return { handled: false, reason: "handoff", handoffRule: rule };
  }

  // Variáveis do prompt.
  const variables: PromptVariables = {
    nome_empresa: org?.name ?? "",
    nome_contato: (conv as any).contact?.name ?? "",
    horario_atendimento: String(org?.settings?.horario_atendimento ?? "Seg a Sex, 9h às 18h"),
    canal: CHANNEL_LABEL[conv.channel as ChannelType] ?? conv.channel,
    nome_agente: agent.name,
    funcao_agente: AGENT_ROLE_LABEL[agent.role as AgentRole] ?? agent.role,
  };
  const system = renderPrompt(promptVersion.prompt, variables);

  // Histórico recente (ordem cronológica).
  const { data: historyRows } = await supabase
    .from("messages")
    .select("sender_type, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = (historyRows ?? [])
    .reverse()
    .filter((m: any) => m.body)
    .map((m: any): Anthropic.MessageParam => ({
      role: m.sender_type === "contact" ? "user" : "assistant",
      content: String(m.body),
    }));

  const { data: opp } = await supabase
    .from("opportunities")
    .select("id")
    .eq("contact_id", conv.contact_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .maybeSingle();

  const result = await runAgentLoop({
    model: agent.settings?.model ?? serverEnv().defaultModel,
    system,
    messages: [...history, { role: "user", content: inboundText }],
    tools: toolsForClaude(enabledTools),
    executeTool: (key, input) =>
      executeTool(
        {
          supabase,
          organizationId,
          conversationId,
          contactId: conv.contact_id,
          opportunityId: opp?.id ?? null,
        },
        enabledTools,
        key,
        input,
      ),
  });

  // Log da execução.
  const { data: run } = await supabase
    .from("ai_runs")
    .insert({
      organization_id: organizationId,
      agent_id: agentId,
      prompt_version_id: promptVersion.id,
      conversation_id: conversationId,
      trigger,
      input: { mensagem: inboundText },
      output: result.reply,
      tools_called: result.toolCalls,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      latency_ms: result.latencyMs,
      stop_reason: result.stopReason,
      error: result.error ?? null,
    })
    .select("id")
    .single();

  // Reavalia handoff pós-execução (ex.: tool derivar_para_atendente desligou o bot).
  const { data: after } = await supabase
    .from("conversations")
    .select("bot_active")
    .eq("id", conversationId)
    .single();

  if (after?.bot_active && result.reply) {
    await supabase.from("messages").insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: "outbound",
      sender_type: "agent",
      sender_agent_id: agentId,
      kind: "text",
      body: result.reply,
      ai_generated: true,
      ai_run_id: run?.id ?? null,
      status: "queued",
    });
  }

  return {
    handled: true,
    reply: result.reply,
    reason: result.error,
    aiRunId: run?.id,
  };
}
