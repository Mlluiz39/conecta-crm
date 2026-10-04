"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export async function getTemplates() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

function parseButtons(raw: string) {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.slice(0, 3) : [];
  } catch {
    return [];
  }
}

export async function createTemplate(formData: FormData) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();

  const body = String(formData.get("body") ?? "").trim();
  const variables = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]);

  const { error } = await supabase.from("whatsapp_templates").insert({
    organization_id: organizationId,
    name: String(formData.get("name") ?? "").trim().toLowerCase().replace(/\s+/g, "_"),
    category: String(formData.get("category") ?? "UTILIDADE") as any,
    language: String(formData.get("language") ?? "pt_BR"),
    header_type: String(formData.get("header_type") ?? "none"),
    header_text: String(formData.get("header_text") ?? "") || null,
    body,
    footer: String(formData.get("footer") ?? "") || null,
    buttons: parseButtons(String(formData.get("buttons") ?? "[]")),
    variables,
    status: "PENDENTE",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/templates");
}

export async function updateTemplate(formData: FormData) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const id = String(formData.get("id"));

  const body = String(formData.get("body") ?? "").trim();
  const variables = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]);

  const { error } = await supabase
    .from("whatsapp_templates")
    .update({
      body,
      footer: String(formData.get("footer") ?? "") || null,
      header_text: String(formData.get("header_text") ?? "") || null,
      buttons: parseButtons(String(formData.get("buttons") ?? "[]")),
      variables,
    })
    .eq("organization_id", organizationId)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/templates");
}

export async function duplicateTemplate(id: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data: src } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .single();
  if (!src) throw new Error("Template não encontrado");

  const { error } = await supabase.from("whatsapp_templates").insert({
    organization_id: organizationId,
    name: `${src.name}_copia_${Date.now().toString().slice(-4)}`,
    category: src.category,
    language: src.language,
    header_type: src.header_type,
    header_text: src.header_text,
    body: src.body,
    footer: src.footer,
    buttons: src.buttons,
    variables: src.variables,
    status: "PENDENTE",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/templates");
}

export async function deleteTemplate(id: string) {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Sem permissão");
  const supabase = createClient();
  await supabase.from("whatsapp_templates").delete().eq("organization_id", organizationId).eq("id", id);
  revalidatePath("/templates");
}

/**
 * Submete o template à aprovação da Meta. Sem credenciais WABA configuradas,
 * marca como pendente localmente (stub). Upgrade: POST ao endpoint
 * `/{waba-id}/message_templates` da Meta e acompanhar status por webhook.
 */
export async function submitTemplate(id: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  await supabase
    .from("whatsapp_templates")
    .update({ status: "PENDENTE", submitted_at: new Date().toISOString(), rejection_reason: null })
    .eq("organization_id", organizationId)
    .eq("id", id);
  revalidatePath("/templates");
}
