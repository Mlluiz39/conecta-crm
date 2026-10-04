import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/domain";

export type SessionProfile = {
  id: string;
  organizationId: string;
  role: UserRole;
  fullName: string;
  email: string | null;
};

/**
 * Sessão + membro da organização do usuário logado.
 * No novo schema, os membros ficam em `organization_members`.
 */
export async function requireProfile(): Promise<SessionProfile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Busca a primeira organização ativa do usuário
  let { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role, full_name")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  // Caso o usuário ainda não pertença a nenhuma organização (novo cadastro sem convite):
  // Se for o primeiro usuário, associa à primeira organização existente ou cria uma.
  if (!member) {
    const admin = createAdminClient();
    const { data: orgs } = await admin
      .from("organizations")
      .select("id")
      .order("created_at")
      .limit(1);

    if (orgs && orgs.length > 0) {
      const orgId = orgs[0].id;
      // Insere como admin se for a única conta ou atendente
      const { data: totalMembers } = await admin
        .from("organization_members")
        .select("user_id", { count: "exact", head: true })
        .eq("organization_id", orgId);

      const assignedRole: UserRole = (totalMembers ?? 0) === 0 ? "admin" : "atendente";
      const { data: newMember } = await admin
        .from("organization_members")
        .insert({
          organization_id: orgId,
          user_id: user.id,
          role: assignedRole,
          full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário",
          is_active: true,
        })
        .select("organization_id, role, full_name")
        .single();
      member = newMember;
    }
  }

  if (!member) redirect("/login");

  return {
    id: user.id,
    organizationId: member.organization_id,
    role: member.role as UserRole,
    fullName: member.full_name || user.email?.split("@")[0] || "",
    email: user.email ?? null,
  };
}
