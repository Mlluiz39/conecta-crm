"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { BusinessType, FieldType, UserRole } from "@/types/domain";

export async function getBusinessPresets() {
  const supabase = createClient();
  const { data } = await supabase
    .from("business_profiles")
    .select("business_type, name, custom_fields, pipeline_stages, tags");
  return data ?? [];
}

export async function getCustomFields(entity = "contact") {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("custom_field_definitions")
    .select("id, key, label, type, options, position")
    .eq("organization_id", organizationId)
    .eq("entity", entity)
    .order("position");
  return data ?? [];
}

export async function getTeam() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("user_id, role, full_name, is_active")
    .eq("organization_id", organizationId)
    .order("created_at");
  return (data ?? []).map((m: any) => ({
    id: m.user_id,
    full_name: m.full_name,
    email: m.full_name ? `${m.full_name.toLowerCase().replace(/\s+/g, ".")}@empresa.com.br` : "usuario@empresa.com.br",
    role: m.role,
    is_active: m.is_active,
  }));
}

export async function getOrganization() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, name, business_type, timezone, business_hours, out_of_hours_message")
    .eq("id", organizationId)
    .single();
  return data;
}

/** Nome da organização ({{nome_empresa}} nos prompts dos agentes). */
export async function updateOrganizationName(name: string) {
  const clean = name.trim();
  if (!clean) throw new Error("Nome vazio");
  const { organizationId, role } = await requireProfile();
  if (role !== "admin") throw new Error("Não autorizado: somente administradores podem alterar o nome da empresa");
  const supabase = createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq("id", organizationId);
  if (error) throw new Error(error.message);
  revalidatePath("/configuracoes");
}

/**
 * Aplica um preset de negócio: executa a procedure nativa apply_business_profile do Postgres.
 */
export async function applyPreset(businessType: BusinessType) {
  const { organizationId, role } = await requireProfile();
  if (role !== "admin") throw new Error("Apenas administradores podem aplicar presets");

  const supabase = createClient();

  // Atualiza o business_type da organização
  await supabase
    .from("organizations")
    .update({ business_type: businessType, updated_at: new Date().toISOString() })
    .eq("id", organizationId);

  // Executa a procedure do schema
  const { error } = await supabase.rpc("apply_business_profile", { p_org: organizationId });
  if (error) {
    console.error("Erro apply_business_profile RPC:", error);
  }

  revalidatePath("/configuracoes");
  revalidatePath("/contatos");
  revalidatePath("/pipeline");
  revalidatePath("/agentes");
}

export async function inviteUser(formData: FormData) {
  const { organizationId, role } = await requireProfile();
  if (role !== "admin") throw new Error("Apenas administradores convidam");

  const email = String(formData.get("email") ?? "").trim();
  const userRole = (String(formData.get("role") ?? "atendente") as UserRole) || "atendente";
  const fullName = String(formData.get("full_name") ?? "").trim();

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: invite, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role: userRole, full_name: fullName },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`,
  });

  if (error) throw new Error(error.message);

  if (invite?.user) {
    await admin.from("organization_members").upsert({
      organization_id: organizationId,
      user_id: invite.user.id,
      role: userRole,
      full_name: fullName,
      is_active: true,
    });
  }

  revalidatePath("/configuracoes");
}

export async function setUserRole(userId: string, role: string) {
  const { organizationId, role: myRole } = await requireProfile();
  if (myRole !== "admin") throw new Error("Apenas administradores");
  const supabase = createClient();
  await supabase
    .from("organization_members")
    .update({ role: role as UserRole })
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  revalidatePath("/configuracoes");
}

export async function createCustomField(formData: FormData) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const optionsRaw = String(formData.get("options") ?? "").trim();
  await supabase.from("custom_field_definitions").insert({
    organization_id: organizationId,
    entity: "contact",
    key: String(formData.get("key") ?? "").trim().toLowerCase().replace(/\s+/g, "_"),
    label: String(formData.get("name") ?? "").trim(),
    type: (String(formData.get("type") ?? "text") as FieldType) || "text",
    options: optionsRaw ? optionsRaw.split(",").map((s) => s.trim()) : [],
    position: 999,
  });
  revalidatePath("/configuracoes");
  revalidatePath("/contatos");
}

export async function deleteCustomField(id: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  await supabase
    .from("custom_field_definitions")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id);
  revalidatePath("/configuracoes");
  revalidatePath("/contatos");
}
