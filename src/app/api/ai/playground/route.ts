import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { requireProfile } from "@/lib/auth/session";
import { AGENT_ROLE_LABEL } from "@/types/domain";
import type { AgentRole, AgentToolKey } from "@/types/domain";
import { runAgentLoop } from "@/services/agents/claude";
import { renderPrompt } from "@/services/agents/prompt";
import { executeTool, toolsForClaude } from "@/services/agents/tools";
import { buildAgentSystemInstruction } from "@/services/agents/sanitizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Playground de teste do agente. Usa a versão selecionada (draft ou
 * published) e retorna a resposta + o log das ferramentas chamadas.
 * Não persiste mensagens; apenas registra um ai_run de auditoria.
 */
export async function POST(request: NextRequest) {
  const profile = await requireProfile();
  const body = await request.json().catch(() => null);
  const agentId = body?.agentId as string | undefined;
  const message = (body?.message as string | undefined)?.trim();
  const version = (body?.version as "draft" | "published") ?? "published";
  const history = (body?.history ?? []) as { role: "user" | "agent"; text: string }[];

  if (!agentId || !message) {
    return NextResponse.json({ error: "agentId e message são obrigatórios" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, role, tone")
    .eq("id", agentId)
    .eq("organization_id", profile.organizationId)
    .single();
  if (!agent) return NextResponse.json({ error: "agente não encontrado" }, { status: 404 });

  const { data: promptVersion } = await supabase
    .from("agent_prompt_versions")
    .select("prompt")
    .eq("agent_id", agentId)
    .eq("status", version)
    .maybeSingle();
  if (!promptVersion) {
    return NextResponse.json({ error: `sem versão ${version}` }, { status: 404 });
  }

  const [{ data: toolRows }, { data: org }, { data: knowledgeMemories }, { data: subagents }] = await Promise.all([
    supabase.from("agent_tools").select("tool_key").eq("agent_id", agentId).eq("enabled", true),
    supabase.from("organizations").select("name, business_hours, timezone").eq("id", profile.organizationId).single(),
    supabase.from("knowledge_base_items").select("title, content").eq("organization_id", profile.organizationId).eq("category", `agent_memory:${agentId}`),
    supabase
      .from("agents")
      .select("id, name, role, is_active")
      .eq("organization_id", profile.organizationId)
      .eq("is_active", true)
      .order("created_at"),
  ]);
  const enabledTools = (toolRows ?? []).map((r: any) => r.tool_key as AgentToolKey);
  const memoryText = (knowledgeMemories ?? [])
    .map((m: any) => `- ${m.title.replace(/^Memória:\s*/i, "")}: ${m.content}`)
    .join("\n");
  const subagentsText = (subagents ?? [])
    .filter((a: any) => a.id !== agentId)
    .map((a: any) => `- ${a.name} (${AGENT_ROLE_LABEL[a.role as AgentRole] ?? a.role})`)
    .join("\n");

  const renderedBase = renderPrompt(promptVersion.prompt, {
    nome_empresa: org?.name ?? "",
    nome_contato: "Lead Simulado",
    horario_atendimento: "Seg a Sex, 09:00 às 18:00",
    canal: "WhatsApp",
    nome_agente: agent.name,
    funcao_agente: AGENT_ROLE_LABEL[agent.role as AgentRole] ?? agent.role,
  });

  const system = buildAgentSystemInstruction({
    basePrompt: renderedBase,
    role: agent.role,
    agentName: agent.name,
    tone: agent.tone,
    memory: memoryText,
    subagents: subagentsText,
  });

  const messages = [
    ...history.map((h) => ({
      role: (h.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: h.text,
    })),
    { role: "user" as const, content: message },
  ];

  const result = await runAgentLoop({
    model: serverEnv().defaultModel,
    system,
    messages,
    tools: toolsForClaude(enabledTools),
    executeTool: (key, input) =>
      executeTool(
        {
          supabase,
          organizationId: profile.organizationId,
          conversationId: "00000000-0000-0000-0000-000000000000", // sandbox
          contactId: "00000000-0000-0000-0000-000000000000",
          opportunityId: null,
        },
        enabledTools,
        key,
        input,
      ),
  });

  return NextResponse.json({
    reply: result.reply,
    toolCalls: result.toolCalls,
    stopReason: result.stopReason,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    latencyMs: result.latencyMs,
    error: result.error ?? null,
    variables: { nome_empresa: org?.name ?? "", nome_contato: "Lead Simulado" },
  });
}
