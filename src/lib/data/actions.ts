"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth/session";
import type { AgentToolKey, AgentRole, ChannelType, HandoffRuleKey } from "@/types/domain";

/* ───────────────────────────── Contatos ───────────────────────────── */

export async function createContact(formData: FormData) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();

  const { error } = await supabase.from("contacts").insert({
    organization_id: organizationId,
    owner_id: userId,
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    company: String(formData.get("company") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    state: String(formData.get("state") ?? "").trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/contatos");
}

export async function updateContact(formData: FormData) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const id = String(formData.get("id"));

  const customRaw = String(formData.get("custom_fields") ?? "").trim();
  let customFields: Record<string, unknown> | undefined;
  if (customRaw) {
    try {
      customFields = JSON.parse(customRaw);
    } catch {
      throw new Error("JSON de campos personalizados inválido");
    }
  }

  const { error } = await supabase
    .from("contacts")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      company: String(formData.get("company") ?? "").trim() || null,
      city: String(formData.get("city") ?? "").trim() || null,
      state: String(formData.get("state") ?? "").trim() || null,
      ...(customFields ? { custom_fields: customFields } : {}),
    })
    .eq("organization_id", organizationId)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/contatos");
}

export async function deleteContact(id: string) {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Sem permissão");
  const supabase = createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/contatos");
}

/* ───────────────────────────── Pipeline ───────────────────────────── */

export async function moveOpportunity(
  opportunityId: string,
  stageId: string,
  lostReasonId?: string | null,
) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("is_won, is_lost")
    .eq("id", stageId)
    .eq("organization_id", organizationId)
    .single();

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    pipeline_stage_id: stageId,
    last_activity_at: now,
  };
  if (stage?.is_won) { patch.status = "won"; patch.won_at = now; }
  else if (stage?.is_lost) {
    patch.status = "lost";
    patch.lost_at = now;
    patch.lost_reason_id = lostReasonId ?? null;
  } else { patch.status = "open"; }

  const { error } = await supabase
    .from("opportunities")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("id", opportunityId);
  if (error) throw new Error(error.message);
  revalidatePath("/pipeline");
}

export async function createStage(formData: FormData) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data: max } = await supabase
    .from("pipeline_stages")
    .select("position")
    .eq("organization_id", organizationId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("pipeline_stages").insert({
    organization_id: organizationId,
    name: String(formData.get("name") ?? "").trim(),
    color: String(formData.get("color") ?? "#4f46e5"),
    position: Number(max?.position ?? 0) + 1000,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/pipeline");
}

export async function getLossReasons() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("loss_reasons")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  return data ?? [];
}

/* ──────────────────────────── Conversas ───────────────────────────── */

export async function takeoverConversation(conversationId: string) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ bot_active: false, assigned_to: userId })
    .eq("organization_id", organizationId)
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
  revalidatePath("/conversas");
}

export async function reactivateBot(conversationId: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ bot_active: true, handoff_at: null, handoff_reason: null })
    .eq("organization_id", organizationId)
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
  revalidatePath("/conversas");
}

export async function addInternalNote(conversationId: string, contactId: string, text: string) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();
  const { error } = await supabase.from("activities").insert({
    organization_id: organizationId,
    contact_id: contactId,
    conversation_id: conversationId,
    type: "note",
    title: text,
    actor_id: userId,
    actor_type: "user",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/conversas");
}

/** Envia mensagem do atendente humano e enfileira na outbox. */
export async function sendHumanMessage(conversationId: string, text: string) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();

  const { data: conv } = await supabase
    .from("conversations")
    .select("channel, contact:contacts(phone)")
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .single();

  const { error } = await supabase.from("messages").insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    direction: "outbound",
    sender_type: "user",
    sender_profile_id: userId,
    kind: "text",
    body: text,
    status: "queued",
  });
  if (error) throw new Error(error.message);

  // Enfileira o envio real (admin client — outbox é server-only).
  const admin = createAdminClient();
  await admin.from("message_outbox").insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    payload: {
      to: (conv as any)?.contact?.phone,
      text,
      conversation_id: conversationId,
    },
  });
  revalidatePath("/conversas");
}

/* ───────────────────────────── Agentes ────────────────────────────── */

const ALL_TOOLS: AgentToolKey[] = [
  "buscar_informacoes",
  "agendar_visita",
  "derivar_para_atendente",
  "atualizar_contato",
  "mover_etapa_funil",
];
const ALL_RULES: HandoffRuleKey[] = [
  "cliente_pede_humano",
  "sentimento_negativo",
  "3_falhas_seguidas",
  "fora_do_horario",
];

export async function createAgent(formData: FormData) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();

  const name = String(formData.get("name") ?? "").trim();
  const role = (String(formData.get("role") ?? "vendedor") as AgentRole) || "vendedor";
  const channel = (String(formData.get("channel") ?? "whatsapp") as ChannelType) || "whatsapp";

  const { data: agent, error } = await supabase
    .from("agents")
    .insert({
      organization_id: organizationId,
      name,
      role,
      tone: ["consultivo", "amigavel"],
      is_active: true,
      created_by: userId,
      settings: {},
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Prompt inicial (published + sem draft).
  await supabase.from("agent_prompt_versions").insert({
    organization_id: organizationId,
    agent_id: agent.id,
    version: 1,
    prompt: `Você é o ${role} da {{nome_empresa}}. Atenda {{nome_contato}} pelo {{canal}} com atenção e objetividade.`,
    status: "published",
    published_at: new Date().toISOString(),
    created_by: userId,
  });

  await supabase.from("agent_tools").insert(
    ALL_TOOLS.map((tool_key) => ({
      organization_id: organizationId,
      agent_id: agent.id,
      tool_key,
      enabled: ["buscar_informacoes", "derivar_para_atendente"].includes(tool_key),
    })),
  );

  await supabase.from("agent_handoff_rules").insert(
    ALL_RULES.map((rule_key) => ({
      organization_id: organizationId,
      agent_id: agent.id,
      rule_key,
      enabled: rule_key === "cliente_pede_humano",
    })),
  );

  // Vincula ao canal (a regra de 1 ativo/canal exige desativar o anterior).
  await supabase
    .from("agent_channels")
    .update({ is_active: false })
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .eq("is_active", true);
  await supabase.from("agent_channels").insert({
    organization_id: organizationId,
    agent_id: agent.id,
    channel,
    is_active: true,
  });

  revalidatePath("/agentes");
}

export async function toggleAgentActive(agentId: string, active: boolean) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  await supabase
    .from("agents")
    .update({ is_active: active })
    .eq("organization_id", organizationId)
    .eq("id", agentId);
  revalidatePath("/agentes");
}

export async function setAgentChannel(agentId: string, channel: ChannelType) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  // Desativa qualquer agente ativo no canal, então ativa este.
  await supabase
    .from("agent_channels")
    .update({ is_active: false })
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .eq("is_active", true);
  const { error } = await supabase
    .from("agent_channels")
    .upsert(
      { organization_id: organizationId, agent_id: agentId, channel, is_active: true },
      { onConflict: "agent_id,channel" },
    );
  if (error) throw new Error(error.message);
  revalidatePath("/agentes");
}

export async function toggleTool(agentId: string, toolKey: AgentToolKey, enabled: boolean) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  await supabase
    .from("agent_tools")
    .upsert(
      { organization_id: organizationId, agent_id: agentId, tool_key: toolKey, enabled },
      { onConflict: "agent_id,tool_key" },
    );
  revalidatePath("/agentes");
}

export async function toggleRule(agentId: string, ruleKey: HandoffRuleKey, enabled: boolean) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  await supabase
    .from("agent_handoff_rules")
    .upsert(
      { organization_id: organizationId, agent_id: agentId, rule_key: ruleKey, enabled },
      { onConflict: "agent_id,rule_key" },
    );
  revalidatePath("/agentes");
}

export async function saveDraft(agentId: string, prompt: string) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("agent_prompt_versions")
    .select("id")
    .eq("agent_id", agentId)
    .eq("status", "draft")
    .maybeSingle();

  if (existing) {
    await supabase.from("agent_prompt_versions").update({ prompt }).eq("id", existing.id);
  } else {
    const { data: max } = await supabase
      .from("agent_prompt_versions")
      .select("version")
      .eq("agent_id", agentId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    await supabase.from("agent_prompt_versions").insert({
      organization_id: organizationId,
      agent_id: agentId,
      version: Number(max?.version ?? 0) + 1,
      prompt,
      status: "draft",
      created_by: userId,
    });
  }
  revalidatePath("/agentes");
}

/** Publica o rascunho: arquiva o published atual e promove o draft. */
export async function publishDraft(agentId: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  await supabase
    .from("agent_prompt_versions")
    .update({ status: "archived" })
    .eq("agent_id", agentId)
    .eq("status", "published");

  const { error } = await supabase
    .from("agent_prompt_versions")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("agent_id", agentId)
    .eq("status", "draft");
  if (error) throw new Error(error.message);
  revalidatePath("/agentes");
}

/** Restaura uma versão anterior como rascunho editável. */
export async function restoreVersion(agentId: string, versionId: string) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();
  const { data: source } = await supabase
    .from("agent_prompt_versions")
    .select("prompt")
    .eq("id", versionId)
    .single();
  if (!source) throw new Error("Versão não encontrada");

  const { data: existing } = await supabase
    .from("agent_prompt_versions")
    .select("id")
    .eq("agent_id", agentId)
    .eq("status", "draft")
    .maybeSingle();

  if (existing) {
    await supabase.from("agent_prompt_versions").update({ prompt: source.prompt }).eq("id", existing.id);
  } else {
    const { data: max } = await supabase
      .from("agent_prompt_versions")
      .select("version")
      .eq("agent_id", agentId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    await supabase.from("agent_prompt_versions").insert({
      organization_id: organizationId,
      agent_id: agentId,
      version: Number(max?.version ?? 0) + 1,
      prompt: source.prompt,
      status: "draft",
      created_by: userId,
    });
  }
  revalidatePath("/agentes");
}
