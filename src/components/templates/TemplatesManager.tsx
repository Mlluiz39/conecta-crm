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

type Template = {
  id: string;
  name: string;
  category: string;
  language: string;
  header_type: string;
  header_text: string | null;
  body: string;
  footer: string | null;
  buttons: { type: string; text: string; value?: string }[];
  status: string;
  rejection_reason: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  APROVADO: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  PENDENTE: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  REJEITADO: "bg-destructive/10 text-destructive",
  PAUSADO: "bg-muted text-muted-foreground",
  DESABILITADO: "bg-muted text-muted-foreground",
};

const CATEGORIES = ["MARKETING", "UTILIDADE", "AUTENTICACAO"];

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
                  <Badge className="bg-muted text-muted-foreground">{t.category}</Badge>
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

      {/* Prévia na lateral demonstrando o formato de bolha */}
      <Card className="h-fit">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Prévia WhatsApp
        </p>
        <WhatsAppBubble
          template={{
            header_type: "text",
            header_text: "Olá!",
            body: "Seu pedido {{1}} saiu para entrega e chega até {{2}}.",
            footer: "ConectaCRM",
            buttons: [{ type: "quick_reply", text: "Confirmar" }],
          }}
        />
      </Card>

      {showForm && <TemplateModal onClose={() => setShowForm(false)} />}
    </div>
  );
}

function WhatsAppBubble({ template }: { template: Pick<Template, "header_type" | "header_text" | "body" | "footer" | "buttons"> }) {
  return (
    <div className="max-w-sm rounded-2xl rounded-tl-sm border bg-card p-3 shadow-sm">
      {template.header_type === "text" && template.header_text && (
        <p className="mb-1.5 text-sm font-bold">{template.header_text}</p>
      )}
      {template.header_type !== "none" && template.header_type !== "text" && (
        <div className="mb-1.5 flex h-24 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
          [{template.header_type}]
        </div>
      )}
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{template.body}</p>
      {template.footer && <p className="mt-1.5 text-[11px] text-muted-foreground">{template.footer}</p>}
      {template.buttons?.length > 0 && (
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
          <input name="name" required placeholder="nome_do_template" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <select name="category" className="w-full rounded-xl border bg-background px-3 py-2 text-sm">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select name="language" className="w-full rounded-xl border bg-background px-3 py-2 text-sm">
              <option value="pt_BR">pt_BR</option>
              <option value="en_US">en_US</option>
              <option value="es_ES">es_ES</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select name="header_type" className="w-full rounded-xl border bg-background px-3 py-2 text-sm">
              {["none", "text", "image", "document", "video"].map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <input name="header_text" placeholder="Texto do cabeçalho" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
          </div>
          <textarea
            name="body"
            required
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Corpo com variáveis {{1}}, {{2}}..."
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
              {busy ? "Salvando..." : "Criar"}
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
