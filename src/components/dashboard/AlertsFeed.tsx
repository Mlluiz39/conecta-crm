"use client";

import { useEffect, useState } from "react";
import { pollFetch, startPolling } from "@/lib/client/poll";
import Link from "next/link";
import { Bell, Flame, MessageSquareReply, CalendarCheck, Send, Phone, Handshake, DollarSign } from "lucide-react";

type Alert = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
  notifiedAt: string | null;
  contactId: string | null;
  conversationId: string | null;
};

const ICONS: Record<string, typeof Bell> = {
  lead_contatado: Send,
  lead_respondeu: MessageSquareReply,
  em_prospeccao: Handshake,
  quer_orcamento: DollarSign,
  quer_call: Phone,
  quer_fechar: Flame,
  lead_quente: Flame,
  call_marcada: CalendarCheck,
};

const COLORS: Record<string, string> = {
  lead_contatado: "text-muted-foreground",
  lead_respondeu: "text-emerald-600",
  em_prospeccao: "text-emerald-600",
  quer_orcamento: "text-amber-600",
  quer_call: "text-indigo-600",
  quer_fechar: "text-rose-600",
  lead_quente: "text-rose-600",
  call_marcada: "text-indigo-600",
};

function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

/** Últimos alertas (os mesmos que vão para o Telegram). */
export function AlertsFeed() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let cancelled = false;
    const stop = startPolling(async (signal) => {
      const res = await pollFetch("/api/alerts/recent", signal);
      if (!res.ok) return;
      const json = (await res.json()) as { alerts: Alert[] };
      if (!cancelled) setAlerts(json.alerts ?? []);
    }, 15_000);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Bell size={15} className="text-primary" />
          Alertas em tempo real
        </h2>
        <span className="text-[11px] text-muted-foreground">
          enviados para o Telegram · atualiza a cada 15s
        </span>
      </div>

      <div className="p-3">
        {alerts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum alerta ainda. Quando um lead for contatado, responder ou quiser fechar, aparece aqui e no
            Telegram.
          </p>
        ) : (
          <ul className="divide-y">
            {alerts.map((a) => {
              const Icon = ICONS[a.type] ?? Bell;
              return (
                <li key={a.id} className="flex items-start gap-3 py-2.5">
                  <Icon size={15} className={`mt-0.5 shrink-0 ${COLORS[a.type] ?? ""}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.title}</p>
                    {a.body && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-muted-foreground">{timeAgo(a.createdAt)}</p>
                    {a.conversationId && (
                      <Link
                        href={`/conversas?c=${a.conversationId}`}
                        className="text-[10px] underline text-muted-foreground"
                      >
                        ver
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
