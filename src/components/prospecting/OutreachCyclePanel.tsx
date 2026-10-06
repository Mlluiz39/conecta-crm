"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarClock, PlayCircle, ShieldCheck } from "lucide-react";
import { runOutreachNow } from "@/lib/data/actions";
import { useNotify } from "@/components/ui/dialog-provider";

export type OutreachStatusView = {
  pendentes: number;
  agendados: number;
  enviadosHoje: number;
  falhas: number;
  tetoHoje: number;
  proximoEnvio: string | null;
  dentroDaJanela: boolean;
  janela: { inicio: number; fim: number };
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Situação do ciclo de disparo: janela, teto diário, o que está agendado e o
 * próximo envio. Botão para rodar um ciclo na hora (respeitando janela/teto).
 */
export function OutreachCyclePanel({ initial }: { initial: OutreachStatusView }) {
  // estado do servidor + resultado imediato do último ciclo (não fica preso num snapshot)
  const [rodada, setRodada] = useState<OutreachStatusView | null>(null);
  const status = rodada ?? initial;
  useEffect(() => setRodada(null), [initial]);
  const [pending, startTransition] = useTransition();
  const notify = useNotify();

  function runNow() {
    startTransition(async () => {
      try {
        const r = await runOutreachNow();
        setRodada(r.status);
        notify(
          r.ran
            ? `Ciclo: ${r.sent} enviado(s)${r.scheduled ? ` · ${r.scheduled} agendado(s)` : ""}`
            : r.reason ?? "nada a enviar agora",
          r.ran ? "success" : "error",
        );
      } catch (e) {
        notify((e as Error).message.replace(/^Error:\s*/, ""), "error");
      }
    });
  }

  const pct = Math.min(100, Math.round((status.enviadosHoje / Math.max(1, status.tetoHoje)) * 100));

  return (
    <div className="space-y-2 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-primary" />
        <h2 className="text-sm font-bold">Ciclo de disparo (anti-ban)</h2>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            status.dentroDaJanela
              ? "bg-emerald-500/15 text-emerald-600"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {status.dentroDaJanela ? "dentro da janela" : "fora da janela"}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        {status.janela.inicio}h–{status.janela.fim}h · até <strong>{status.tetoHoje}</strong> leads por dia ·
        intervalos variados. Telefone → WhatsApp; só e-mail → e-mail. O texto segue o prompt mestre e a
        skill de vendedor.
      </p>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">enviados hoje</span>
          <span className="font-semibold">
            {status.enviadosHoje}/{status.tetoHoje}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl border bg-background px-2 py-1.5">
          <p className="font-bold">{status.pendentes}</p>
          <p className="text-[10px] text-muted-foreground">na fila</p>
        </div>
        <div className="rounded-xl border bg-background px-2 py-1.5">
          <p className="font-bold">{status.agendados}</p>
          <p className="text-[10px] text-muted-foreground">agendados</p>
        </div>
        <div className="rounded-xl border bg-background px-2 py-1.5">
          <p className={`font-bold ${status.falhas > 0 ? "text-destructive" : ""}`}>{status.falhas}</p>
          <p className="text-[10px] text-muted-foreground">falhas</p>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock size={12} /> próximo envio: <strong>{fmt(status.proximoEnvio)}</strong>
      </p>

      <button
        type="button"
        onClick={runNow}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold hover:bg-accent disabled:opacity-50"
      >
        <PlayCircle size={14} />
        {pending ? "rodando ciclo..." : "rodar ciclo agora"}
      </button>
    </div>
  );
}
