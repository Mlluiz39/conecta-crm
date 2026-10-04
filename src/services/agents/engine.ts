import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentToolKey,
  ChannelType,
  HandoffRuleKey,
  PromptVariables,
  AgentRole,
} from "@/types/domain";
import { AGENT_ROLE_LABEL, CHANNEL_LABEL } from "@/types/domain";
import { serverEnv } from "@/lib/env";
import { runAgentLoop } from "./claude";
import { evaluateHandoff } from "./handoff";
import { renderPrompt } from "./prompt";
import { executeTool, toolsForClaude } from "./tools";
import { buildAgentSystemInstruction } from "./sanitizer";

const HISTORY_LIMIT = 20;

export type EngineResult = {
  handled: boolean;
  reply?: string;
  reason?: string;
  handoffRule?: HandoffRuleKey;
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

function isWithinBusinessHours(businessHours: any, now = new Date()): boolean {
  // Horário configurado em organizations.business_hours
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const hour = now.getHours();
  return hour >= 9 && hour < 18;
}

export async function runAgentForConversation(params: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
  inboundText: string;
}): Promise<EngineResult> {
  const { supabase, organizationId, conversationId, inboundText } = params;

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, contact_id, channel_type, agent_id, bot_active, contact:contacts(id, name)")
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .single();
  if (!conv) return { handled: false, reason: "conversa_nao_encontrada" };
  if (!conv.bot_active) return { handled: false, reason: "bot_desativado" };

  let agentId = conv.agent_id as string | null;
  if (!agentId) {
    const resolved = await resolveChannelAgent(supabase, organizationId, conv.channel_type);
    agentId = resolved?.agentId ?? null;
  }
  if (!agentId) return { handled: false, reason: "sem_agente_no_canal" };

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, role, tone, is_active")
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
    supabase.from("organizations").select("name, business_hours, timezone, out_of_hours_message").eq("id", organizationId).single(),
  ]);

  const enabledTools = (toolRows ?? []).map((r: any) => r.tool_key as AgentToolKey);
  const enabledRules = (ruleRows ?? []).map((r: any) => r.rule_key as HandoffRuleKey);

  // Regra de handoff antes de chamar a IA
  const rule = evaluateHandoff({
    enabledRules,
    message: inboundText,
    consecutiveFailures: 0,
    withinBusinessHours: isWithinBusinessHours(org?.business_hours, new Date()),
  });
  if (rule) {
    await supabase
      .from("conversations")
      .update({
        bot_active: false,
        handoff_reason: rule,
        bot_disabled_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
    return { handled: false, reason: "handoff", handoffRule: rule };
  }

  // Variáveis do prompt
  const variables: PromptVariables = {
    nome_empresa: org?.name ?? "",
    nome_contato: (conv as any).contact?.name ?? "",
    horario_atendimento: "Seg a Sex, 09h às 18h",
    canal: CHANNEL_LABEL[conv.channel_type as ChannelType] ?? conv.channel_type,
    nome_agente: agent.name,
    funcao_agente: AGENT_ROLE_LABEL[agent.role as AgentRole] ?? agent.role,
  };
  const renderedBase = renderPrompt(promptVersion.prompt, variables);
  const system = buildAgentSystemInstruction({
    basePrompt: renderedBase,
    role: agent.role,
    agentName: agent.name,
  });

  // Histórico recente em ordem cronológica
  const { data: historyRows } = await supabase
    .from("messages")
    .select("sender_type, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const history = (historyRows ?? [])
    .reverse()
    .filter((m: any) => m.content)
    .map((m: any): Anthropic.MessageParam => ({
      role: m.sender_type === "contact" ? "user" : "assistant",
      content: String(m.content),
    }));

  const { data: opp } = await supabase
    .from("opportunities")
    .select("id")
    .eq("contact_id", conv.contact_id)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .maybeSingle();

  const result = await runAgentLoop({
    model: serverEnv().defaultModel,
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

  // Registra as chamadas de ferramentas no agent_tool_calls do schema
  for (const tc of result.toolCalls) {
    await supabase.from("agent_tool_calls").insert({
      organization_id: organizationId,
      agent_id: agentId,
      conversation_id: conversationId,
      tool_key: tc.tool_key,
      input: tc.input,
      output: tc.output,
    });
  }

  // Verifica se o bot permaneceu ativo (a tool derivar_para_atendente pode ter desativado)
  const { data: after } = await supabase
    .from("conversations")
    .select("bot_active")
    .eq("id", conversationId)
    .single();

  if (after?.bot_active && result.reply) {
    await supabase.from("messages").insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: "out",
      sender_type: "agent_ai",
      agent_id: agentId,
      content: result.reply,
      status: "enviada",
    });
  }

  return {
    handled: true,
    reply: result.reply,
    reason: result.error,
  };
}
