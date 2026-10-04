"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Trash2, Send, X } from "lucide-react";
import {
  createTemplate,
  duplicateTemplate,
  deleteTemplate,
  submitTemplate,
} from "@/lib/data/templates";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { TemplateCategory, TemplateStatus } from "@/types/domain";

type Template = {
  id: string;
  name: string;
  category: TemplateCategory;
  language: string;
  header: string | null;
  body: string;
  footer: string | null;
  buttons: { type: string; text: string; value?: string }[];
  status: TemplateStatus;
  rejection_reason: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  aprovado: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  pendente: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  rejeitado: "bg-destructive/10 text-destructive",
  rascunho: "bg-muted text-muted-foreground",
};

const CATEGORIES: TemplateCategory[] = ["marketing", "utilidade", "autenticacao"];

export function TemplatesManager({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">{templates.length} templates</h2>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus size={15} /> Novo template
          </button>
        </div>

        {templates.length === 0 ? (
          <Card className="text-sm text-muted-foreground">Nenhum template criado.</Card>
        ) : (
          templates.map((t) => (
            <Card key={t.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">{t.name}</span>
                  <Badge className={STATUS_STYLE[t.status] ?? "bg-muted text-muted-foreground"}>{t.status}</Badge>
                  <Badge className="bg-muted text-muted-foreground capitalize">{t.category}</Badge>
                  <span className="text-[11px] text-muted-foreground">{t.language}</span>
                </div>
                <div className="flex items-center gap-1">
                  <IconBtn title="Submeter à Meta" onClick={async () => { await submitTemplate(t.id); router.refresh(); }}>
                    <Send size={14} />
                  </IconBtn>
                  <IconBtn title="Duplicar" onClick={async () => { await duplicateTemplate(t.id); router.refresh(); }}>
                    <Copy size={14} />
                  </IconBtn>
                  <IconBtn title="Excluir" danger onClick={async () => { await deleteTemplate(t.id); router.refresh(); }}>
                    <Trash2 size={14} />
                  </IconBtn>
                </div>
              </div>

              {t.rejection_reason && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  Motivo da rejeição: {t.rejection_reason}
                </p>
              )}

              <div className="rounded-xl bg-muted/40 p-3">
                <WhatsAppBubble template={t} />
              </div>
            </Card>
          ))
        )}
      </div>

      <Card className="h-fit">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Prévia WhatsApp
        </p>
        <WhatsAppBubble
          template={{
            header: "Confirmação de Agendamento",
            body: "Olá, {{1}}! Seu compromisso está marcado para {{2}}. Podemos confirmar?",
            footer: "ConectaCRM",
            buttons: [{ type: "quick_reply", text: "Sim, confirmado" }],
          }}
        />
      </Card>

      {showForm && <TemplateModal onClose={() => setShowForm(false)} />}
    </div>
  );
}

function WhatsAppBubble({ template }: { template: { header?: string | null; body: string; footer?: string | null; buttons?: { text: string }[] } }) {
  return (
    <div className="max-w-sm rounded-2xl rounded-tl-sm border bg-card p-3 shadow-sm">
      {template.header && (
        <p className="mb-1.5 text-sm font-bold">{template.header}</p>
      )}
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{template.body}</p>
      {template.footer && <p className="mt-1.5 text-[11px] text-muted-foreground">{template.footer}</p>}
      {template.buttons && template.buttons.length > 0 && (
        <div className="mt-2 space-y-1 border-t pt-2">
          {template.buttons.map((b, i) => (
            <p key={i} className="text-center text-xs font-semibold text-primary">
              {b.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold">Novo template</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <form
          action={async (fd) => {
            setBusy(true);
            try {
              await createTemplate(fd);
              onClose();
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-3"
        >
          <input name="name" required placeholder="nome_do_template (apenas minúsculas e _)" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <select name="category" className="w-full rounded-xl border bg-background px-3 py-2 text-sm capitalize">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select name="language" className="w-full rounded-xl border bg-background px-3 py-2 text-sm">
              <option value="pt_BR">pt_BR</option>
              <option value="en_US">en_US</option>
              <option value="es_ES">es_ES</option>
            </select>
          </div>
          <input name="header_text" placeholder="Texto do cabeçalho (opcional)" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
          <textarea
            name="body"
            required
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Mensagem com variáveis {{1}}, {{2}}..."
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Variáveis detectadas: {[...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]).join(", ") || "nenhuma"}
          </p>
          <input name="footer" placeholder="Rodapé (opcional)" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent">
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {busy ? "Salvando..." : "Criar template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-lg border p-1.5 text-muted-foreground transition-colors hover:bg-accent",
        danger && "hover:border-destructive hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}
