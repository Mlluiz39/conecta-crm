import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Materializa os lembretes de um agendamento a partir das regras ativas
 * (offset em minutos, negativo = antes). Idempotente por unique
 * (appointment_id, reminder_rule_id).
 */
export async function materializeReminders(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<number> {
  const { data: appt } = await supabase
    .from("appointments")
    .select("id, organization_id, starts_at, type")
    .eq("id", appointmentId)
    .single();
  if (!appt) return 0;

  const { data: rules } = await supabase
    .from("reminder_rules")
    .select("id, offset_minutes, applies_to")
    .eq("organization_id", appt.organization_id)
    .eq("is_active", true);

  const starts = new Date(appt.starts_at).getTime();
  const rows = (rules ?? [])
    .filter((r: any) => !r.applies_to || r.applies_to === appt.type)
    .map((r: any) => ({
      organization_id: appt.organization_id,
      appointment_id: appt.id,
      reminder_rule_id: r.id,
      scheduled_at: new Date(starts + r.offset_minutes * 60_000).toISOString(),
    }));
  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from("appointment_reminders")
    .upsert(rows, { onConflict: "appointment_id,reminder_rule_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return rows.length;
}

/** Dispara lembretes vencidos: enfileira no WhatsApp e marca como enviado. */
export async function dispatchDueReminders(supabase: SupabaseClient, limit = 50): Promise<number> {
  const { data: due } = await supabase
    .from("appointment_reminders")
    .select(
      "id, organization_id, appointment:appointments(id, title, starts_at, contact:contacts(phone, name))",
    )
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at")
    .limit(limit);

  let sent = 0;
  for (const r of due ?? []) {
    const appt = (r as any).appointment;
    const phone = appt?.contact?.phone;
    if (phone) {
      const text = `Olá ${appt.contact.name ?? ""}! Lembrete do seu compromisso "${appt.title}" em ${new Date(
        appt.starts_at,
      ).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Confirma presença?`;
      await supabase.from("message_outbox").insert({
        organization_id: r.organization_id,
        conversation_id: null,
        payload: { to: phone, text, reminder_id: r.id },
      });
    }
    await supabase
      .from("appointment_reminders")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", r.id);
    sent++;
  }
  return sent;
}
