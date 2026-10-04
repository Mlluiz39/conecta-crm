"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarPlus, CheckCircle2 } from "lucide-react";
import { updateAppointmentStatus } from "@/lib/data/calendar-actions";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/types/domain";
import { APPOINTMENT_STATUS_LABEL } from "@/types/domain";

type Appt = {
  id: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  google_event_id: string | null;
  contact: { id: string; name: string; phone: string | null } | null;
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

export function CalendarView({
  appointments,
  organizationName,
  googleStatus,
  flash,
}: {
  appointments: Appt[];
  organizationName: string;
  googleStatus: string | null;
  flash?: string | null;
}) {
  const [view, setView] = useState<"mes" | "semana" | "dia">("mes");
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string>(ymd(new Date()));
  const [modalOpen, setModalOpen] = useState(false);

  const byDay = useMemo(() => {
    const map = new Map<string, Appt[]>();
    for (const a of appointments) {
      const key = ymd(new Date(a.starts_at));
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return map;
  }, [appointments]);

  function shift(delta: number) {
    const d = new Date(cursor);
    if (view === "mes") d.setMonth(d.getMonth() + delta);
    else if (view === "semana") d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    setCursor(d);
  }

  const title =
    view === "mes"
      ? cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      : view === "semana"
        ? `Semana de ${startOfWeek(cursor).toLocaleDateString("pt-BR")}`
        : cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="rounded-lg border p-1.5 hover:bg-accent">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-52 text-center text-sm font-bold capitalize">{title}</span>
          <button onClick={() => shift(1)} className="rounded-lg border p-1.5 hover:bg-accent">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => setCursor(new Date())} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent">
            Hoje
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border p-0.5 text-xs font-semibold">
            {(["mes", "semana", "dia"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn("rounded-lg px-2.5 py-1 capitalize", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {v}
              </button>
            ))}
          </div>
          <a
            href="/api/integrations/google/connect"
            className={cn(
              "rounded-xl border px-3 py-1.5 text-xs font-semibold",
              googleStatus === "connected" ? "border-emerald-300 text-emerald-700" : "hover:bg-accent",
            )}
          >
            {googleStatus === "connected" ? "✓ Google conectado" : "Conectar Google Calendar"}
          </a>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
          >
            <CalendarPlus size={14} /> Novo
          </button>
        </div>
      </div>

      {flash === "conectado" && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          Google Calendar conectado com sucesso. Novos agendamentos serão sincronizados.
        </p>
      )}

      {view === "mes" && (
        <Card className="p-0">
          <div className="grid grid-cols-7 border-b text-center text-xs font-semibold text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthGrid(cursor).map((day) => {
              const key = ymd(day);
              const items = byDay.get(key) ?? [];
              const isCurrentMonth = day.getMonth() === cursor.getMonth();
              const isToday = key === ymd(new Date());
              return (
                <button
                  key={key}
                  onClick={() => { setSelectedDay(key); setView("dia"); setCursor(day); }}
                  className={cn(
                    "min-h-24 border-b border-r p-1.5 text-left align-top transition-colors hover:bg-muted/40",
                    !isCurrentMonth && "bg-muted/20 text-muted-foreground",
                  )}
                >
                  <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold", isToday && "bg-primary text-primary-foreground")}>
                    {day.getDate()}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {items.slice(0, 3).map((a) => (
                      <div key={a.id} className="truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">
                        {hhmm(a.starts_at)} {a.title}
                      </div>
                    ))}
                    {items.length > 3 && <div className="text-[10px] text-muted-foreground">+{items.length - 3}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {view === "semana" && (
        <Card className="p-0">
          <div className="grid grid-cols-7 border-b text-center text-xs font-semibold">
            {weekDays(cursor).map((d) => (
              <div key={ymd(d)} className={cn("py-2", ymd(d) === ymd(new Date()) && "text-primary")}>
                {WEEKDAYS[d.getDay()]} {d.getDate()}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {weekDays(cursor).map((d) => {
              const items = byDay.get(ymd(d)) ?? [];
              return (
                <div key={ymd(d)} className="min-h-72 space-y-1 border-r p-1.5">
                  {items.map((a) => (
                    <div key={a.id} className="rounded-lg border bg-card p-1.5 text-[11px]">
                      <p className="font-semibold">{hhmm(a.starts_at)}</p>
                      <p className="truncate">{a.title}</p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {view === "dia" && (
        <DayList day={selectedDay} items={byDay.get(selectedDay) ?? []} organizationName={organizationName} />
      )}

      {modalOpen && <AppointmentModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function DayList({ day, items, organizationName }: { day: string; items: Appt[]; organizationName: string }) {
  return (
    <Card>
      <p className="mb-3 text-sm font-bold">
        {new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })} · {organizationName}
      </p>
      {items.length === 0 ? (
        <EmptyState label="Nenhum compromisso neste dia." />
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{hhmm(a.starts_at)}–{hhmm(a.ends_at)}</span>
                  <span className="text-sm font-semibold">{a.title}</span>
                  {a.google_event_id && (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Google</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {a.contact?.name ?? "Sem contato"} · {a.location || "Presencial"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-muted text-muted-foreground">
                  {APPOINTMENT_STATUS_LABEL[a.status] ?? a.status}
                </Badge>
                {a.status !== "confirmado" && a.status !== "realizado" && (
                  <button
                    onClick={() => void updateAppointmentStatus(a.id, "confirmado")}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white"
                  >
                    <CheckCircle2 size={12} /> Confirmar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AppointmentModal({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl">
        <h3 className="mb-4 text-base font-bold">Novo compromisso</h3>
        <form
          action={async (fd) => {
            setBusy(true);
            try {
              const { createAppointment } = await import("@/lib/data/calendar-actions");
              await createAppointment(fd);
              onClose();
              location.reload();
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-3"
        >
          <input name="title" required placeholder="Título (ex: Visita ao decorado)" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input name="starts_at" type="datetime-local" required className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
            <input name="duration" type="number" defaultValue={30} min={15} step={15} className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
          </div>
          <input name="location" placeholder="Local ou Link do Google Meet" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
          <textarea name="description" rows={2} placeholder="Observações (opcional)" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent">
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {busy ? "Salvando..." : "Agendar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function monthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
function weekDays(cursor: Date): Date[] {
  const start = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}
