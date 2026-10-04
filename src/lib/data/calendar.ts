import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export async function getAppointments(rangeStartISO: string, rangeEndISO: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("appointments")
    .select(
      "id, title, description, type, channel, location, meet_link, starts_at, ends_at, status, sync_status, contact:contacts(id, name, phone)",
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
  const { data } = await supabase
    .from("reminder_rules")
    .select("id, name, offset_minutes, channel, is_active")
    .eq("organization_id", organizationId)
    .order("offset_minutes");
  return data ?? [];
}

export async function getGoogleIntegration() {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("integrations")
    .select("status, expires_at")
    .eq("organization_id", organizationId)
    .eq("provider", "google_calendar")
    .maybeSingle();
  return data;
}
