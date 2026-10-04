import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { getAppointments, getGoogleIntegration, getReminderRules } from "@/lib/data/calendar";
import { PageHeader, Card, Badge } from "@/components/ui/primitives";
import { CalendarView } from "@/components/calendar/CalendarView";

export const revalidate = 15;

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: { google?: string };
}) {
  const { organizationId } = await requireProfile();
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

  const [appointments, integration, rules, orgRes] = await Promise.all([
    getAppointments(rangeStart, rangeEnd),
    getGoogleIntegration(),
    getReminderRules(),
    createClient().from("organizations").select("name").eq("id", organizationId).single(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendário"
        subtitle="Visitas e reuniões — agendadas manualmente ou pelo agente de IA"
      />

      <CalendarView
        appointments={appointments as any}
        organizationName={orgRes.data?.name ?? "Sua empresa"}
        googleStatus={integration?.status ?? null}
        flash={searchParams.google}
      />

      <Card>
        <h2 className="mb-3 text-sm font-bold">Lembretes automáticos via WhatsApp</h2>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma regra configurada.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                <span className="font-semibold">{r.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {r.offset_minutes >= 60 ? `${r.offset_minutes / 60}h antes` : `${r.offset_minutes}min antes`} · WhatsApp
                  </span>
                  <Badge className={r.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}>
                    {r.is_active ? "ativo" : "inativo"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Os lembretes são disparados automaticamente por cron a cada 10 minutos conforme agendado em <code>appointment_reminders</code>.
        </p>
      </Card>
    </div>
  );
}
