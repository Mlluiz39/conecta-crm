"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { AgentToolKey, AgentRole, AgentTone, ChannelType, HandoffRuleKey } from "@/types/domain";

/* ───────────────────────────── Contatos ───────────────────────────── */

export async function createContact(formData: FormData) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const instagram = String(formData.get("instagram_handle") ?? "").trim() || null;
  const openConversation = formData.get("open_conversation") === "on";

  if (openConversation && !phone) {
    throw new Error("Telefone é obrigatório para abrir a conversa");
  }

  // Campos extras (empresa, cidade, etc.) são armazenados em custom_fields
  const customFields: Record<string, unknown> = {};
  const company = String(formData.get("company") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  if (company) customFields.empresa = company;
  if (city) customFields.cidade = city;
  if (state) customFields.estado = state;

  const { data: contact, error } = await supabase
    .from("contacts")
    .insert({
      organization_id: organizationId,
      owner_id: userId,
      name,
      phone,
      email,
      instagram_handle: instagram,
      custom_fields: customFields,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Conversa de teste: abre a thread no Inbox sem esperar inbound do WhatsApp
  if (openConversation && phone) {
    const { data: chan } = await supabase
      .from("channels")
      .select("id, type")
      .eq("organization_id", organizationId)
      .eq("status", "conectado")
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (chan) {
      const { error: convErr } = await supabase.from("conversations").insert({
        organization_id: organizationId,
        contact_id: contact.id,
        channel_id: chan.id,
        channel_type: chan.type,
        external_id: `manual_${contact.id}`,
        status: "aberta",
      });
      if (convErr && convErr.code !== "23505") throw new Error(convErr.message);
      revalidatePath("/conversas");
    }
    // sem canal conectado: contato criado, conversa fica pra depois
  }

  revalidatePath("/contatos");
}

export async function updateContact(formData: FormData) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const id = String(formData.get("id"));

  const customRaw = String(formData.get("custom_fields") ?? "").trim();
  let customFields: Record<string, unknown> = {};
  if (customRaw) {
    try {
      customFields = JSON.parse(customRaw);
    } catch {
      throw new Error("JSON de campos personalizados inválido");
    }
  }

  const company = String(formData.get("company") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  if (company) customFields.empresa = company;
  if (city) customFields.cidade = city;
  if (state) customFields.estado = state;

  const { error } = await supabase
    .from("contacts")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      instagram_handle: String(formData.get("instagram_handle") ?? "").trim() || null,
      custom_fields: customFields,
      updated_at: new Date().toISOString(),
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
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/contatos");
}

/* ───────────────────────────── Pipeline ───────────────────────────── */

export async function moveOpportunity(
  opportunityId: string,
  stageId: string,
  lostReason?: string | null,
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
    stage_id: stageId,
    updated_at: now,
  };
  if (stage?.is_won) {
    patch.closed_at = now;
    patch.lost_reason = null;
  } else if (stage?.is_lost) {
    patch.closed_at = now;
    patch.lost_reason = lostReason ?? "Outro";
  } else {
    patch.closed_at = null;
    patch.lost_reason = null;
  }

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
    color: String(formData.get("color") ?? "#6366F1"),
    position: Number(max?.position ?? 0) + 1,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/pipeline");
}

export async function getLossReasons(): Promise<{ id: string; name: string }[]> {
  return [
    { id: "Preço / Orçamento", name: "Preço / Orçamento" },
    { id: "Sem resposta", name: "Sem resposta" },
    { id: "Escolheu concorrente", name: "Escolheu concorrente" },
    { id: "Momento inadequado", name: "Momento inadequado" },
    { id: "Fora do perfil", name: "Fora do perfil" },
  ];
}

/* ──────────────────────────── Conversas ───────────────────────────── */

export async function takeoverConversation(conversationId: string) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();
  const { error } = await supabase
    .from("conversations")
    .update({
      bot_active: false,
      assigned_to: userId,
      bot_disabled_at: new Date().toISOString(),
    })
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
    .update({
      bot_active: true,
      bot_disabled_at: null,
      handoff_reason: null,
    })
    .eq("organization_id", organizationId)
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
  revalidatePath("/conversas");
}

export async function addInternalNote(conversationId: string, text: string) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();
  const { error } = await supabase.from("conversation_notes").insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    author_id: userId,
    content: text,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/conversas");
}

/** Envia mensagem do atendente humano — enfileira ('pendente') e despacha via outbox */
export async function sendHumanMessage(conversationId: string, text: string) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();

  const { error } = await supabase.from("messages").insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    direction: "out",
    sender_type: "user",
    sender_user_id: userId,
    content: text,
    // Fila de saída: flushOutbox resolve accountId/provider certos e retenta falhas
    status: "pendente",
  });
  if (error) throw new Error(error.message);

  const { flushOutbox } = await import("@/services/messaging/inbound.service");
  await flushOutbox(10).catch((e) => console.error("[sendHumanMessage] outbox:", e));

  revalidatePath("/conversas");
}

/* ───────────────────────────── Prospecção ──────────────────────────── */

const MAX_PROSPECT_BATCH = 50; // lote quente p/ evitar ban; subir com aquecimento

/**
 * Enfileira mensagem de prospecção para contatos selecionados.
 * Cria conversa (chave manual_<contactId>, dedupe), renderiza {{nome}}/{{primeiro_nome}}
 * e dispara a outbox. Resposta do cliente cai na conversa → agente assume.
 */
export async function prospectContacts(
  contactIds: string[],
  text: string,
): Promise<{ queued: number; sent: number; skipped: number }> {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();

  const message = String(text ?? "").trim();
  if (!message) throw new Error("Escreva a mensagem de prospecção");
  const ids = (contactIds ?? []).filter(Boolean).slice(0, MAX_PROSPECT_BATCH);
  if (ids.length === 0) throw new Error("Selecione ao menos um contato");

  const { data: chan } = await supabase
    .from("channels")
    .select("id, type")
    .eq("organization_id", organizationId)
    .eq("type", "whatsapp")
    .eq("status", "conectado")
    .limit(1)
    .maybeSingle();
  if (!chan) throw new Error("Conecte o WhatsApp em Conexões antes de prospectar");

  const { data: contacts, error: cErr } = await supabase
    .from("contacts")
    .select("id, name, phone")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (cErr) throw new Error(cErr.message);

  let queued = 0;
  let skipped = 0;

  for (const c of contacts ?? []) {
    if (!c.phone) {
      skipped++;
      continue;
    }

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .upsert(
        {
          organization_id: organizationId,
          contact_id: c.id,
          channel_id: chan.id,
          channel_type: "whatsapp",
          external_id: `manual_${c.id}`,
          status: "aberta",
        },
        { onConflict: "channel_id,external_id" },
      )
      .select("id")
      .single();
    if (convErr || !conv) {
      console.error("[prospect] conversa:", convErr?.message);
      skipped++;
      continue;
    }

    const primeiroNome = (c.name || "").split(/\s+/)[0] || c.name || "";
    const content = message
      .replace(/\{\{nome\}\}/g, c.name || "")
      .replace(/\{\{primeiro_nome\}\}/g, primeiroNome);

    const { error: mErr } = await supabase.from("messages").insert({
      organization_id: organizationId,
      conversation_id: conv.id,
      direction: "out",
      sender_type: "user",
      sender_user_id: userId,
      content,
      status: "pendente",
    });
    if (mErr) {
      console.error("[prospect] mensagem:", mErr.message);
      skipped++;
      continue;
    }
    queued++;
  }

  const { flushOutbox } = await import("@/services/messaging/inbound.service");
  const sent = queued > 0 ? await flushOutbox(Math.min(queued, MAX_PROSPECT_BATCH)).catch(() => 0) : 0;

  revalidatePath("/prospeccao");
  revalidatePath("/conversas");
  return { queued, sent, skipped };
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
  "falhas_seguidas",
  "fora_do_horario",
];

export async function createAgent(formData: FormData) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();

  const name = String(formData.get("name") ?? "").trim();
  const role = (String(formData.get("role") ?? "vendedor") as AgentRole) || "vendedor";
  const channel = (String(formData.get("channel") ?? "whatsapp") as ChannelType) || "whatsapp";
  const tone = (String(formData.get("tone") ?? "") as AgentTone) || "consultivo";
  const customPrompt = String(formData.get("prompt") ?? "").trim();

  const { data: agent, error } = await supabase
    .from("agents")
    .insert({
      organization_id: organizationId,
      name,
      role,
      tone,
      is_active: true,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Prompt inicial: custom > template do papel (agent_templates) > fallback
  let prompt = customPrompt;
  if (!prompt) {
    const { data: tpl } = await supabase
      .from("agent_templates")
      .select("prompt")
      .eq("role", role)
      .order("name")
      .limit(1)
      .maybeSingle();
    prompt =
      tpl?.prompt ??
      `Você é o ${role} da {{nome_empresa}}. Atenda {{nome_contato}} pelo {{canal}} com atenção e objetividade.`;
  }

  await supabase.from("agent_prompt_versions").insert({
    organization_id: organizationId,
    agent_id: agent.id,
    version: 1,
    prompt,
    status: "published",
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
      config: rule_key === "falhas_seguidas" ? { limite: 3 } : {},
    })),
  );

  // Desativa canal ativo anterior do canal se houver
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
  await supabase
    .from("agent_channels")
    .update({ is_active: false })
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .eq("is_active", true);

  const { error } = await supabase.from("agent_channels").upsert(
    { organization_id: organizationId, agent_id: agentId, channel, is_active: true },
    { onConflict: "agent_id,channel" },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/agentes");
}

export async function toggleTool(agentId: string, toolKey: AgentToolKey, enabled: boolean) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  await supabase.from("agent_tools").upsert(
    { organization_id: organizationId, agent_id: agentId, tool_key: toolKey, enabled },
    { onConflict: "agent_id,tool_key" },
  );
  revalidatePath("/agentes");
}

export async function toggleRule(agentId: string, ruleKey: HandoffRuleKey, enabled: boolean) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  await supabase.from("agent_handoff_rules").upsert(
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

/** Publica o rascunho: chama a procedure publish_agent_version do banco */
export async function publishDraft(agentId: string) {
  const supabase = createClient();
  const { data: draft } = await supabase
    .from("agent_prompt_versions")
    .select("id")
    .eq("agent_id", agentId)
    .eq("status", "draft")
    .maybeSingle();

  if (draft) {
    const { error } = await supabase.rpc("publish_agent_version", { p_version_id: draft.id });
    if (error) {
      // Fallback manual se a procedure falhar
      await supabase
        .from("agent_prompt_versions")
        .update({ status: "archived" })
        .eq("agent_id", agentId)
        .eq("status", "published");
      await supabase
        .from("agent_prompt_versions")
        .update({ status: "published" })
        .eq("id", draft.id);
    }
  }
  revalidatePath("/agentes");
}

export async function restoreVersion(agentId: string, versionId: string) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();
  const { data: source } = await supabase
    .from("agent_prompt_versions")
    .select("prompt")
    .eq("id", versionId)
    .single();
  if (!source) throw new Error("Versão não encontrada");

  await saveDraft(agentId, source.prompt);
  revalidatePath("/agentes");
}

export async function updateAgentRole(agentId: string, role: AgentRole, tone?: AgentTone) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const patch: Record<string, any> = { role };
  if (tone) patch.tone = tone;

  const { error } = await supabase
    .from("agents")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("id", agentId);

  if (error) throw new Error(error.message);
  revalidatePath("/agentes");
}

export async function updateAgentName(agentId: string, name: string) {
  const clean = name.trim();
  if (!clean) throw new Error("Nome vazio");
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const { error } = await supabase
    .from("agents")
    .update({ name: clean })
    .eq("organization_id", organizationId)
    .eq("id", agentId);

  if (error) throw new Error(error.message);
  revalidatePath("/agentes");
}
