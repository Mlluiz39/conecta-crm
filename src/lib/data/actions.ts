"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { normalizePhone, parseLeadLine, stripHeader } from "@/lib/data/lead-parser";
import { mergeContext } from "@/services/prospecting/enrichment";
import {
  ensureEmailConversation,
  ensureProspectConversation,
} from "@/services/prospecting/conversations";
import {
  TEMPERATURE_NAMES,
  TEMPERATURE_TAGS,
  type LeadTemperature,
} from "@/lib/data/lead-temperature";
import type { AgentToolKey, AgentRole, AgentTone, ChannelType, HandoffRuleKey } from "@/types/domain";
import { VOICE_CATALOG } from "@/types/domain";

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

export type ImportLeadsResult = {
  imported: number;
  duplicates: number;
  invalid: number;
  errors: string[];
};

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Importa leads colados/CSV para o banco — depois aparecem em Contatos/Prospecção. */
export async function importLeads(
  rawText: string,
): Promise<ImportLeadsResult> {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();

  const text = String(rawText ?? "");
  const allLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (allLines.length === 0) throw new Error("Cole ao menos uma linha de leads");

  const lines = stripHeader(allLines).slice(0, MAX_IMPORT_LINES);

  const parsed = lines
    .map(parseLeadLine)
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const invalid = lines.length - parsed.length;
  if (parsed.length === 0) {
    throw new Error("Nenhuma linha válida. Use: nome; telefone; email; empresa; cidade");
  }

  // Deduplica contra o que já existe (telefone ou e-mail)
  const phones = parsed.map((p) => p.phone).filter(Boolean) as string[];
  const emails = parsed.map((p) => p.email).filter(Boolean) as string[];
  const existingPhones = new Set<string>();
  const existingEmails = new Set<string>();

  if (phones.length > 0) {
    const { data } = await supabase
      .from("contacts")
      .select("phone")
      .eq("organization_id", organizationId)
      .in("phone", phones);
    (data ?? []).forEach((c) => c.phone && existingPhones.add(c.phone));
  }
  if (emails.length > 0) {
    const { data } = await supabase
      .from("contacts")
      .select("email")
      .eq("organization_id", organizationId)
      .in("email", emails);
    (data ?? []).forEach((c) => c.email && existingEmails.add(String(c.email).toLowerCase()));
  }

  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];
  let duplicates = 0;
  const errors: string[] = [];

  for (const lead of parsed) {
    const dupPhone = lead.phone && (existingPhones.has(lead.phone) || seenPhones.has(lead.phone));
    const dupEmail =
      lead.email && (existingEmails.has(lead.email) || seenEmails.has(lead.email));
    if (dupPhone || dupEmail) {
      duplicates++;
      continue;
    }
    if (lead.phone) seenPhones.add(lead.phone);
    if (lead.email) seenEmails.add(lead.email);

    const customFields: Record<string, unknown> = {};
    if (lead.company) customFields.empresa = lead.company;
    if (lead.city) customFields.cidade = lead.city;

    toInsert.push({
      organization_id: organizationId,
      owner_id: userId,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      custom_fields: customFields,
    });
  }

  let imported = 0;
  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200);
    const { error, count } = await supabase
      .from("contacts")
      .insert(chunk, { count: "exact" });
    if (error) {
      errors.push(error.message);
      continue;
    }
    imported += count ?? chunk.length;
  }

  revalidatePath("/prospeccao");
  revalidatePath("/contatos");
  return { imported, duplicates, invalid, errors };
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
  revalidatePath("/prospeccao");
  revalidatePath("/conversas");
}

/**
 * Apaga os leads selecionados. O banco remove em cascata conversas, mensagens,
 * oportunidades e tags ligados a eles.
 */
export async function deleteContacts(ids: string[]): Promise<{ deleted: number }> {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Sem permissão");

  const list = (ids ?? []).filter(Boolean);
  if (list.length === 0) throw new Error("Selecione ao menos um lead");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("contacts")
    .delete()
    .eq("organization_id", organizationId)
    .in("id", list)
    .select("id");
  if (error) throw new Error(error.message);

  revalidatePath("/prospeccao");
  revalidatePath("/contatos");
  revalidatePath("/conversas");
  return { deleted: data?.length ?? 0 };
}

export type BulkDeleteFilter =
  | { kind: "noPhone" }
  | { kind: "neverContacted" }
  | { kind: "search"; at: string }
  | { kind: "all" };

/** IDs de contatos que nunca receberam mensagem nossa (direction='out'). */
async function contactIdsWithOutbound(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
): Promise<Set<string>> {
  const { data: convs } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("organization_id", organizationId);
  const withOut = new Set<string>();
  if (!convs || convs.length === 0) return withOut;

  const { data: outs } = await supabase
    .from("messages")
    .select("conversation_id")
    .eq("organization_id", organizationId)
    .eq("direction", "out")
    .in(
      "conversation_id",
      convs.map((c) => c.id),
    );
  const convWithOut = new Set((outs ?? []).map((m) => String(m.conversation_id)));
  for (const c of convs) {
    if (c.contact_id && convWithOut.has(String(c.id))) withOut.add(String(c.contact_id));
  }
  return withOut;
}

/** Resolve os leads que batem com o filtro de limpeza. */
async function resolveFilterIds(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  filter: BulkDeleteFilter,
): Promise<string[]> {
  if (filter.kind === "search") {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("custom_fields->busca->>at", filter.at);
    return (data ?? []).map((c) => String(c.id));
  }

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, phone")
    .eq("organization_id", organizationId);

  if (filter.kind === "noPhone") {
    return (contacts ?? []).filter((c) => !c.phone).map((c) => String(c.id));
  }

  if (filter.kind === "neverContacted") {
    const contacted = await contactIdsWithOutbound(supabase, organizationId);
    return (contacts ?? []).filter((c) => !contacted.has(String(c.id))).map((c) => String(c.id));
  }

  // "all": todos os leads da organização
  return (contacts ?? []).map((c) => String(c.id));
}

/** Quantos leads seriam apagados por este filtro (para mostrar na tela). */
export async function countContactsByFilter(
  filter: BulkDeleteFilter,
): Promise<number> {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const ids = await resolveFilterIds(supabase, organizationId, filter);
  return ids.length;
}

/**
 * Limpeza em massa: apaga leads por filtro (sem telefone, nunca contatados,
 * resultado de uma busca específica, ou tudo). Cascata do banco cuida de
 * conversas, mensagens, oportunidades, tags e agendamentos.
 */
export async function deleteContactsByFilter(
  filter: BulkDeleteFilter,
): Promise<{ deleted: number }> {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Sem permissão");

  const supabase = createClient();
  const ids = await resolveFilterIds(supabase, organizationId, filter);
  if (ids.length === 0) return { deleted: 0 };

  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabase
      .from("contacts")
      .delete()
      .eq("organization_id", organizationId)
      .in("id", chunk)
      .select("id");
    if (error) throw new Error(error.message);
    deleted += data?.length ?? 0;
  }

  revalidatePath("/prospeccao");
  revalidatePath("/contatos");
  revalidatePath("/conversas");
  return { deleted };
}


/* ───────────────── Etiquetas de temperatura e oportunidades ───────────────── */


/** Garante que as etiquetas de temperatura existam e devolve os IDs. */
async function ensureTemperatureTags(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
): Promise<Record<string, string>> {
  const { data: existing } = await supabase
    .from("tags")
    .select("id, name")
    .eq("organization_id", organizationId)
    .in("name", TEMPERATURE_NAMES);

  const map: Record<string, string> = {};
  for (const tag of existing ?? []) map[tag.name] = tag.id;

  for (const [key, def] of Object.entries(TEMPERATURE_TAGS)) {
    if (map[def.name]) continue;
    const { data } = await supabase
      .from("tags")
      .insert({ organization_id: organizationId, name: def.name, color: def.color })
      .select("id, name")
      .single();
    if (data) map[data.name] = data.id;
    void key;
  }
  return map;
}

/** Marca (ou troca) a temperatura do lead: frio, morno ou quente. */
export async function setLeadTemperature(
  contactId: string,
  temperature: LeadTemperature | null,
): Promise<{ ok: true; temperature: LeadTemperature | null }> {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const tags = await ensureTemperatureTags(supabase, organizationId);
  const ids = Object.values(tags);

  // Remove as temperaturas anteriores desse contato
  if (ids.length > 0) {
    await supabase
      .from("contact_tags")
      .delete()
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .in("tag_id", ids);
  }

  if (temperature) {
    const tagId = tags[TEMPERATURE_TAGS[temperature].name];
    if (tagId) {
      const { error } = await supabase
        .from("contact_tags")
        .insert({ organization_id: organizationId, contact_id: contactId, tag_id: tagId });
      if (error) throw new Error(error.message);
    }
  }

  revalidatePath("/contatos");
  revalidatePath("/prospeccao");
  return { ok: true, temperature };
}

/**
 * Cria/atualiza a oportunidade do lead com o valor do serviço.
 * Sem etapa informada, entra na primeira do funil ("Novo lead").
 */
export async function saveLeadOpportunity(input: {
  contactId: string;
  value: number;
  title?: string;
  stageId?: string;
}): Promise<{ id: string; created: boolean }> {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0) throw new Error("Informe um valor válido");

  let stageId = input.stageId ?? null;
  if (!stageId) {
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("organization_id", organizationId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    stageId = stage?.id ?? null;
  }

  const { data: existing } = await supabase
    .from("opportunities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", input.contactId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("opportunities")
      .update({
        value,
        ...(input.title ? { title: input.title } : {}),
        ...(stageId ? { stage_id: stageId } : {}),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    revalidatePath("/contatos");
    revalidatePath("/pipeline");
    return { id: existing.id, created: false };
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("name")
    .eq("id", input.contactId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      organization_id: organizationId,
      contact_id: input.contactId,
      stage_id: stageId,
      title: input.title ?? `Serviço — ${contact?.name ?? "lead"}`,
      value,
      position: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/contatos");
  revalidatePath("/pipeline");
  return { id: data.id, created: true };
}


/* ───────────────────── Fila de disparo (anti-ban) ──────────────────── */

export type EnqueueOutreachResult = {
  queued: number;
  skipped: number;
  status: {
    pendentes: number;
    agendados: number;
    enviadosHoje: number;
    tetoHoje: number;
    proximoEnvio: string | null;
    dentroDaJanela: boolean;
    janela: { inicio: number; fim: number };
  };
};

/**
 * Coloca os leads selecionados no ciclo de disparo: os agentes abordam aos poucos,
 * dentro da janela (padrão 9h–18h), com intervalos variados e teto de 15–20/dia.
 * Telefone → WhatsApp; só e-mail → e-mail.
 */
export async function enqueueOutreachContacts(input: {
  contactIds: string[];
  offer?: string;
  goal?: string;
  notes?: string;
  value?: number;
  runNow?: boolean;
}): Promise<EnqueueOutreachResult> {
  const { organizationId } = await requireProfile();
  const ids = (input.contactIds ?? []).filter(Boolean);
  if (ids.length === 0) throw new Error("Selecione ao menos um lead");

  const { enqueueOutreach, outreachStatus, runOutreachCycle } = await import(
    "@/services/prospecting/outreach-queue"
  );

  const { queued, skipped } = await enqueueOutreach({
    organizationId,
    contactIds: ids,
    briefing: {
      offer: input.offer,
      goal: input.goal,
      notes: input.notes,
      value: input.value,
    },
  });

  // Planeja imediatamente (fora da janela só agenda; sem enviar)
  await runOutreachCycle({ organizationId, limit: input.runNow ? 1 : undefined }).catch(() => null);

  revalidatePath("/prospeccao");
  return { queued, skipped, status: await outreachStatus(organizationId) };
}

/** Situação atual do ciclo (para a tela). */
export async function getOutreachStatus() {
  const { organizationId } = await requireProfile();
  const { outreachStatus } = await import("@/services/prospecting/outreach-queue");
  return outreachStatus(organizationId);
}

/** Roda um ciclo agora (botão "rodar ciclo" — respeita a janela e o teto). */
export async function runOutreachNow() {
  const { organizationId } = await requireProfile();
  const { runOutreachCycle, outreachStatus } = await import("@/services/prospecting/outreach-queue");
  const result = await runOutreachCycle({ organizationId });
  revalidatePath("/prospeccao");
  return { ...result, status: await outreachStatus(organizationId) };
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

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, contact:contacts(name, phone)")
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .maybeSingle();

  const contato = (conv as { contact?: { name?: string | null; phone?: string | null } } | null)?.contact;
  const quem = contato?.name ?? contato?.phone ?? conversationId.slice(0, 8);

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

  // O flag `conversations.bot_active` é a verdade: o motor de agentes do CRM respeita
  // antes de responder, então não existe mais processo externo para pausar.
  revalidatePath("/conversas");
  return { ok: true };
}

export async function reactivateBot(conversationId: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { error } = await supabase
    .from("conversations")
    // handoff_reason sai junto: sem isso a conversa volta a responder com o motivo do
    // transbordo antigo pendurado (aparecia como "cliente pediu humano" para sempre).
    .update({ bot_active: true, assigned_to: null, bot_disabled_at: null, handoff_reason: null })
    .eq("organization_id", organizationId)
    .eq("id", conversationId);
  if (error) throw new Error(error.message);

  revalidatePath("/conversas");
  return { ok: true };
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

/**
 * Mensagens + notas de UMA conversa.
 *
 * A página `/conversas` carrega no servidor só a conversa aberta por padrão; ao clicar em
 * outra, o cliente precisa buscar. Sem isso a conversa aparecia como "Sem mensagens" — o
 * que também escondia o botão de apagar de cada mensagem.
 */
export async function getConversationMessages(conversationId: string): Promise<{
  messages: Array<{
    id: string;
    direction: "in" | "out";
    sender_type: string;
    content: string;
    created_at: string;
    status: string;
  }>;
  notes: Array<{ id: string; content: string; created_at: string }>;
}> {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const [mensagens, notas] = await Promise.all([
    supabase
      .from("messages")
      .select("id, direction, sender_type, content, created_at, status")
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversationId)
      .order("created_at")
      .limit(100),
    supabase
      .from("conversation_notes")
      .select("id, content, created_at")
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    messages: (mensagens.data ?? []) as any,
    notes: (notas.data ?? []) as any,
  };
}

/**
 * Apaga UMA mensagem: sai do CRM e, quando foi enviada por nós, também é revogada no
 * WhatsApp do lead (o WhatsApp não permite apagar no aparelho dele o que ele mesmo escreveu).
 */
export async function deleteMessage(
  messageId: string,
): Promise<{ deleted: number } & import("@/services/messaging/revoke.service").RevokeOutcome> {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Sem permissão");

  const supabase = createClient();

  // Revoga ANTES do delete: depois dele não existem mais external_id nem canal.
  const { revokeMessages } = await import("@/services/messaging/revoke.service");
  const revoke = await revokeMessages([messageId], organizationId).catch((e) => {
    console.warn("[delete] revoke falhou:", (e as Error).message);
    return { revoked: 0, localOnly: 1, failures: 0, skipped: 0 };
  });
  const { data, error } = await supabase
    .from("messages")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", messageId)
    .select("id, external_id");
  if (error) throw new Error(error.message);

  revalidatePath("/conversas");
  return { deleted: (data ?? []).length, ...revoke };
}

/**
 * Limpa TODAS as mensagens de uma conversa (mantém o contato e a conversa): sai do CRM e o
 * que foi enviado por nós também é revogado no WhatsApp do lead.
 */
export async function clearConversationMessages(
  conversationId: string,
): Promise<{ deleted: number } & import("@/services/messaging/revoke.service").RevokeOutcome> {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Sem permissão");

  const supabase = createClient();

  const { data: alvos, error: alvoErr } = await supabase
    .from("messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId);
  if (alvoErr) throw new Error(alvoErr.message);
  const ids = (alvos ?? []).map((m: any) => m.id as string);

  const { revokeMessages } = await import("@/services/messaging/revoke.service");
  const revoke = await revokeMessages(ids, organizationId).catch((e) => {
    console.warn("[clear] revoke falhou:", (e as Error).message);
    return { revoked: 0, localOnly: ids.length, failures: 0, skipped: 0 };
  });

  const { data, error } = await supabase
    .from("messages")
    .delete()
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .select("id");
  if (error) throw new Error(error.message);

  revalidatePath("/conversas");
  return { deleted: (data ?? []).length, ...revoke };
}


/**
 * Apaga a CONVERSA inteira (some da caixa de entrada) — o contato continua no CRM.
 *
 * As mensagens, notas, etiquetas e alertas ligados a ela vão junto: o banco já tem
 * `on delete cascade` em tudo que aponta para `conversations`, então basta apagar a linha.
 * O WhatsApp do lead **não** é tocado (para apagar lá também existe a limpeza por mensagem),
 * e se o lead escrever de novo o webhook recria a conversa, vazia.
 */
export async function deleteConversation(
  conversationId: string,
): Promise<{ messages: number }> {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Sem permissão");

  const supabase = createClient();

  // Conta antes: depois do delete as mensagens já foram embora em cascata.
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId);

  const { data, error } = await supabase
    .from("conversations")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .select("id");
  if (error) throw new Error(error.message);
  if ((data ?? []).length === 0) throw new Error("Conversa não encontrada");

  revalidatePath("/conversas");
  revalidatePath("/dashboard");
  return { messages: count ?? 0 };
}


/**
 * Resolve a conversa de E-MAIL do lead: o `external_id` é o próprio endereço
 * usa (`<email>`), então a resposta do cliente cai na mesma thread.
 */

/**
 * Marca no `media` da mensagem que o disparo foi manual (botão "Enviar agora")
 * e/ou feito fora da janela 9–18h — a tela mostra um tic nesses casos.
 */
async function outreachMarks(): Promise<Record<string, unknown>> {
  const { insideWindow } = await import("@/services/prospecting/outreach-queue");
  const outside = !insideWindow(new Date());
  return { outreach: { manual: true, outsideWindow: outside, at: new Date().toISOString() } };
}

/* ───────────────────────────── Prospecção ──────────────────────────── */

const MAX_PROSPECT_BATCH = 50; // lote quente p/ evitar ban; subir com aquecimento
const MAX_IMPORT_LINES = 2000; // linhas por importação de leads
// O agente gera uma mensagem por lead (LLM), então o lote é menor e mais lento.
const MAX_AGENT_PROSPECT_BATCH = 10;

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

    const conv = await ensureProspectConversation(supabase, {
      organizationId,
      contactId: c.id,
      channelId: chan.id,
      phone: c.phone,
    });
    if (!conv) {
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

/**
 * Registra o contato por e-mail no próprio contato (custom_fields) — assim o lead
 * aparece como "já contatado" mesmo antes de existir o canal de e-mail no CRM.
 */
async function registerEmailTouch(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  contactId: string,
  info: { provider: string; to: string; subject: string; source: string },
): Promise<void> {
  const { data } = await supabase
    .from("contacts")
    .select("custom_fields")
    .eq("id", contactId)
    .maybeSingle();

  const custom =
    data?.custom_fields && typeof data.custom_fields === "object"
      ? (data.custom_fields as Record<string, unknown>)
      : {};
  const history = Array.isArray(custom.email_prospeccao)
    ? (custom.email_prospeccao as unknown[])
    : [];

  await supabase
    .from("contacts")
    .update({
      custom_fields: {
        ...custom,
        email_prospeccao: [
          ...history.slice(-9),
          {
            at: new Date().toISOString(),
            provider: info.provider,
            to: info.to,
            subject: info.subject,
            source: info.source,
          },
        ],
      },
    })
    .eq("id", contactId)
    .eq("organization_id", organizationId);
}

export type AgentProspectResult = {
  queued: number;
  sent: number;
  skipped: number;
  alreadyContacted: number;
  emails: number;
  /** Contatos que receberam a abordagem (para marcar temperatura/valor depois). */
  contactIds: string[];
  previews: {
    name: string;
    channel: "whatsapp" | "email";
    contact: string | null;
    text: string;
    source: "agent" | "template";
  }[];
};

/**
 * Prospecção conduzida pelo agente: para cada contato selecionado o agente
 * escreve a primeira abordagem (prompt de vendas nativo) e a mensagem sai
 * por WhatsApp (outbox) ou por e-mail (Gmail), conforme o dado disponível.
 */
export async function prospectWithAgent(
  contactIds: string[],
  briefing: { offer?: string; goal?: string; notes?: string; value?: number } = {},
): Promise<AgentProspectResult> {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const ids = (contactIds ?? []).filter(Boolean).slice(0, MAX_AGENT_PROSPECT_BATCH);
  if (ids.length === 0) throw new Error("Selecione ao menos um contato");

  const { data: chan } = await supabase
    .from("channels")
    .select("id, type")
    .eq("organization_id", organizationId)
    .eq("type", "whatsapp")
    .eq("status", "conectado")
    .limit(1)
    .maybeSingle();

  const { data: contacts, error: cErr } = await supabase
    .from("contacts")
    .select("id, name, phone, email, custom_fields")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (cErr) throw new Error(cErr.message);

  const { generateFirstTouch, generateFirstTouchEmail } = await import(
    "@/services/prospecting/agent-outreach"
  );
  const { sendEmail, gmailStatus } = await import("@/services/email/gmail");
  const gmail = await gmailStatus(organizationId);
  const emailReady = gmail.canSend;

  if (!chan && !emailReady) {
    throw new Error(
      "Conecte o WhatsApp em Conexões (ou o Google, para e-mail) antes de prospectar",
    );
  }

  // Canal de e-mail reaproveitado/criado uma única vez por rodada
  let emailChannelId: string | null = null;
  async function ensureEmailChannel(): Promise<string | null> {
    if (emailChannelId) return emailChannelId;
    if (!gmail.canSend) return null; // canal no CRM só existe com Gmail/DDL do enum 'email' 

    const { data: existing } = await supabase
      .from("channels")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("type", "email")
      .limit(1)
      .maybeSingle();
    if (existing) {
      emailChannelId = existing.id;
      return emailChannelId;
    }

    const { data: created, error } = await supabase
      .from("channels")
      .insert({
        organization_id: organizationId,
        type: "email",
        name: "E-mail (Gmail)",
        status: "conectado",
        config: { provider: "gmail", from: gmail.email },
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[prospect/agent] canal de e-mail:", error.message);
      return null;
    }
    emailChannelId = created.id;
    return emailChannelId;
  }

  let queued = 0;
  let emails = 0;
  let skipped = 0;
  let alreadyContacted = 0;
  const contactedIds: string[] = [];
  const previews: AgentProspectResult["previews"] = [];

  // Quem já recebeu alguma mensagem nossa (out) não é recontatado nesta rodada.
  const { data: convsOfContacts } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("organization_id", organizationId)
    .in("contact_id", ids);
  const outboundContacts = new Set<string>();
  const convIds = (convsOfContacts ?? []).map((c) => c.id);
  if (convIds.length > 0) {
    const { data: outMsgs } = await supabase
      .from("messages")
      .select("conversation_id")
      .eq("organization_id", organizationId)
      .eq("direction", "out")
      .in("conversation_id", convIds);
    const convsWithOut = new Set((outMsgs ?? []).map((m) => String(m.conversation_id)));
    for (const c of convsOfContacts ?? []) {
      if (c.contact_id && convsWithOut.has(String(c.id))) outboundContacts.add(String(c.contact_id));
    }
  }

  for (const c of contacts ?? []) {
    if (outboundContacts.has(String(c.id))) {
      alreadyContacted++;
      continue;
    }

    const context =
      c.custom_fields && typeof c.custom_fields === "object"
        ? Object.entries(c.custom_fields as Record<string, unknown>)
            .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join("; ")
        : null;

    const lead = { id: c.id, name: c.name, phone: c.phone, email: c.email, context };

    // 1) WhatsApp quando houver telefone
    if (c.phone && chan) {
      const { text, source } = await generateFirstTouch(lead, briefing);

      const conv = await ensureProspectConversation(supabase, {
        organizationId,
        contactId: c.id,
        channelId: chan.id,
        phone: c.phone,
      });
      if (!conv) {
        skipped++;
        continue;
      }

      const { error: mErr } = await supabase.from("messages").insert({
        organization_id: organizationId,
        conversation_id: conv.id,
        direction: "out",
        sender_type: "agent_ai",
        content: text,
        status: "pendente",
        media: await outreachMarks(),
      });
      if (mErr) {
        console.error("[prospect/agent] mensagem:", mErr.message);
        skipped++;
        continue;
      }

      queued++;
      contactedIds.push(String(c.id));
      if (previews.length < 5) {
        previews.push({
          name: c.name ?? "",
          channel: "whatsapp",
          contact: c.phone,
          text,
          source,
        });
      }
      continue;
    }

    // 2) E-mail quando não houver telefone utilizável
    if (c.email && emailReady) {
      const { subject, body, source } = await generateFirstTouchEmail(lead, briefing);

      // E-mail pelo Gmail (OAuth em Conexões) — `emailReady` já garantiu que está ligado
      {
        const sent = await sendEmail({ organizationId, to: String(c.email), subject, text: body });
        if (sent.ok) {
          await registerEmailTouch(supabase, organizationId, String(c.id), {
            provider: "gmail",
            to: c.email,
            subject,
            source,
          });

          // Espelha no CRM: conversa de e-mail + mensagem enviada (aparece no inbox
          // e no painel "IA prospectando agora")
          const mailConv = await ensureEmailConversation(supabase, {
            organizationId,
            contactId: String(c.id),
            email: String(c.email),
          });
          if (mailConv) {
            await supabase.from("messages").insert({
              organization_id: organizationId,
              conversation_id: mailConv.id,
              direction: "out",
              sender_type: "agent_ai",
              content: `Assunto: ${subject}\n\n${body}`,
              status: "entregue",
              external_id: `gmail_email_${Date.now()}`,
              media: await outreachMarks(),
            });
          }

          emails++;
          contactIds.push(String(c.id));
          if (previews.length < 5) {
            previews.push({
              name: c.name ?? "",
              channel: "email",
              contact: c.email,
              text: `Assunto: ${subject}\n\n${body}`,
              source,
            });
          }
          continue;
        }
        console.error("[prospect/agent] e-mail via Gmail falhou:", sent.error);
      }

      // Gmail API (exige migration do enum + OAuth)
      if (!gmail.canSend) {
        skipped++;
        continue;
      }
      const chId = await ensureEmailChannel();
      if (!chId) {
        skipped++;
        continue;
      }

      const result = await sendEmail({
        organizationId,
        to: c.email,
        subject,
        text: body,
      });

      const { data: conv } = await supabase
        .from("conversations")
        .upsert(
          {
            organization_id: organizationId,
            contact_id: c.id,
            channel_id: chId,
            channel_type: "email",
            external_id: `email_${c.email.toLowerCase()}`,
            status: "aberta",
          },
          { onConflict: "channel_id,external_id" },
        )
        .select("id")
        .single();

      if (conv) {
        await supabase.from("messages").insert({
          organization_id: organizationId,
          conversation_id: conv.id,
          direction: "out",
          sender_type: "agent_ai",
          content: `${subject}\n\n${body}`,
          status: result.ok ? "entregue" : "falhou",
          external_id: result.ok ? `gmail_${result.id}` : null,
        });
      }

      if (!result.ok) {
        console.error("[prospect/agent] e-mail:", result.error);
        skipped++;
        continue;
      }

      emails++;
      contactedIds.push(String(c.id));
      if (previews.length < 5) {
        previews.push({
          name: c.name ?? "",
          channel: "email",
          contact: c.email,
          text: `Assunto: ${subject}\n\n${body}`,
          source,
        });
      }
      continue;
    }

    skipped++;
  }

  const { flushOutbox } = await import("@/services/messaging/inbound.service");
  const sent = queued > 0 ? await flushOutbox(Math.min(queued, MAX_PROSPECT_BATCH)).catch(() => 0) : 0;

  // Valor do serviço informado? cria/atualiza a oportunidade de cada lead abordado
  const dealValue = Number(briefing.value);
  if (Number.isFinite(dealValue) && dealValue > 0 && contactedIds.length > 0) {
    for (const id of contactedIds) {
      await saveLeadOpportunity({ contactId: id, value: dealValue }).catch((e) =>
        console.error("[prospect/agent] oportunidade:", (e as Error).message),
      );
    }
  }

  revalidatePath("/prospeccao");
  revalidatePath("/conversas");
  revalidatePath("/pipeline");
  return { queued, sent, skipped, alreadyContacted, emails, contactIds: contactedIds, previews };
}

export type FollowupActionResult = {
  candidates: number;
  queued: number;
  sent: number;
  skipped: number;
  details: { name: string; action: "enviado" | "pulado" | "falhou"; reason?: string }[];
};

/** Roda o follow-up de fechamento (retomada para quem não respondeu). */
export async function runProspectFollowups(
  options: { hours?: number; limit?: number; dryRun?: boolean; offer?: string; goal?: string } = {},
): Promise<FollowupActionResult> {
  const { organizationId } = await requireProfile();
  const { runFollowups } = await import("@/services/prospecting/followup.service");

  const result = await runFollowups({
    organizationId,
    hours: Math.max(1, options.hours ?? 24),
    limit: Math.min(20, Math.max(1, options.limit ?? 5)),
    dryRun: options.dryRun ?? false,
    briefing: { offer: options.offer, goal: options.goal },
  });

  revalidatePath("/prospeccao");
  revalidatePath("/conversas");
  return result;
}

export type ManualProspectResult = {
  contactId: string;
  created: boolean;
  queued: number;
  sent: number;
  preview: string;
  skippedReason?: string;
};

/**
 * "Disparar nova prospecção" manual: você viu um cliente em potencial em algum
 * lugar (indicação, Instagram, rua…) e dispara a abordagem na hora — sem payload
 * de busca. O contato é criado se ainda não existir e o agente escreve o texto.
 */
export async function prospectManualLead(input: {
  name: string;
  phone?: string;
  email?: string;
  offer?: string;
  goal?: string;
  notes?: string;
  /** Valor do serviço (cria a oportunidade no funil). */
  value?: number;
  temperature?: LeadTemperature;
}): Promise<ManualProspectResult> {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();

  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Informe o nome do contato");

  const phone = normalizePhone(String(input.phone ?? "")) ?? null;
  const email = String(input.email ?? "").trim().toLowerCase() || null;
  if (!phone && !email) throw new Error("Informe telefone ou e-mail");

  const { data: chan } = await supabase
    .from("channels")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("type", "whatsapp")
    .eq("status", "conectado")
    .limit(1)
    .maybeSingle();

  // Contato existente? (telefone por sufixo de 9 dígitos ou e-mail)
  let contactId: string | null = null;
  if (phone) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .like("phone", `%${phone.slice(-9)}`)
      .limit(1)
      .maybeSingle();
    contactId = data?.id ?? null;
  }
  if (!contactId && email) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    contactId = data?.id ?? null;
  }

  let created = false;
  if (!contactId) {
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        organization_id: organizationId,
        owner_id: userId,
        name,
        phone,
        email,
        custom_fields: { origem: "manual" },
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Falha ao criar contato");
    contactId = data.id;
    created = true;
  }

  if (!contactId) throw new Error("Não foi possível resolver o contato");
  const targetContactId: string = contactId;

  // enriquecimento salvo na busca (Google Maps): entra no contexto da abordagem
  const { data: contatoEnriquecido } = await supabase
    .from("contacts")
    .select("custom_fields")
    .eq("organization_id", organizationId)
    .eq("id", targetContactId)
    .maybeSingle();

  // Etiqueta de temperatura + oportunidade com o valor do serviço
  if (input.temperature) {
    await setLeadTemperature(targetContactId, input.temperature).catch((e) =>
      console.error("[prospect/manual] temperatura:", (e as Error).message),
    );
  }
  if (input.value && input.value > 0) {
    await saveLeadOpportunity({ contactId: targetContactId, value: input.value }).catch((e) =>
      console.error("[prospect/manual] oportunidade:", (e as Error).message),
    );
  }

  if (!phone && email) {
    const { sendEmail, gmailStatus } = await import("@/services/email/gmail");
    const mail = await gmailStatus(organizationId);
    if (mail.canSend) {
      const { generateFirstTouchEmail } = await import("@/services/prospecting/agent-outreach");
      const mailContent = await generateFirstTouchEmail(
        {
          id: targetContactId,
          name,
          email,
          context: mergeContext(input.notes ?? null, contatoEnriquecido?.custom_fields ?? null),
        },
        { offer: input.offer, goal: input.goal, notes: input.notes },
      );
      const sent = await sendEmail({
        organizationId,
        to: email,
        subject: mailContent.subject,
        text: mailContent.body,
      });
      if (sent.ok) {
        await registerEmailTouch(supabase, organizationId, targetContactId, {
          provider: "gmail",
          to: email,
          subject: mailContent.subject,
          source: mailContent.source,
        });

        const mailConv = await ensureEmailConversation(supabase, {
          organizationId,
          contactId: targetContactId,
          email,
        });
        if (mailConv) {
          await supabase.from("messages").insert({
            organization_id: organizationId,
            conversation_id: mailConv.id,
            direction: "out",
            sender_type: "agent_ai",
            content: `Assunto: ${mailContent.subject}\n\n${mailContent.body}`,
            status: "entregue",
            external_id: `gmail_email_${Date.now()}`,
            media: await outreachMarks(),
          });
        }
      }
      revalidatePath("/prospeccao");
      revalidatePath("/contatos");
      return {
        contactId: targetContactId,
        created,
        queued: sent.ok ? 1 : 0,
        sent: sent.ok ? 1 : 0,
        preview: sent.ok
          ? `Assunto: ${mailContent.subject}\n\n${mailContent.body}`
          : "",
        skippedReason: sent.ok ? undefined : `Falha no e-mail: ${sent.error}`,
      };
    }
  }

  if (!phone || !chan) {
    revalidatePath("/prospeccao");
    revalidatePath("/contatos");
    return {
      contactId: targetContactId,
      created,
      queued: 0,
      sent: 0,
      preview: "",
      skippedReason: !phone
        ? "contato salvo sem telefone (e-mail exige o Gmail conectado)"
        : "WhatsApp não conectado",
    };
  }

  const conv = await ensureProspectConversation(supabase, {
    organizationId,
    contactId: targetContactId,
    channelId: chan.id,
    phone,
  });
  if (!conv) throw new Error("Não foi possível abrir a conversa");

  const { generateFirstTouch } = await import("@/services/prospecting/agent-outreach");
  const { text, source } = await generateFirstTouch(
    {
      id: targetContactId,
      name,
      phone,
      email,
      context: mergeContext(input.notes ?? null, contatoEnriquecido?.custom_fields ?? null),
    },
    { offer: input.offer, goal: input.goal, notes: input.notes },
  );

  const { error: msgErr } = await supabase.from("messages").insert({
    organization_id: organizationId,
    conversation_id: conv.id,
    direction: "out",
    sender_type: "agent_ai",
    content: text,
    status: "pendente",
    media: await outreachMarks(),
  });
  if (msgErr) throw new Error(msgErr.message);

  const { flushOutbox } = await import("@/services/messaging/inbound.service");
  const sent = await flushOutbox(1).catch(() => 0);

  revalidatePath("/prospeccao");
  revalidatePath("/conversas");
  revalidatePath("/contatos");
  return {
    contactId: targetContactId,
    created,
    queued: 1,
    sent,
    preview: source === "agent" ? text : `[modelo] ${text}`,
  };
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
      config:
        rule_key === "falhas_seguidas"
          ? { limite: 3 }
          : rule_key === "fora_do_horario"
            ? {
                agent_memory: `Subagente ${role}: atua com autonomia no próprio papel de ${role}.`,
              }
            : {},
    })),
  );

  await supabase.from("knowledge_base_items").insert({
    organization_id: organizationId,
    title: "Memória: perfil",
    category: `agent_memory:${agent.id}`,
    content: `Subagente ${role}: atua com autonomia no próprio papel de ${role}.`,
  });

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

export async function updateAgentMemory(agentId: string, key: string, content: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const cleanKey = key.trim() || "perfil";
  const category = `agent_memory:${agentId}`;
  const title = `Memória: ${cleanKey}`;

  const { data: existing } = await supabase
    .from("knowledge_base_items")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("category", category)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("knowledge_base_items")
      .update({ title, content, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("knowledge_base_items")
      .insert({ organization_id: organizationId, title, category, content });
  }

  // Backup persistente nas configs de handoff do agente
  const { data: currentRule } = await supabase
    .from("agent_handoff_rules")
    .select("config")
    .eq("agent_id", agentId)
    .eq("rule_key", "fora_do_horario")
    .maybeSingle();

  await supabase.from("agent_handoff_rules").upsert(
    {
      organization_id: organizationId,
      agent_id: agentId,
      rule_key: "fora_do_horario",
      config: { ...(currentRule?.config ?? {}), agent_memory: content },
    },
    { onConflict: "agent_id,rule_key" },
  );

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

/**
 * Voz do agente nas respostas em áudio (`agents.voice`) — a voz usada quando o lead manda nota
 * de voz e quem atendeu é este agente.
 *
 * Grava **só** essa coluna: nada de prompt, ferramentas, canais ou memória. O identificador é
 * validado contra o catálogo (`VOICE_CATALOG`), que espelha o que cada motor aceita de verdade —
 * o MLVoice Engine v2 recusa com HTTP 422 qualquer voz fora da lista dele, então deixar passar
 * um valor inventado só daria erro na hora do atendimento. String vazia limpa a coluna (NULL) e o
 * agente volta para a voz padrão do ambiente (`TTS_VOICE`).
 */
export async function updateAgentVoice(agentId: string, voice: string) {
  const limpo = String(voice ?? "").trim();

  if (limpo && !VOICE_CATALOG.some((v) => v.value === limpo)) {
    throw new Error(`Voz não permitida: ${limpo}`);
  }

  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const { error } = await supabase
    .from("agents")
    .update({ voice: limpo || null })
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
