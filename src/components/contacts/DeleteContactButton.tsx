"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteContact } from "@/lib/data/actions";
import { useConfirm, useNotify } from "@/components/ui/dialog-provider";

/** Apaga um contato (com a conversa e as mensagens) direto da lista. */
export function DeleteContactButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const confirmDialog = useConfirm();
  const notify = useNotify();

  async function remove() {
    const ok = await confirmDialog({
      title: `Apagar "${name}"?`,
      description: "A conversa e as mensagens desse lead também serão removidas. Não dá para desfazer.",
      confirmLabel: "Apagar",
      tone: "danger",
    });
    if (!ok) return;

    startTransition(async () => {
      try {
        await deleteContact(id);
        notify("Contato apagado");
      } catch (e) {
        notify((e as Error).message.replace(/^Error:\s*/, ""), "error");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      title="Apagar contato"
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
