import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export async function getAppointments(rangeStartISO: string, rangeEndISO: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("appointments")
    .select(
      "id, title, description, location, starts_at, ends_at, status, google_event_id, contact:contacts(id, name, phone)",
    )
    .eq("organization_id", organizationId)
    .gte("starts_at", rangeStartISO)
    .lte("starts_at", rangeEndISO)
    .order("starts_at");
  return data ?? [];
}

export async function getReminderRules() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  // Busca templates associados ou regras padrão
  const { data } = await supabase
    .from("whatsapp_templates")
    .select("id, name, category, status")
    .eq("organization_id", organizationId)
    .eq("category", "utilidade");
  return data ?? [];
}

export async function getGoogleIntegration() {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("google_calendar_connections")
    .select("id, google_email, calendar_id, created_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? { status: "connected", email: data.google_email } : null;
}
