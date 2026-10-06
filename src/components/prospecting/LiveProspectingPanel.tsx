"use client";

import { useEffect, useState } from "react";
import { pollFetch, startPolling } from "@/lib/client/poll";
import Link from "next/link";
import {
  Activity,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Mail,
  MessageSquare,
  MessageSquareReply,
  Phone,
  Radio,
  Snowflake,
  Sun,
  X,
} from "lucide-react";

type LiveItem = {
  messageId: string;
  conversationId: string;
  contactId: string | null;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  channelType: string;
  status: string;
  content: string;
  subject: string | null;
  createdAt: string;
  replied: boolean;
  repliedAt: string | null;
  queued: boolean;
  manual: boolean;
  outsideWindow: boolean;
  temperature: string | null;
  opportunityValue: number | null;
  threadMessages: number;
  threadLastAt: string | null;
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

function fullTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(item: LiveItem): { label: string; className: string } {
  if (item.replied) return { label: "respondeu", className: "bg-emerald-500/15 text-emerald-600" };
  if (item.queued) return { label: "na fila", className: "bg-amber-500/15 text-amber-700" };
  if (item.status === "falhou") return { label: "falhou", className: "bg-destructive/15 text-destructive" };
  return { label: "enviada", className: "bg-muted text-muted-foreground" };
}

const TEMPERATURE_INFO: Record<string, { label: string; Icon: typeof Flame }> = {
  frio: { label: "Lead frio", Icon: Snowflake },
  morno: { label: "Lead morno", Icon: Sun },
  quente: { label: "Lead quente", Icon: Flame },
};

/**
 * Painel ao vivo: mostra quem a IA está prospectando agora. Cada card abre um
 * popup com os detalhes (contato, canal, temperatura, valor, thread, texto).
 */
export function LiveProspectingPanel() {
  const [data, setData] = useState<LiveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LiveItem | null>(null);

  useEffect(() => {
    let cancelled = false;

    // sem sobreposição de requisições: se uma rodada demora, a próxima espera
    const stop = startPolling(async (signal) => {
      const res = await pollFetch("/api/prospecting/live", signal);
      if (!res.ok) return;
      const json = (await res.json()) as LiveResponse;
      if (!cancelled) {
        setData(json);
        setError(null);
        // mantém o popup aberto com os dados atualizados
        setSelected((prev) =>
          prev ? (json.items.find((i) => i.messageId === prev.messageId) ?? prev) : null,
        );
      }
    }, 6000);

    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const summary = data?.summary;
  const selectedStatus = selected ? statusLabel(selected) : null;

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
          <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground sm:inline">
            tempo real · clique para detalhes
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
            {data.items.map((item) => {
              const st = statusLabel(item);
              return (
                <li key={item.messageId}>
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    title="Clique para ver os detalhes"
                    className={`flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 ${
                      item.queued
                        ? "border-amber-500/40 bg-amber-500/5"
                        : item.replied
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "bg-background"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        item.replied
                          ? "bg-emerald-500/15 text-emerald-600"
                          : item.queued
                            ? "bg-amber-500/15 text-amber-600"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {initials(item.contactName)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{item.contactName}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {timeAgo(item.createdAt)}
                        </span>
                      </span>

                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${st.className}`}>
                          {st.label}
                        </span>
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {item.channelType}
                        </span>
                        {item.contactPhone && (
                          <span className="truncate text-[10px] text-muted-foreground">
                            {item.contactPhone}
                          </span>
                        )}
                        {item.outsideWindow && (
                          <span
                            title="Disparo feito fora da janela 9h–18h"
                            className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                          >
                            <CheckCircle2 size={10} /> fora do horário
                          </span>
                        )}
                      </span>

                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {item.content.replace(/^Assunto:\s*(.+)$/m, "$1:").trim()}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
          <span>Mostrando as 20 abordagens mais recentes do agente.</span>
          <Link href="/conversas" className="underline">
            abrir conversas
          </Link>
        </div>
      </div>

      {/* Popup de detalhes */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b p-5">
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    selected.replied
                      ? "bg-emerald-500/15 text-emerald-600"
                      : selected.queued
                        ? "bg-amber-500/15 text-amber-600"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {initials(selected.contactName)}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold">{selected.contactName}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {selectedStatus && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${selectedStatus.className}`}
                      >
                        {selectedStatus.label}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {selected.channelType === "email" ? <Mail size={10} /> : <MessageSquare size={10} />}
                      {selected.channelType}
                    </span>
                    {selected.temperature && TEMPERATURE_INFO[selected.temperature] && (
                      <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {(() => {
                          const Icon = TEMPERATURE_INFO[selected.temperature].Icon;
                          return <Icon size={10} />;
                        })()}
                        {TEMPERATURE_INFO[selected.temperature].label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Fechar"
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {/* Dados do lead */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-background p-3">
                  <p className="text-[11px] font-bold uppercase text-muted-foreground">Contato</p>
                  <div className="mt-1.5 space-y-1 text-sm">
                    {selected.contactPhone && (
                      <p className="inline-flex items-center gap-1.5">
                        <Phone size={12} className="text-muted-foreground" /> {selected.contactPhone}
                      </p>
                    )}
                    {selected.contactEmail && (
                      <p className="inline-flex items-center gap-1.5 break-all">
                        <Mail size={12} className="text-muted-foreground" /> {selected.contactEmail}
                      </p>
                    )}
                    {!selected.contactPhone && !selected.contactEmail && (
                      <p className="text-muted-foreground">sem telefone/e-mail cadastrado</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-3">
                  <p className="text-[11px] font-bold uppercase text-muted-foreground">Prospecção</p>
                  <div className="mt-1.5 space-y-1 text-sm">
                    <p>
                      Enviada em <strong>{fullTime(selected.createdAt)}</strong>
                    </p>
                    <p>
                      Resposta:{" "}
                      <strong className={selected.replied ? "text-emerald-600" : ""}>
                        {selected.replied ? fullTime(selected.repliedAt) : "ainda não respondeu"}
                      </strong>
                    </p>
                    <p className="text-muted-foreground">
                      {selected.threadMessages} mensagem(ns) nesta conversa
                      {selected.threadLastAt ? ` · última ${fullTime(selected.threadLastAt)}` : ""}
                    </p>
                    {selected.outsideWindow && (
                      <p className="inline-flex items-center gap-1 text-amber-700">
                        <CheckCircle2 size={12} />
                        disparo fora do horário (9h–18h)
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-background p-3">
                  <p className="text-[11px] font-bold uppercase text-muted-foreground">
                    Valor da oportunidade
                  </p>
                  <p className="mt-1 text-sm font-semibold text-emerald-600">
                    {selected.opportunityValue
                      ? selected.opportunityValue.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })
                      : "não informado"}
                  </p>
                </div>
                <div className="rounded-xl border bg-background p-3">
                  <p className="text-[11px] font-bold uppercase text-muted-foreground">
                    Status da mensagem
                  </p>
                  <p className="mt-1 text-sm font-semibold">{selectedStatus?.label ?? selected.status}</p>
                </div>
              </div>

              {/* Mensagem completa */}
              <div className="rounded-xl border bg-background p-3">
                <p className="mb-1.5 text-[11px] font-bold uppercase text-muted-foreground">
                  Abordagem enviada pelo agente
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {selected.content.replace(/^Assunto:\s*(.+)$/m, "").trim()}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/30 px-5 py-3">
              {selected.contactId && (
                <Link
                  href={`/contatos/${selected.contactId}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border bg-background px-4 py-2 text-sm font-semibold hover:bg-accent"
                >
                  Ver contato <ExternalLink size={13} />
                </Link>
              )}
              <Link
                href={`/conversas?c=${selected.conversationId}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Abrir conversa <ExternalLink size={13} />
              </Link>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-xl border bg-background px-4 py-2 text-sm font-semibold hover:bg-accent"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
