import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Garante que o contato tenha um card aberto no funil.
 *
 * É o elo que faltava: até aqui uma conversa de WhatsApp criava contato e
 * conversa, mas o Pipeline ficava vazio até alguém salvar um valor à mão.
 * A criação é determinística (não depende do modelo) e idempotente: se já
 * existe oportunidade aberta para o contato, devolve a existente.
 *
 * "Aberta" = `closed_at is null`. Card ganho/perdido não é reaberto sozinho;
 * um lead que volta depois de perdido ganha um card novo, que é o comportamento
 * que o funil espera.
 */

export type EnsureOpportunityResult = { id: string; created: boolean };

export async function ensureOpenOpportunity(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    contactId: string;
    contactName?: string | null;
    stageId?: string | null;
    title?: string | null;
    ownerId?: string | null;
  },
): Promise<EnsureOpportunityResult | null> {
  const { organizationId, contactId } = input;

  const { data: existing } = await supabase
    .from("opportunities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .is("closed_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return { id: String(existing.id), created: false };

  let stageId: string | null = input.stageId ?? null;
  if (stageId) {
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", stageId)
      .maybeSingle();
    if (!stage) stageId = null; // etapa de outra organização: cai na primeira
  }

  if (!stageId) {
    const { data: firstStage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("organization_id", organizationId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    stageId = firstStage?.id ? String(firstStage.id) : null;
  }

  // Organização sem funil configurado: não inventa etapa, devolve null e o
  // chamador segue (o lead já está salvo; o card nasce quando houver funil).
  if (!stageId) return null;

  let contactName = input.contactName ?? null;
  if (!contactName) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("name")
      .eq("organization_id", organizationId)
      .eq("id", contactId)
      .maybeSingle();
    contactName = contact?.name ?? null;
  }

  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      organization_id: organizationId,
      contact_id: contactId,
      stage_id: stageId,
      title: input.title?.trim() || `Lead — ${contactName ?? "sem nome"}`,
      value: 0,
      position: 0,
      owner_id: input.ownerId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // Corrida (dois webhooks do mesmo lead ao mesmo tempo): usa o card que o
    // outro criou em vez de duplicar.
    const { data: again } = await supabase
      .from("opportunities")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .is("closed_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (again) return { id: String(again.id), created: false };

    console.error("[opportunity] não foi possível criar o card:", error.message);
    return null;
  }

  // Sem unique parcial em `opportunities`, duas transações simultâneas podem
  // inserir dois cards abertos. O mais antigo (created_at, id) vence e o mais
  // novo apaga o próprio excedente — determinístico nos dois lados da corrida.
  const { data: openCards } = await supabase
    .from("opportunities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .is("closed_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(2);

  const winner = openCards?.[0];
  if (winner && String(winner.id) !== String(data.id)) {
    await supabase.from("opportunities").delete().eq("id", data.id);
    return { id: String(winner.id), created: false };
  }

  return { id: String(data.id), created: true };
}
