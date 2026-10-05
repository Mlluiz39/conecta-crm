"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Send, Search, Sparkles } from "lucide-react";
import { prospectContacts, prospectWithAgent, runProspectFollowups, type AgentProspectResult } from "@/lib/data/actions";

type Contact = { id: string; name: string; phone: string | null };

const VAR_HELP = "Variáveis: {{nome}} = nome completo, {{primeiro_nome}} = primeiro nome";

export function ProspectPanel({
  contacts,
  page,
  search,
  contacted = [],
  gmail,
}: {
  contacts: Contact[];
  page: number;
  search: string;
  contacted?: string[];
  gmail?: { canSend: boolean; email: string | null };
}) {
  const contactedSet = new Set(contacted);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modo agente
  const [offer, setOffer] = useState("");
  const [goal, setGoal] = useState("agendar uma conversa rápida de 15 minutos");
  const [notes, setNotes] = useState("");
  const [agentPending, startAgentTransition] = useTransition();
  const [agentResult, setAgentResult] = useState<AgentProspectResult | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);

  const selectable = contacts.filter((c) => c.phone);
  const allSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((c) => c.id)));
  }

  function insertVar(v: string) {
    setText((t) => (t ? `${t} ${v}` : v));
  }

  function send() {
    setError(null);
    setResult(null);
    if (!text.trim()) {
      setError("Escreva a mensagem");
      return;
    }
    if (selected.size === 0) {
      setError("Selecione ao menos um contato");
      return;
    }
    startTransition(async () => {
      try {
        const r = await prospectContacts([...selected], text);
        setResult(
          `${r.queued} na fila · ${r.sent} enviadas agora${r.skipped ? ` · ${r.skipped} sem telefone/conversa` : ""}`,
        );
        if (r.sent > 0) setSelected(new Set());
      } catch (e) {
        setError((e as Error).message.replace(/^Error:\s*/, ""));
      }
    });
  }

  // Follow-up
  const [followupHours, setFollowupHours] = useState(24);
  const [followupPending, startFollowupTransition] = useTransition();
  const [followupResult, setFollowupResult] = useState<string | null>(null);
  const [followupError, setFollowupError] = useState<string | null>(null);

  function runFollowup(dryRun: boolean) {
    setFollowupError(null);
    setFollowupResult(null);
    startFollowupTransition(async () => {
      try {
        const r = await runProspectFollowups({
          hours: followupHours,
          limit: 5,
          dryRun,
          offer,
          goal,
        });
        const nomes = r.details.map((d) => d.name).join(", ");
        setFollowupResult(
          dryRun
            ? `${r.candidates} lead(s) elegível(is)${nomes ? `: ${nomes}` : ""}`
            : `${r.queued} na fila · ${r.sent} enviado(s)${nomes ? ` · ${nomes}` : ""}`,
        );
      } catch (e) {
        setFollowupError((e as Error).message.replace(/^Error:\s*/, ""));
      }
    });
  }

  const q = search ? `&search=${encodeURIComponent(search)}` : "";

  function runAgent() {
    setAgentError(null);
    setAgentResult(null);
    if (selected.size === 0) {
      setAgentError("Selecione ao menos um contato");
      return;
    }
    startAgentTransition(async () => {
      try {
        const r = await prospectWithAgent([...selected], { offer, goal, notes });
        setAgentResult(r);
        if (r.sent > 0) setSelected(new Set());
      } catch (e) {
        setAgentError((e as Error).message.replace(/^Error:\s*/, ""));
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,380px]">
      {/* Lista de contatos */}
      <div className="rounded-2xl border bg-card">
        <form className="flex items-center gap-2 border-b p-3" action="/prospeccao" method="get">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              name="search"
              defaultValue={search}
              placeholder="Buscar por nome, telefone, e-mail"
              className="w-full rounded-xl border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-accent">Buscar</button>
        </form>

        <label className="flex items-center gap-2 border-b px-4 py-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-primary" />
          Selecionar todos com telefone ({selectable.length})
        </label>

        <div className="max-h-[420px] divide-y overflow-y-auto">
          {contacts.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</p>
          )}
          {contacts.map((c) => (
            <label
              key={c.id}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/50 ${!c.phone ? "opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                disabled={!c.phone}
                className="h-4 w-4 accent-primary"
              />
              <span className="flex-1 truncate font-medium">{c.name}</span>
              {contactedSet.has(c.id) && (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  já contatado
                </span>
              )}
              <span className="text-xs text-muted-foreground">{c.phone ?? "sem telefone"}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
          <span>
            Página {page}
            {page > 1 && (
              <>
                {" · "}
                <Link className="underline" href={`/prospeccao?page=${page - 1}${q}`}>
                  anterior
                </Link>
              </>
            )}
            {contacts.length >= 50 && (
              <>
                {" · "}
                <Link className="underline" href={`/prospeccao?page=${page + 1}${q}`}>
                  próxima
                </Link>
              </>
            )}
          </span>
          <span>máx. 50 por envio (aquecimento)</span>
        </div>
      </div>

      {/* Agente prospecta */}
      <div className="space-y-3 rounded-2xl border-2 border-primary/30 bg-card p-4 lg:col-start-2 lg:row-start-1">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Sparkles size={15} className="text-primary" />
            Agente prospecta por mim
          </h2>
          <p className="text-xs text-muted-foreground">
            O agente escreve uma abordagem personalizada para cada lead, envia no WhatsApp e assume a
            conversa depois.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-muted-foreground">
            O que oferecer
            <input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="ex.: site institucional, landing page, sistema de agendamento"
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="block text-xs font-semibold text-muted-foreground">
            Objetivo do contato
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="ex.: agendar call de 15 min"
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="block text-xs font-semibold text-muted-foreground">
            Instruções extras (opcional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="ex.: falar do case do setor de saúde, sem falar preço"
              className="mt-1 w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>

        {agentError && <p className="text-sm text-destructive">{agentError}</p>}

        {agentResult && (
          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <p className="text-sm font-semibold text-emerald-600">
              {agentResult.queued} no WhatsApp · {agentResult.emails} por e-mail ·{" "}
              {agentResult.sent} enviadas agora
              {agentResult.alreadyContacted ? ` · ${agentResult.alreadyContacted} já contatado(s)` : ""}
              {agentResult.skipped ? ` · ${agentResult.skipped} pulado(s)` : ""}
            </p>
            {agentResult.previews.map((p, i) => (
              <div key={i} className="rounded-lg border bg-background p-2 text-xs">
                <div className="mb-1 flex items-center justify-between gap-2 font-semibold">
                  <span className="truncate">{p.name || p.contact}</span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {p.channel === "email" ? "e-mail" : "whatsapp"}
                    {p.source === "template" ? " · modelo" : ""}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={runAgent}
          disabled={agentPending || selected.size === 0}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles size={16} />
          {agentPending
            ? "Agente escrevendo e enviando..."
            : `Agente prospecta ${selected.size} contato(s)`}
        </button>

        <p className="text-xs text-muted-foreground">
          Máx. 10 leads por rodada (cada mensagem é escrita na hora). Respostas caem em{" "}
          <Link className="underline" href="/conversas">Conversas</Link>.
        </p>

        {gmail?.canSend ? (
          <p className="text-xs text-emerald-600">
            E-mail ativo{gmail.email ? ` (${gmail.email})` : ""} — leads sem telefone saem por
            e-mail.
          </p>
        ) : (
          <p className="text-xs text-amber-600">
            E-mail desligado: leads sem telefone serão pulados. Conecte o Google em{" "}
            <Link className="underline" href="/conexoes">Conexões</Link> para enviar por e-mail.
          </p>
        )}

        <div className="space-y-2 rounded-xl border border-dashed p-3">
          <p className="text-xs font-bold">Follow-up de fechamento</p>
          <p className="text-xs text-muted-foreground">
            Retoma quem recebeu a primeira mensagem e não respondeu (1 retomada por lead).
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">
              após
              <input
                type="number"
                min={1}
                value={followupHours}
                onChange={(e) => setFollowupHours(Number(e.target.value) || 24)}
                className="mx-1 w-16 rounded-lg border bg-background px-2 py-1 text-xs"
              />
              horas
            </label>
            <button
              type="button"
              onClick={() => runFollowup(true)}
              disabled={followupPending}
              className="rounded-lg border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              ver quem é elegível
            </button>
            <button
              type="button"
              onClick={() => runFollowup(false)}
              disabled={followupPending}
              className="rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {followupPending ? "rodando..." : "enviar follow-up"}
            </button>
          </div>
          {followupError && <p className="text-xs text-destructive">{followupError}</p>}
          {followupResult && <p className="text-xs text-emerald-600">{followupResult}</p>}
        </div>
      </div>

      {/* Mensagem */}
      <div className="space-y-3 rounded-2xl border bg-card p-4 lg:col-start-2 lg:row-start-2">
        <div>
          <h2 className="text-sm font-bold">Mensagem manual</h2>
          <p className="text-xs text-muted-foreground">{VAR_HELP}</p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"Olá {{primeiro_nome}}! Aqui é a equipe da ConectaCRM..."}
          className="w-full resize-y rounded-xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => insertVar("{{primeiro_nome}}")}
            className="rounded-lg border px-2 py-1 text-xs hover:bg-accent"
          >
            + primeiro_nome
          </button>
          <button
            type="button"
            onClick={() => insertVar("{{nome}}")}
            className="rounded-lg border px-2 py-1 text-xs hover:bg-accent"
          >
            + nome
          </button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && <p className="text-sm text-emerald-600">{result}</p>}

        <button
          onClick={send}
          disabled={pending || selected.size === 0 || !text.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Send size={16} />
          {pending ? "Enviando..." : `Enviar para ${selected.size} contato(s)`}
        </button>

        <p className="text-xs text-muted-foreground">
          Respostas abrem em <Link className="underline" href="/conversas">Conversas</Link> — o
          agente de IA da conversa responde sozinho.
        </p>
      </div>
    </div>
  );
}
