import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
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

const getCachedOrgMember = unstable_cache(
  async (userId: string) => {
    const admin = createAdminClient();
    const { data: member } = await admin
      .from("organization_members")
      .select("organization_id, role, full_name")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    return member;
  },
  ["active-user-org-member"],
  { revalidate: 60, tags: ["org-member"] },
);

/**
 * Sessão + membro da organização do usuário logado.
 * Otimizado: lê usuário validado pelo middleware (sem re-request de auth)
 * e faz cache de 60s do perfil da organização.
 */
export const requireProfile = cache(async (): Promise<SessionProfile> => {
  let userId: string | null = null;
  let userEmail: string | null = null;
  let userName: string | null = null;

  try {
    const reqHeaders = headers();
    userId = reqHeaders.get("x-user-id");
    userEmail = reqHeaders.get("x-user-email");
    const rawName = reqHeaders.get("x-user-name");
    userName = rawName ? decodeURIComponent(rawName) : null;
  } catch {
    // Fora de contexto de request HTTP direto
  }

  if (!userId) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");
    userId = user.id;
    userEmail = user.email ?? null;
    userName = user.user_metadata?.full_name || user.email?.split("@")[0] || "";
  }

  // Busca a organização do usuário (em cache por 60s)
  let member = await getCachedOrgMember(userId);

  if (!member) {
    const admin = createAdminClient();
    const { data: orgs } = await admin
      .from("organizations")
      .select("id")
      .order("created_at")
      .limit(1);

    if (orgs && orgs.length > 0) {
      const orgId = orgs[0].id;
      const { data: totalMembers } = await admin
        .from("organization_members")
        .select("user_id", { count: "exact", head: true })
        .eq("organization_id", orgId);

      const assignedRole: UserRole = (totalMembers ?? 0) === 0 ? "admin" : "atendente";
      const { data: newMember } = await admin
        .from("organization_members")
        .insert({
          organization_id: orgId,
          user_id: userId,
          role: assignedRole,
          full_name: userName || "Usuário",
          is_active: true,
        })
        .select("organization_id, role, full_name")
        .single();
      member = newMember;
    }
  }

  if (!member) redirect("/login");

  return {
    id: userId,
    organizationId: member.organization_id,
    role: member.role as UserRole,
    fullName: member.full_name || userName || "",
    email: userEmail ?? null,
  };
});
