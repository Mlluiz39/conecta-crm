import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMessageProvider } from "@/services/messaging";

/**
 * Materializa lembretes padrão (24h e 1h antes) para o agendamento
 */
export async function materializeReminders(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<number> {
  const { data: appt } = await supabase
    .from("appointments")
    .select("id, organization_id, starts_at")
    .eq("id", appointmentId)
    .single();
  if (!appt) return 0;

  const starts = new Date(appt.starts_at).getTime();
  const rows = [
    {
      organization_id: appt.organization_id,
      appointment_id: appt.id,
      offset_minutes: 1440,
      send_at: new Date(starts - 1440 * 60_000).toISOString(),
    },
    {
      organization_id: appt.organization_id,
      appointment_id: appt.id,
      offset_minutes: 60,
      send_at: new Date(starts - 60 * 60_000).toISOString(),
    },
  ];

  const { error } = await supabase.from("appointment_reminders").insert(rows);
  if (error) {
    console.error("Erro ao materializar lembretes:", error);
    return 0;
  }
  return rows.length;
}

/** Dispara lembretes vencidos: envia WhatsApp pelo provider e marca sent_at */
export async function dispatchDueReminders(supabase: SupabaseClient, limit = 50): Promise<number> {
  const provider = getMessageProvider();
  const { data: due } = await supabase
    .from("appointment_reminders")
    .select(
      "id, organization_id, appointment:appointments(id, title, starts_at, contact:contacts(phone, name))",
    )
    .is("sent_at", null)
    .lte("send_at", new Date().toISOString())
    .order("send_at")
    .limit(limit);

  let sent = 0;
  for (const r of due ?? []) {
    const appt = (r as any).appointment;
    const phone = appt?.contact?.phone;
    if (phone) {
      const text = `Olá ${appt.contact.name ?? ""}! Lembrete do seu compromisso "${appt.title}" agendado para ${new Date(
        appt.starts_at,
      ).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Confirma sua presença?`;

      await provider.sendText("default", phone, text).catch(() => null);
    }
    await supabase
      .from("appointment_reminders")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", r.id);
    sent++;
  }
  return sent;
}
