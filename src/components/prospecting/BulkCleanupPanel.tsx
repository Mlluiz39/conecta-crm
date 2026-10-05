"use client";

import { useState, useTransition } from "react";
import { Eraser, Trash2 } from "lucide-react";
import { deleteContactsByFilter, type BulkDeleteFilter } from "@/lib/data/actions";
import { useConfirm, useNotify } from "@/components/ui/dialog-provider";

/**
 * Limpeza em massa dos leads que você não quer: sem telefone, nunca contatados,
 * ou tudo. Cada botão mostra quantos leads seriam apagados.
 */
export function BulkCleanupPanel({
  counts,
}: {
  counts: { noPhone: number; neverContacted: number; all: number };
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmDialog = useConfirm();
  const notify = useNotify();

  async function run(filter: BulkDeleteFilter, total: number, label: string, phrase?: string) {
    setError(null);
    setResult(null);
    if (total === 0) {
      setResult(`Nenhum lead ${label}`);
      return;
    }

    const ok = await confirmDialog({
      title: phrase ? `Apagar TODOS os ${total} leads?` : `Apagar ${total} lead(s) ${label}?`,
      description: phrase
        ? "Isso zera a base de leads do CRM. Conversas, mensagens, oportunidades e agendamentos ligados a eles também são removidos. Não dá para desfazer."
        : "A conversa e as mensagens desses leads vão junto. Não dá para desfazer.",
      confirmLabel: phrase ? "Apagar tudo" : "Apagar",
      tone: "danger",
      requirePhrase: phrase,
    });
    if (!ok) {
      return;
    }

    startTransition(async () => {
      try {
        const r = await deleteContactsByFilter(filter);
        notify(`${r.deleted} lead(s) apagado(s) ${label}`);
        setResult(`${r.deleted} lead(s) apagado(s) ${label}`);
      } catch (e) {
        const message = (e as Error).message.replace(/^Error:\s*/, "");
        notify(message, "error");
        setError(message);
      }
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-dashed bg-background p-3">
      <div className="flex items-start gap-2">
        <Eraser size={16} className="mt-0.5 text-primary" />
        <div>
          <h2 className="text-sm font-bold">Limpeza de leads</h2>
          <p className="text-xs text-muted-foreground">
            Apaga em massa o que não interessa — some do CRM e do banco.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run({ kind: "noPhone" }, counts.noPhone, "sem telefone")}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
        >
          <Trash2 size={12} /> Sem telefone ({counts.noPhone})
        </button>
        <button
          type="button"
          onClick={() => run({ kind: "neverContacted" }, counts.neverContacted, "nunca contatado(s)")}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
        >
          <Trash2 size={12} /> Nunca contatados ({counts.neverContacted})
        </button>
        <button
          type="button"
          onClick={() => run({ kind: "all" }, counts.all, "no total", "APAGAR")}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 size={12} /> Apagar todos ({counts.all})
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {result && <p className="text-xs text-emerald-600">{result}</p>}
      <p className="text-[11px] text-muted-foreground">
        "Nunca contatados" = leads que ainda não receberam nenhuma mensagem nossa.
      </p>
    </div>
  );
}
