"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth/session";
import { materializeReminders } from "@/services/calendar/reminders";
import { syncEventToGoogle } from "@/services/calendar/google";

export async function createAppointment(formData: FormData) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();

  const startsAt = String(formData.get("starts_at"));
  const durationMin = Number(formData.get("duration") ?? 30);
  const starts = new Date(startsAt);
  if (Number.isNaN(starts.getTime())) throw new Error("Data/hora inválida");
  const ends = new Date(starts.getTime() + durationMin * 60_000);

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      organization_id: organizationId,
      contact_id: String(formData.get("contact_id") ?? "") || null,
      assigned_to: userId,
      title: String(formData.get("title") ?? "Compromisso"),
      description: String(formData.get("description") ?? "") || null,
      type: String(formData.get("type") ?? "demo") as any,
      channel: String(formData.get("channel") ?? "presencial") as any,
      location: String(formData.get("location") ?? "") || null,
      meet_link: String(formData.get("meet_link") ?? "") || null,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      status: "confirmada",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Materializa lembretes e tenta sincronizar com o Google Calendar.
  await materializeReminders(supabase, data.id).catch(() => null);
  await syncEventToGoogle(organizationId, data.id).catch(() => null);

  revalidatePath("/calendario");
}

export async function updateAppointmentStatus(id: string, status: string) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status: status as any })
    .eq("organization_id", organizationId)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/calendario");
}

export async function deleteAppointment(id: string) {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Sem permissão");
  const admin = createAdminClient();
  await admin.from("appointments").delete().eq("organization_id", organizationId).eq("id", id);
  revalidatePath("/calendario");
}
