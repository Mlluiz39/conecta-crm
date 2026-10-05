"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Search, Sparkles, Trash2, Clock } from "lucide-react";
import { useConfirm, useNotify } from "@/components/ui/dialog-provider";
import { TEMPERATURE_EMOJI, type LeadTemperature } from "@/lib/data/lead-temperature";
import {
  saveLeadOpportunity,
  setLeadTemperature,
  deleteContacts,
  prospectWithAgent,
  runProspectFollowups,
  type AgentProspectResult,
} from "@/lib/data/actions";

type Contact = {
  id: string;
  name: string;
  phone: string | null;
  /** Temperatura atual (derivada das etiquetas) */
  temperature?: LeadTemperature | null;
  /** Valor da oportunidade, se já existir */
  value?: number | null;
};

const TEMPERATURES: [LeadTemperature, string][] = [
  ["frio", "Frio"],
  ["morno", "Morno"],
  ["quente", "Quente"],
];

/**
 * Lista de leads salvos + prospecção pelo agente + follow-up de fechamento.
 * O envio manual de mensagem foi removido: a abordagem é sempre escrita pelo
 * agente (a prospecção avulsa fica no bloco "Disparar nova prospecção").
 */
export function ProspectPanel({
  contacts,
  page,
  search,
  contacted = [],
  gmail,
  tools,
}: {
  contacts: Contact[];
  page: number;
  search: string;
  contacted?: string[];
  gmail?: { canSend: boolean; email: string | null };
  /** Ferramentas do bloco de leads (importar / limpeza), renderizadas sob a busca */
  tools?: React.ReactNode;
}) {
  const contactedSet = new Set(contacted);
  const confirmDialog = useConfirm();
  const notify = useNotify();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [temps, setTemps] = useState<Record<string, LeadTemperature | null>>(() =>
    Object.fromEntries(contacts.map((c) => [c.id, c.temperature ?? null])),
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(contacts.map((c) => [c.id, c.value ? String(c.value) : ""])),
  );

  // Agente
  const [offer, setOffer] = useState("");
  const [goal, setGoal] = useState("agendar uma conversa rápida de 15 minutos");
  const [notes, setNotes] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [agentPending, startAgentTransition] = useTransition();
  const [agentResult, setAgentResult] = useState<AgentProspectResult | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);

  // Seletor de leads dentro do painel do agente
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  // Follow-up
  const [followupHours, setFollowupHours] = useState(24);
  const [followupPending, startFollowupTransition] = useTransition();
  const [followupResult, setFollowupResult] = useState<string | null>(null);
  const [followupError, setFollowupError] = useState<string | null>(null);

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

  function changeTemperature(id: string, next: LeadTemperature) {
    const current = temps[id] ?? null;
    const target = current === next ? null : next;
    setTemps((prev) => ({ ...prev, [id]: target }));
    startTransition(async () => {
      try {
        await setLeadTemperature(id, target);
      } catch (e) {
        notify((e as Error).message.replace(/^Error:\s*/, ""), "error");
        setTemps((prev) => ({ ...prev, [id]: current }));
      }
    });
  }

  function saveValue(id: string) {
    const raw = (values[id] ?? "").replace(/[^\d,.]/g, "").replace(".", "").replace(",", ".");
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      notify("Informe o valor do serviço", "error");
      return;
    }
    startTransition(async () => {
      try {
        await saveLeadOpportunity({ contactId: id, value });
        notify(
          `Oportunidade salva: ${value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        );
      } catch (e) {
        notify((e as Error).message.replace(/^Error:\s*/, ""), "error");
      }
    });
  }

  async function removeSelected() {
    setError(null);
    setResult(null);
    if (selected.size === 0) {
      setError("Selecione ao menos um contato");
      return;
    }
    const total = selected.size;
    const ok = await confirmDialog({
      title: `Apagar ${total} lead${total > 1 ? "s" : ""}?`,
      description:
        "A conversa e as mensagens desses leads também serão removidas do CRM e do banco. Não dá para desfazer.",
      confirmLabel: "Apagar",
      tone: "danger",
    });
    if (!ok) return;

    startTransition(async () => {
      try {
        const r = await deleteContacts([...selected]);
        notify(`${r.deleted} lead(s) apagado(s)`);
        setResult(`${r.deleted} lead(s) apagado(s)`);
        setSelected(new Set());
      } catch (e) {
        notify((e as Error).message.replace(/^Error:\s*/, ""), "error");
      }
    });
  }

  async function removeOne(id: string, name: string) {
    setError(null);
    setResult(null);
    const ok = await confirmDialog({
      title: `Apagar "${name}"?`,
      description: "A conversa e as mensagens desse lead também serão removidas. Não dá para desfazer.",
      confirmLabel: "Apagar",
      tone: "danger",
    });
    if (!ok) return;

    startTransition(async () => {
      try {
        const r = await deleteContacts([id]);
        notify(`${r.deleted} lead(s) apagado(s)`);
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch (e) {
        notify((e as Error).message.replace(/^Error:\s*/, ""), "error");
      }
    });
  }

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

        const numeric = Number(dealValue.replace(/[^\d,.]/g, "").replace(".", "").replace(",", "."));
        if (Number.isFinite(numeric) && numeric > 0 && r.contactIds.length > 0) {
          await Promise.all(
            r.contactIds.map((id) =>
              saveLeadOpportunity({ contactId: id, value: numeric }).catch(() => null),
            ),
          );
          setValues((prev) => ({
            ...prev,
            ...Object.fromEntries(r.contactIds.map((id) => [id, String(numeric)])),
          }));
        }
        if (r.sent > 0) setSelected(new Set());
      } catch (e) {
        setAgentError((e as Error).message.replace(/^Error:\s*/, ""));
      }
    });
  }

  function runFollowup(dryRun: boolean) {
    setFollowupError(null);
    setFollowupResult(null);
    startFollowupTransition(async () => {
      try {
        const r = await runProspectFollowups({ hours: followupHours, limit: 5, dryRun, offer, goal });
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

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr,380px]">
      {/* Lista de leads */}
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

        {tools && <div className="space-y-2 border-b bg-muted/20 p-3">{tools}</div>}

        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-primary" />
            Selecionar todos com telefone ({selectable.length})
          </label>
          <button
            type="button"
            onClick={removeSelected}
            disabled={pending || selected.size === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 size={12} />
            Apagar {selected.size > 0 ? `(${selected.size})` : "selecionados"}
          </button>
        </div>

        <div className="max-h-[420px] divide-y overflow-y-auto">
          {contacts.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</p>
          )}
          {contacts.map((c) => {
            const temp = temps[c.id] ?? null;
            return (
              <div
                key={c.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-sm hover:bg-accent/30 ${!c.phone ? "opacity-60" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  disabled={!c.phone}
                  className="h-4 w-4 accent-primary"
                />
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>

                {contactedSet.has(c.id) && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    já contatado
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">{c.phone ?? "sem telefone"}</span>

                <span className="flex shrink-0 items-center gap-0.5" title="Temperatura do lead">
                  {TEMPERATURES.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      title={label}
                      onClick={() => changeTemperature(c.id, key)}
                      className={`rounded-md px-1.5 py-0.5 text-xs transition-colors ${
                        temp === key ? "bg-primary/15 ring-1 ring-primary/40" : "opacity-40 hover:opacity-100"
                      }`}
                    >
                      {TEMPERATURE_EMOJI[key]}
                    </button>
                  ))}
                </span>

                <span className="flex shrink-0 items-center gap-1">
                  <input
                    value={values[c.id] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveValue(c.id);
                    }}
                    placeholder="R$ valor"
                    title="Valor do serviço (cria a oportunidade no funil)"
                    className="w-24 rounded-lg border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => saveValue(c.id)}
                    title="Salvar valor na oportunidade"
                    className="rounded-lg border px-1.5 py-1 text-[10px] font-bold hover:bg-accent"
                  >
                    ok
                  </button>
                </span>

                <button
                  type="button"
                  title="Apagar lead"
                  onClick={(e) => {
                    e.preventDefault();
                    void removeOne(c.id, c.name);
                  }}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
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
          <span>até 10 leads por rodada do agente</span>
        </div>
      </div>

      {/* Agente prospecta + follow-up */}
      <div className="space-y-4">
        <div className="space-y-3 rounded-2xl border-2 border-primary/30 bg-card p-4">
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

          {/* Escolher os leads aqui mesmo */}
          <div className="rounded-xl border bg-background">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <span className="text-xs font-semibold">
                {selected.size > 0
                  ? `${selected.size} lead(s) selecionado(s)`
                  : "Escolher os leads"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {pickerOpen ? "fechar" : "abrir lista"}
              </span>
            </button>

            {pickerOpen && (
              <div className="space-y-2 border-t p-2">
                <input
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Filtrar por nome ou telefone…"
                  className="w-full rounded-lg border bg-card px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                />

                <div className="max-h-52 space-y-0.5 overflow-y-auto">
                  {contacts.length === 0 && (
                    <p className="p-2 text-center text-xs text-muted-foreground">
                      Nenhum lead no CRM ainda — importe ou busque empresas primeiro.
                    </p>
                  )}
                  {contacts
                    .filter((c) => {
                      const term = pickerSearch.trim().toLowerCase();
                      if (!term) return true;
                      return (
                        c.name.toLowerCase().includes(term) ||
                        (c.phone ?? "").toLowerCase().includes(term)
                      );
                    })
                    .map((c) => (
                      <label
                        key={c.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-accent/50 ${
                          !c.phone ? "opacity-50" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggle(c.id)}
                          disabled={!c.phone}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                        {contactedSet.has(c.id) && (
                          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] uppercase text-muted-foreground">
                            já contatado
                          </span>
                        )}
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {c.phone ?? "sem telefone"}
                        </span>
                      </label>
                    ))}
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Mostrando os leads desta página.</span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="underline hover:text-foreground"
                    >
                      {allSelected ? "limpar" : "selecionar todos"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      className="underline hover:text-foreground"
                    >
                      limpar seleção
                    </button>
                  </span>
                </div>
              </div>
            )}
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
              Valor do serviço por lead (opcional)
              <input
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                placeholder="ex.: 2.500,00"
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
                {agentResult.queued} no WhatsApp · {agentResult.emails} por e-mail · {agentResult.sent}{" "}
                enviadas agora
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
            {agentPending ? "Agente escrevendo e enviando..." : `Agente prospecta ${selected.size} contato(s)`}
          </button>

          {gmail?.canSend ? (
            <p className="text-xs text-emerald-600">
              E-mail ativo{gmail.email ? ` (${gmail.email})` : ""} — leads sem telefone saem por e-mail.
            </p>
          ) : (
            <p className="text-xs text-amber-600">
              E-mail desligado: leads sem telefone serão pulados. Preencha{" "}
              <code className="rounded bg-muted px-1">EMAIL_ADDRESS</code> e{" "}
              <code className="rounded bg-muted px-1">EMAIL_PASSWORD</code> no{" "}
              <code className="rounded bg-muted px-1">.env</code> do Hermes (ou conecte o Google em{" "}
              <Link className="underline" href="/conexoes">Conexões</Link>).
            </p>
          )}
        </div>

        <div className="space-y-2 rounded-2xl border border-dashed p-4">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-primary" />
            <p className="text-sm font-bold">Follow-up de fechamento</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Retoma quem recebeu a primeira mensagem e não respondeu (1 retomada por lead).
          </p>
          <div className="flex flex-wrap items-center gap-2">
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

        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && <p className="text-sm text-emerald-600">{result}</p>}
      </div>
    </div>
  );
}
