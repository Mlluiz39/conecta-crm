"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

/**
 * Fontes públicas de captação (formulário, landing, anúncio, Zapier/n8n).
 *
 * O token é gerado aqui, no servidor, e nunca aparece em log ou em consulta
 * pública: a tela mostra a URL uma vez e quem tiver o endereço consegue criar
 * lead naquela organização. Desativar a fonte corta a entrada sem apagar o
 * histórico; apagar remove a URL de vez.
 */

export type CaptureSource = {
  id: string;
  name: string;
  token: string;
  stage_id: string | null;
  is_active: boolean;
  created_at: string;
  stage?: { name: string } | null;
};

export type PipelineStageOption = { id: string; name: string; position: number };

const MANAGE_ROLES = new Set(["admin", "gerente"]);

function assertCanManage(role: string) {
  if (!MANAGE_ROLES.has(role)) {
    throw new Error("Só administrador ou gerente pode administrar fontes de captação");
  }
}

export async function listCaptureSources(): Promise<CaptureSource[]> {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("lead_capture_sources")
    .select("id, name, token, stage_id, is_active, created_at, stage:pipeline_stages(name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as CaptureSource[];
}

export async function listPipelineStages(): Promise<PipelineStageOption[]> {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("pipeline_stages")
    .select("id, name, position")
    .eq("organization_id", organizationId)
    .order("position", { ascending: true });
  return (data ?? []) as PipelineStageOption[];
}

export async function createCaptureSource(formData: FormData): Promise<{ id: string }> {
  const { organizationId, role } = await requireProfile();
  assertCanManage(role);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Dê um nome para identificar a fonte (ex.: Site, Landing Black Friday)");

  const stageIdRaw = String(formData.get("stage_id") ?? "").trim();
  const supabase = createClient();

  let stageId: string | null = null;
  if (stageIdRaw) {
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", stageIdRaw)
      .maybeSingle();
    if (!stage) throw new Error("Etapa do funil inválida");
    stageId = String(stage.id);
  }

  // Token opaco com 24 caracteres: cabe em URL e não é adivinhável.
  let created: { id: string } | null = null;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const token = randomBytes(18).toString("base64url");
    const { data, error } = await supabase
      .from("lead_capture_sources")
      .insert({
        organization_id: organizationId,
        name,
        token,
        stage_id: stageId,
      })
      .select("id")
      .single();

    if (!error && data) created = { id: String(data.id) };
    else {
      lastError = error?.message ?? "Falha ao criar a fonte";
      // 23505 = colisão de token; tenta de novo com outro token.
      if (error?.code !== "23505") break;
    }
  }

  if (!created) throw new Error(lastError ?? "Falha ao criar a fonte");
  revalidatePath("/configuracoes");
  return created;
}

export async function toggleCaptureSource(id: string, active: boolean): Promise<void> {
  const { organizationId, role } = await requireProfile();
  assertCanManage(role);
  const supabase = createClient();
  const { error } = await supabase
    .from("lead_capture_sources")
    .update({ is_active: active })
    .eq("organization_id", organizationId)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/configuracoes");
}

export async function deleteCaptureSource(id: string): Promise<void> {
  const { organizationId, role } = await requireProfile();
  assertCanManage(role);
  const supabase = createClient();
  const { error } = await supabase
    .from("lead_capture_sources")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/configuracoes");
}
