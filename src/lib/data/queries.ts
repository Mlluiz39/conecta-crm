import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export async function getContacts(search?: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  let query = supabase
    .from("contacts")
    .select("id, name, phone, email, instagram_handle, messenger_psid, custom_fields, owner_id, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
  }
  const { data } = await query;
  return data ?? [];
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

export async function getOpportunities() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("opportunities")
    .select(
      "id, title, value, stage_id, position, lost_reason, closed_at, custom_fields, created_at, contact:contacts(id, name, phone)",
    )
    .eq("organization_id", organizationId)
    .order("position", { ascending: true })
    .limit(300);
  return data ?? [];
}

export async function getConversations() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      "id, channel_id, channel_type, status, bot_active, unread_count, last_message_at, agent_id, assigned_to, contact:contacts(id, name, phone), agent:agents(id, name)",
    )
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
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
