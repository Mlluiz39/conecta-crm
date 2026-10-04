"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { AppointmentStatus } from "@/types/domain";

export async function createAppointment(formData: FormData) {
  const { organizationId, id: userId } = await requireProfile();
  const supabase = createClient();

  const startsAt = String(formData.get("starts_at"));
  const durationMin = Number(formData.get("duration") ?? 30);
  const starts = new Date(startsAt);
  if (Number.isNaN(starts.getTime())) throw new Error("Data/hora inválida");
  const ends = new Date(starts.getTime() + durationMin * 60_000);

  const contactId = String(formData.get("contact_id") ?? "").trim();
  // Se não foi selecionado um contato existente, busca ou cria um provisório
  let resolvedContactId = contactId;
  if (!resolvedContactId) {
    const { data: firstContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .limit(1)
      .maybeSingle();
    resolvedContactId = firstContact?.id;
  }

  if (!resolvedContactId) {
    // Cria um contato genérico se nenhum existir
    const { data: newC } = await supabase
      .from("contacts")
      .insert({ organization_id: organizationId, name: "Cliente Agendamento" })
      .select("id")
      .single();
    resolvedContactId = newC!.id;
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      organization_id: organizationId,
      contact_id: resolvedContactId,
      assigned_to: userId,
      created_by_user: userId,
      title: String(formData.get("title") ?? "Compromisso"),
      description: String(formData.get("description") ?? "") || null,
      location: String(formData.get("location") ?? "") || String(formData.get("meet_link") ?? "") || null,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      status: "confirmado" as AppointmentStatus,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // Agenda lembrete de 24h e 1h antes em appointment_reminders
  const startsMs = starts.getTime();
  const reminders = [
    { offset: 1440, sendAt: new Date(startsMs - 1440 * 60_000).toISOString() },
    { offset: 60, sendAt: new Date(startsMs - 60 * 60_000).toISOString() },
  ];

  for (const r of reminders) {
    await supabase.from("appointment_reminders").insert({
      organization_id: organizationId,
      appointment_id: data.id,
      offset_minutes: r.offset,
      send_at: r.sendAt,
    });
  }

  revalidatePath("/calendario");
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  const { organizationId } = await requireProfile();
  const supabase = createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/calendario");
}

export async function deleteAppointment(id: string) {
  const { organizationId, role } = await requireProfile();
  if (role === "atendente") throw new Error("Sem permissão");
  const supabase = createClient();
  await supabase.from("appointments").delete().eq("organization_id", organizationId).eq("id", id);
  revalidatePath("/calendario");
}
