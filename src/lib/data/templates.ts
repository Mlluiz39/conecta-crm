"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { TemplateCategory } from "@/types/domain";

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

  const rawCategory = String(formData.get("category") ?? "utilidade").toLowerCase() as TemplateCategory;
  const validCategory: TemplateCategory = ["marketing", "utilidade", "autenticacao"].includes(rawCategory)
    ? rawCategory
    : "utilidade";

  const { error } = await supabase.from("whatsapp_templates").insert({
    organization_id: organizationId,
    name: String(formData.get("name") ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    category: validCategory,
    language: String(formData.get("language") ?? "pt_BR"),
    header: String(formData.get("header_text") ?? "") || null,
    body,
    footer: String(formData.get("footer") ?? "") || null,
    buttons: parseButtons(String(formData.get("buttons") ?? "[]")),
    variables,
    status: "pendente",
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
      header: String(formData.get("header_text") ?? "") || null,
      buttons: parseButtons(String(formData.get("buttons") ?? "[]")),
      variables,
      updated_at: new Date().toISOString(),
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
    header: src.header,
    body: src.body,
    footer: src.footer,
    buttons: src.buttons,
    variables: src.variables,
    status: "rascunho",
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

export async function submitTemplate(id: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  await supabase
    .from("whatsapp_templates")
    .update({ status: "pendente", submitted_at: new Date().toISOString(), rejection_reason: null })
    .eq("organization_id", organizationId)
    .eq("id", id);
  revalidatePath("/templates");
}
