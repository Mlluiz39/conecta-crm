"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, CheckCheck, Clock, MessageSquareReply, Radio } from "lucide-react";

type LiveItem = {
  messageId: string;
  contactName: string;
  contactPhone: string | null;
  channelType: string;
  status: string;
  content: string;
  createdAt: string;
  replied: boolean;
  queued: boolean;
};

type LiveResponse = {
  generatedAt: string;
  summary: { queued: number; sentToday: number; replied: number; waiting: number };
  items: LiveItem[];
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/**
 * Painel ao vivo: mostra quem a IA está prospectando agora — o que está na fila,
 * o que já saiu e quem respondeu. Atualiza sozinho a cada 4s.
 */
export function LiveProspectingPanel() {
  const [data, setData] = useState<LiveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/prospecting/live", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as LiveResponse;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }

    void load();
    const id = setInterval(() => {
      void load();
      setTick((t) => t + 1);
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const summary = data?.summary;

  return (
    <div className="rounded-2xl border-2 border-primary/25 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Activity size={15} className="text-primary" />
            IA prospectando agora
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
            tempo real · {tick % 2 === 0 ? "4s" : "4s"}
          </span>
        </div>

        {summary && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1 text-amber-600">
              <Clock size={12} /> {summary.queued} na fila
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Radio size={12} /> {summary.sentToday} hoje
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <MessageSquareReply size={12} /> {summary.replied} responderam
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <CheckCheck size={12} /> {summary.waiting} aguardando
            </span>
          </div>
        )}
      </div>

      <div className="p-3">
        {error && <p className="px-1 text-xs text-destructive">Não foi possível carregar: {error}</p>}

        {!error && (!data || data.items.length === 0) && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            Nada em prospecção nos últimos 3 dias. Selecione leads e clique em{" "}
            <strong>“Agente prospecta”</strong> — o que a IA enviar aparece aqui ao vivo.
          </p>
        )}

        {data && data.items.length > 0 && (
          <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {data.items.map((item) => (
              <li
                key={item.messageId}
                className={`flex gap-3 rounded-xl border p-3 ${
                  item.queued
                    ? "border-amber-500/40 bg-amber-500/5"
                    : item.replied
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "bg-background"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    item.replied
                      ? "bg-emerald-500/15 text-emerald-600"
                      : item.queued
                        ? "bg-amber-500/15 text-amber-600"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {initials(item.contactName)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{item.contactName}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>

                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        item.replied
                          ? "bg-emerald-500/15 text-emerald-600"
                          : item.queued
                            ? "bg-amber-500/15 text-amber-700"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {item.replied
                        ? "respondeu"
                        : item.queued
                          ? "na fila"
                          : item.status === "falhou"
                            ? "falhou"
                            : "enviada"}
                    </span>
                    <span className="text-[10px] uppercase text-muted-foreground">
                      {item.channelType}
                    </span>
                    {item.contactPhone && (
                      <span className="truncate text-[10px] text-muted-foreground">
                        {item.contactPhone}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.content}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
          <span>Mostrando as 20 abordagens mais recentes do agente.</span>
          <Link href="/conversas" className="underline">
            abrir conversas
          </Link>
        </div>
      </div>
    </div>
  );
}
