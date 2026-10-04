import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionProfile = {
  id: string;
  organizationId: string;
  role: "admin" | "gerente" | "atendente";
  fullName: string;
  email: string | null;
};

/**
 * Sessão + perfil do usuário logado. Redireciona p/ /login se não houver
 * sessão ou se o perfil (criado pelo trigger) ainda não existir.
 */
export async function requireProfile(): Promise<SessionProfile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, role, full_name, email")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  return {
    id: profile.id,
    organizationId: profile.organization_id,
    role: profile.role,
    fullName: profile.full_name,
    email: profile.email,
  };
}
