import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSuppressionIndex,
  normalizeSuppressionEmail,
  normalizeSuppressionPhone,
  type SuppressionIndex,
  type SuppressionRow,
} from "@/lib/data/suppression-index";

/**
 * Leitura e escrita da lista de supressão. Recebe o client por parâmetro para
 * servir tanto a sessão (tela) quanto o service role (webhook/cron).
 */

export type SuppressionTarget = {
  organizationId: string;
  contactId?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type SuppressInput = SuppressionTarget & {
  reason?: string;
  source?: "whatsapp" | "email" | "manual" | "import";
  createdBy?: string | null;
};

export async function loadSuppressionIndex(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<SuppressionIndex> {
  const { data, error } = await supabase
    .from("contact_suppressions")
    .select("contact_id, phone, email")
    .eq("organization_id", organizationId)
    .limit(5000);

  if (error) {
    console.error("[suppressions] leitura falhou:", error.message);
    return buildSuppressionIndex([]);
  }
  return buildSuppressionIndex((data ?? []) as SuppressionRow[]);
}

/** Devolve a linha que bloqueia o contato, se existir. */
export async function isContactSuppressed(
  supabase: SupabaseClient,
  target: SuppressionTarget,
): Promise<SuppressionRow | null> {
  const phone = normalizeSuppressionPhone(target.phone);
  const email = normalizeSuppressionEmail(target.email);

  if (target.contactId) {
    const { data } = await supabase
      .from("contact_suppressions")
      .select("contact_id, phone, email")
      .eq("organization_id", target.organizationId)
      .eq("contact_id", target.contactId)
      .limit(1)
      .maybeSingle();
    if (data) return data as SuppressionRow;
  }
  if (phone) {
    const { data } = await supabase
      .from("contact_suppressions")
      .select("contact_id, phone, email")
      .eq("organization_id", target.organizationId)
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (data) return data as SuppressionRow;
  }
  if (email) {
    const { data } = await supabase
      .from("contact_suppressions")
      .select("contact_id, phone, email")
      .eq("organization_id", target.organizationId)
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (data) return data as SuppressionRow;
  }
  return null;
}

async function contactIdentity(
  supabase: SupabaseClient,
  organizationId: string,
  contactId: string | null | undefined,
): Promise<{ phone: string | null; email: string | null }> {
  if (!contactId) return { phone: null, email: null };
  const { data } = await supabase
    .from("contacts")
    .select("phone, email")
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .maybeSingle();
  return {
    phone: normalizeSuppressionPhone(data?.phone),
    email: normalizeSuppressionEmail(data?.email),
  };
}

async function removeSuppressionMatches(
  supabase: SupabaseClient,
  input: { organizationId: string; contactId?: string | null; phone?: string | null; email?: string | null },
): Promise<void> {
  const { organizationId, contactId } = input;
  const phone = normalizeSuppressionPhone(input.phone);
  const email = normalizeSuppressionEmail(input.email);

  if (contactId) {
    await supabase
      .from("contact_suppressions")
      .delete()
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId);
  }
  if (phone) {
    await supabase
      .from("contact_suppressions")
      .delete()
      .eq("organization_id", organizationId)
      .eq("phone", phone);
  }
  if (email) {
    await supabase
      .from("contact_suppressions")
      .delete()
      .eq("organization_id", organizationId)
      .eq("email", email);
  }
}

/** Marca o contato como "não contatar" e tira da fila o que estava pendente. */
export async function suppressContact(
  supabase: SupabaseClient,
  input: SuppressInput,
): Promise<void> {
  const identity = await contactIdentity(supabase, input.organizationId, input.contactId);
  const phone = normalizeSuppressionPhone(input.phone) ?? identity.phone;
  const email = normalizeSuppressionEmail(input.email) ?? identity.email;

  if (!input.contactId && !phone && !email) return;

  // A unique é por telefone/e-mail; apagar antes evita 23505 quando a mesma
  // pessoa está cadastrada em outro contato ou foi importada de novo.
  await removeSuppressionMatches(supabase, {
    organizationId: input.organizationId,
    contactId: input.contactId,
    phone,
    email,
  });

  const { error } = await supabase.from("contact_suppressions").insert({
    organization_id: input.organizationId,
    contact_id: input.contactId ?? null,
    phone,
    email,
    reason: input.reason ?? "pedido_do_lead",
    source: input.source ?? "manual",
    created_by: input.createdBy ?? null,
  });

  // Corrida entre dois webhooks do mesmo lead: o outro já gravou, tudo bem.
  if (error && error.code !== "23505") {
    console.error("[suppressions] insert falhou:", error.message);
    return;
  }

  if (input.contactId) {
    await cancelPendingOutreach(supabase, input.organizationId, input.contactId);
  }
}

/** Remove a supressão (a pessoa pediu para voltar a receber). */
export async function unsuppressContact(
  supabase: SupabaseClient,
  input: SuppressionTarget,
): Promise<void> {
  const identity = await contactIdentity(supabase, input.organizationId, input.contactId);
  await removeSuppressionMatches(supabase, {
    organizationId: input.organizationId,
    contactId: input.contactId,
    phone: normalizeSuppressionPhone(input.phone) ?? identity.phone,
    email: normalizeSuppressionEmail(input.email) ?? identity.email,
  });
}

/** Tira o contato da fila de prospecção sem apagar o histórico. */
export async function cancelPendingOutreach(
  supabase: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<void> {
  await supabase
    .from("outreach_queue")
    .update({
      status: "cancelado",
      last_error: "opt-out do lead",
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("status", "pendente");
}
