"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Send, Search } from "lucide-react";
import { prospectContacts } from "@/lib/data/actions";

type Contact = { id: string; name: string; phone: string | null };

const VAR_HELP = "Variáveis: {{nome}} = nome completo, {{primeiro_nome}} = primeiro nome";

export function ProspectPanel({
  contacts,
  page,
  search,
}: {
  contacts: Contact[];
  page: number;
  search: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const q = search ? `&search=${encodeURIComponent(search)}` : "";

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

      {/* Mensagem */}
      <div className="space-y-3 rounded-2xl border bg-card p-4">
        <div>
          <h2 className="text-sm font-bold">Mensagem</h2>
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
