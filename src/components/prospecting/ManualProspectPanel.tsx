"use client";

import { useState, useTransition } from "react";
import { Send, UserPlus } from "lucide-react";
import { prospectManualLead, type ManualProspectResult } from "@/lib/data/actions";
import { TEMPERATURE_EMOJI, type LeadTemperature } from "@/lib/data/lead-temperature";

/**
 * "Disparar nova prospecção" manual: você viu um cliente em potencial em algum
 * lugar e dispara a abordagem direto — sem payload de busca. O agente escreve o
 * texto e o contato é criado no CRM se ainda não existir.
 */
export function ManualProspectPanel() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [offer, setOffer] = useState("");
  const [goal, setGoal] = useState("agendar uma conversa rápida de 15 minutos");
  const [notes, setNotes] = useState("");
  const [value, setValue] = useState("");
  const [temperature, setTemperature] = useState<LeadTemperature>("morno");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ManualProspectResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    setResult(null);
    if (!name.trim()) {
      setError("Informe o nome do contato");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setError("Informe telefone ou e-mail");
      return;
    }
    startTransition(async () => {
      try {
        const numeric = Number(value.replace(/[^\d,.]/g, "").replace(".", "").replace(",", "."));
        const r = await prospectManualLead({
          name,
          phone,
          email,
          offer,
          goal,
          notes,
          value: Number.isFinite(numeric) && numeric > 0 ? numeric : undefined,
          temperature,
        });
        setResult(r);
        if (r.sent > 0) {
          setName("");
          setPhone("");
          setEmail("");
          setNotes("");
        }
      } catch (e) {
        setError((e as Error).message.replace(/^Error:\s*/, ""));
      }
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-2">
        <UserPlus size={17} className="mt-0.5 text-primary" />
        <div>
          <h2 className="text-sm font-bold">2 · Disparar nova prospecção</h2>
          <p className="text-xs text-muted-foreground">
            Achou um cliente em potencial em algum lugar? Coloca aqui e o agente aborda na hora.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do contato ou da empresa"
          className="rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="WhatsApp: +55 11 98765-4321"
            className="rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail (opcional)"
            className="rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <input
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
          placeholder="O que oferecer (ex.: site institucional com agendamento)"
          className="rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Objetivo do contato"
          className="rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Valor do serviço: 2.500,00"
            className="rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center gap-1 rounded-xl border bg-background px-2 py-1.5">
            <span className="mr-1 text-[11px] font-semibold text-muted-foreground">Temperatura</span>
            {([
              ["frio", TEMPERATURE_EMOJI.frio],
              ["morno", TEMPERATURE_EMOJI.morno],
              ["quente", TEMPERATURE_EMOJI.quente],
            ] as [LeadTemperature, string][]).map(([key, emoji]) => (
              <button
                key={key}
                type="button"
                title={key}
                onClick={() => setTemperature(key)}
                className={`rounded-lg px-1.5 py-0.5 text-sm transition-colors ${
                  temperature === key ? "bg-primary/15 ring-1 ring-primary/40" : "opacity-45 hover:opacity-100"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Contexto (onde você viu, o que ele precisa…)"
          className="resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-1 rounded-xl border bg-muted/30 p-3 text-xs">
          <p className="font-semibold text-emerald-600">
            {result.sent > 0
              ? `Disparado ✓ · ${result.created ? "contato criado" : "contato já existia"}`
              : result.skippedReason ?? "Nada enviado"}
          </p>
          {result.preview && (
            <p className="whitespace-pre-wrap text-muted-foreground">{result.preview}</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        <Send size={15} />
        {pending ? "Gerando e enviando…" : "Disparar abordagem"}
      </button>
    </div>
  );
}
