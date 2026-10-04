"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { BusinessType } from "@/types/domain";

export async function getBusinessPresets() {
  const supabase = createClient();
  const { data } = await supabase
    .from("business_presets")
    .select("business_type, name, description, icon, config");
  return data ?? [];
}

export async function getCustomFields(entity = "contact") {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("custom_field_defs")
    .select("id, key, name, type, options, required, position, is_active")
    .eq("organization_id", organizationId)
    .eq("entity", entity)
    .order("position");
  return data ?? [];
}

export async function getTeam() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .eq("organization_id", organizationId)
    .order("created_at");
  return data ?? [];
}

export async function getOrganization() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, name, business_type, settings, timezone")
    .eq("id", organizationId)
    .single();
  return data;
}

/**
 * Aplica um preset de negócio: substitui etapas do funil, tags e campos
 * customizados da organização pelos do preset. Idempotente por chave/nome.
 */
export async function applyPreset(businessType: BusinessType) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const { data: preset } = await supabase
    .from("business_presets")
    .select("config")
    .eq("business_type", businessType)
    .single();
  if (!preset) throw new Error("Preset não encontrado");

  const config = preset.config as any;

  await supabase.from("organizations").update({ business_type: businessType }).eq("id", organizationId);

  // Etapas: só cria as que ainda não existem (por nome), preservando o funil atual.
  const { data: existingStages } = await supabase
    .from("pipeline_stages")
    .select("name, position")
    .eq("organization_id", organizationId);
  const existingNames = new Set((existingStages ?? []).map((s: any) => s.name));
  let pos = Math.max(0, ...(existingStages ?? []).map((s: any) => Number(s.position)), 0);

  for (const stage of config.pipeline_stages ?? []) {
    if (existingNames.has(stage.name)) continue;
    pos += 1000;
    await supabase.from("pipeline_stages").insert({
      organization_id: organizationId,
      name: stage.name,
      color: stage.color ?? "#4f46e5",
      position: pos,
      target_conversion_rate: stage.target ?? null,
      is_won: !!stage.is_won,
      is_lost: !!stage.is_lost,
    });
  }

  // Tags
  for (const tag of config.tags ?? []) {
    await supabase
      .from("tags")
      .upsert({ organization_id: organizationId, name: tag }, { onConflict: "organization_id,name", ignoreDuplicates: true });
  }

  // Campos customizados
  let i = 0;
  for (const field of config.custom_fields ?? []) {
    await supabase.from("custom_field_defs").upsert(
      {
        organization_id: organizationId,
        entity: "contact",
        key: field.key,
        name: field.name,
        type: field.type,
        options: field.options ?? null,
        required: !!field.required,
        position: i++,
      },
      { onConflict: "organization_id,entity,key", ignoreDuplicates: true },
    );
  }

  revalidatePath("/configuracoes");
  revalidatePath("/contatos");
  revalidatePath("/pipeline");
}

export async function inviteUser(formData: FormData) {
  const { organizationId, role } = await requireProfile();
  if (role !== "admin") throw new Error("Apenas administradores convidam");

  const email = String(formData.get("email") ?? "").trim();
  const userRole = String(formData.get("role") ?? "atendente");
  const fullName = String(formData.get("full_name") ?? "").trim();

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role: userRole, full_name: fullName },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/configuracoes");
}

export async function setUserRole(userId: string, role: string) {
  const { organizationId, role: myRole } = await requireProfile();
  if (myRole !== "admin") throw new Error("Apenas administradores");
  const supabase = createClient();
  await supabase.from("profiles").update({ role: role as any }).eq("organization_id", organizationId).eq("id", userId);
  revalidatePath("/configuracoes");
}

export async function createCustomField(formData: FormData) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const optionsRaw = String(formData.get("options") ?? "").trim();
  await supabase.from("custom_field_defs").insert({
    organization_id: organizationId,
    entity: "contact",
    key: String(formData.get("key") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type") ?? "text") as any,
    options: optionsRaw ? optionsRaw.split(",").map((s) => s.trim()) : null,
    required: false,
    position: 999,
  });
  revalidatePath("/configuracoes");
  revalidatePath("/contatos");
}

export async function deleteCustomField(id: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  await supabase.from("custom_field_defs").delete().eq("organization_id", organizationId).eq("id", id);
  revalidatePath("/configuracoes");
  revalidatePath("/contatos");
}
