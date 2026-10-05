"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FileUp } from "lucide-react";
import { importLeads, type ImportLeadsResult } from "@/lib/data/actions";

const EXAMPLE = `Nome; Telefone; E-mail; Empresa; Cidade
Carlos Lima; (11) 98888-7777; carlos@clinicasorriso.com; Clínica Sorriso; São Paulo
Ana Souza; 11955554444; ana@empresa.com.br; Empresa X; Campinas`;

export function ImportLeadsPanel() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportLeadsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function run() {
    setError(null);
    setResult(null);
    if (!text.trim()) {
      setError("Cole as linhas dos leads ou envie um arquivo CSV");
      return;
    }
    startTransition(async () => {
      try {
        const r = await importLeads(text);
        setResult(r);
        if (r.imported > 0) setText("");
      } catch (e) {
        setError((e as Error).message.replace(/^Error:\s*/, ""));
      }
    });
  }

  async function onFile(file: File) {
    const content = await file.text();
    setText(content);
    setOpen(true);
  }

  return (
    <div className="rounded-2xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold">
          <Upload size={15} className="text-primary" />
          Importar leads
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? "fechar" : "colar lista ou subir CSV"}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t p-4">
          <p className="text-xs text-muted-foreground">
            Uma linha por lead: <code>Nome; Telefone; E-mail; Empresa; Cidade</code>. Telefone e
            e-mail podem vir em qualquer ordem e o cabeçalho da planilha é ignorado. Duplicados
            (mesmo telefone ou e-mail) são pulados.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={EXAMPLE}
            className="w-full resize-y rounded-xl border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={run}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Upload size={15} />
              {pending ? "Importando..." : "Importar leads"}
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-accent"
            >
              <FileUp size={15} />
              Enviar arquivo CSV
            </button>

            <button
              type="button"
              onClick={() => setText(EXAMPLE)}
              className="text-xs text-muted-foreground underline"
            >
              usar exemplo
            </button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && (
            <div className="rounded-xl border bg-muted/30 p-3 text-sm">
              <p className="font-semibold text-emerald-600">
                {result.imported} lead(s) importado(s)
              </p>
              <p className="text-xs text-muted-foreground">
                {result.duplicates} duplicado(s) · {result.invalid} linha(s) inválida(s)
              </p>
              {result.errors.length > 0 && (
                <p className="mt-1 text-xs text-destructive">{result.errors.join(" · ")}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
