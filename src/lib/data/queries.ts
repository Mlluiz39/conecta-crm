import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

/**
 * IDs de contatos que já receberam alguma mensagem nossa (direction='out').
 * Usado na tela de prospecção para marcar quem já foi contatado — o agente
 * não recontata esses leads automaticamente.
 */
export async function getContactedContactIds(contactIds: string[]): Promise<string[]> {
  if (contactIds.length === 0) return [];
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("organization_id", organizationId)
    .in("contact_id", contactIds);
  if (!convs || convs.length === 0) return [];

  const { data: outs } = await supabase
    .from("messages")
    .select("conversation_id")
    .eq("organization_id", organizationId)
    .eq("direction", "out")
    .in(
      "conversation_id",
      convs.map((c) => c.id),
    );

  const withOut = new Set((outs ?? []).map((m) => String(m.conversation_id)));
  return convs
    .filter((c) => c.contact_id && withOut.has(String(c.id)))
    .map((c) => String(c.contact_id));
}

export type ProspectStats = {
  total: number;
  contacted: number;
  replied: number;
  waiting: number;
  noPhone: number;
};

/**
 * Números da prospecção para o topo da tela:
 * total de leads, quantos já foram contatados, quantos responderam e
 * quantos estão aguardando (contatados, sem resposta).
 */
export async function getProspectStats(): Promise<ProspectStats> {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, phone, email")
    .eq("organization_id", organizationId);
  const all = contacts ?? [];

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("organization_id", organizationId);

  const stats: ProspectStats = {
    total: all.length,
    contacted: 0,
    replied: 0,
    waiting: 0,
    noPhone: all.filter((c) => !c.phone && c.email).length,
  };
  if (!convs || convs.length === 0) return stats;

  const { data: msgs } = await supabase
    .from("messages")
    .select("conversation_id, direction")
    .eq("organization_id", organizationId)
    .in(
      "conversation_id",
      convs.map((c) => c.id),
    );

  const byConversation = new Map<string, { out: boolean; in: boolean }>();
  for (const m of msgs ?? []) {
    const key = String(m.conversation_id);
    const entry = byConversation.get(key) ?? { out: false, in: false };
    if (m.direction === "out") entry.out = true;
    else entry.in = true;
    byConversation.set(key, entry);
  }

  const contacted = new Set<string>();
  const replied = new Set<string>();
  for (const c of convs) {
    if (!c.contact_id) continue;
    const entry = byConversation.get(String(c.id));
    if (!entry) continue;
    if (entry.out) contacted.add(String(c.contact_id));
    if (entry.out && entry.in) replied.add(String(c.contact_id));
  }

  stats.contacted = contacted.size;
  stats.replied = replied.size;
  stats.waiting = [...contacted].filter((id) => !replied.has(id)).length;
  return stats;
}

export async function getContacts(search?: string, page = 1, limit = 50) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const offset = (page - 1) * limit;

  let query = supabase
    .from("contacts")
    .select(
      `
      id, name, phone, email, instagram_handle, messenger_psid, custom_fields, owner_id, created_at,
      contact_tags (
        tag:tags (id, name, color)
      ),
      opportunities (
        id, title, value, stage_id
      ),
      conversations (
        id, channel_type, last_message_at, status
      )
    `,
      { count: "exact" }
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
  }
  const { data, count } = await query;

  // Fetch members to map owner_id -> name
  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id, full_name")
    .eq("organization_id", organizationId);

  const memberMap = new Map<string, string>();
  if (members) {
    for (const m of members) {
      if (m.user_id && m.full_name) memberMap.set(m.user_id, m.full_name);
    }
  }

  const contacts = (data ?? []).map((c: any) => ({
    ...c,
    owner_name: c.owner_id ? memberMap.get(c.owner_id) ?? null : null,
  }));

  return { contacts, count: count ?? 0 };
}

export async function getContactById(id: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("contacts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .single();
  return data;
}

export async function getStages() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("pipeline_stages")
    .select("id, name, color, position, is_won, is_lost")
    .eq("organization_id", organizationId)
    .order("position");
  return data ?? [];
}

export async function getOpportunities(limit = 50) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("opportunities")
    .select(
      "id, title, value, stage_id, position, lost_reason, closed_at, custom_fields, created_at, contact:contacts(id, name, phone)",
    )
    .eq("organization_id", organizationId)
    .order("position", { ascending: true })
    .limit(limit);
  return data ?? [];
}

export async function getConversations(limit = 50) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      "id, channel_id, channel_type, status, bot_active, unread_count, last_message_at, agent_id, assigned_to, contact:contacts(id, name, phone), agent:agents(id, name)",
    )
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

export async function getMessages(conversationId: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, direction, sender_type, content, media, status, created_at")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at")
    .limit(200);
  return data ?? [];
}

export async function getInternalNotes(conversationId: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("conversation_notes")
    .select("id, content, created_at, author_id")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getAgents() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("agents")
    .select("id, name, role, tone, is_active, created_at")
    .eq("organization_id", organizationId)
    .order("created_at");
  return data ?? [];
}

export async function getAgentDetail(agentId: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const [agent, versions, channels, tools, rules] = await Promise.all([
    supabase.from("agents").select("*").eq("id", agentId).eq("organization_id", organizationId).single(),
    supabase.from("agent_prompt_versions").select("id, version, prompt, status, created_at").eq("agent_id", agentId).order("version", { ascending: false }),
    supabase.from("agent_channels").select("channel, is_active").eq("agent_id", agentId),
    supabase.from("agent_tools").select("tool_key, enabled, config").eq("agent_id", agentId),
    supabase.from("agent_handoff_rules").select("rule_key, enabled, config").eq("agent_id", agentId),
  ]);
  return {
    agent: agent.data,
    versions: versions.data ?? [],
    channels: channels.data ?? [],
    tools: tools.data ?? [],
    rules: rules.data ?? [],
  };
}

export async function getDashboardKpis() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const [contacts, opps, convs, appts, stages] = await Promise.all([
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("opportunities").select("value, stage_id").eq("organization_id", organizationId),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).neq("status", "resolvida"),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("starts_at", new Date().toISOString()),
    supabase.from("pipeline_stages").select("id, is_won, is_lost").eq("organization_id", organizationId),
  ]);

  const wonStageIds = new Set((stages.data ?? []).filter((s: any) => s.is_won).map((s: any) => s.id));
  const lostStageIds = new Set((stages.data ?? []).filter((s: any) => s.is_lost).map((s: any) => s.id));

  const allOpps = opps.data ?? [];
  const won = allOpps.filter((o: any) => wonStageIds.has(o.stage_id));
  const open = allOpps.filter((o: any) => !wonStageIds.has(o.stage_id) && !lostStageIds.has(o.stage_id));
  const total = open.reduce((s: number, o: any) => s + Number(o.value), 0);
  const conversion = allOpps.length ? (won.length / allOpps.length) * 100 : 0;

  return {
    contacts: contacts.count ?? 0,
    pipelineValue: total,
    openConversations: convs.count ?? 0,
    upcomingAppointments: appts.count ?? 0,
    conversionRate: conversion,
    wonCount: won.length,
    openCount: open.length,
  };
}
