"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, Plus, Power, Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui/primitives";
import { useNotify } from "@/components/ui/dialog-provider";
import {
  createCaptureSource,
  deleteCaptureSource,
  toggleCaptureSource,
  type CaptureSource,
  type PipelineStageOption,
} from "@/lib/data/capture";

/**
 * Tela de fontes de captação. A URL é o contrato com o formulário: quem cola
 * `/api/captacao/<token>` no action do site passa a criar contato + card no
 * funil, com UTM, sem precisar de login.
 */
export function CaptureSourcesPanel({
  sources,
  stages,
  appUrl,
  canManage,
}: {
  sources: CaptureSource[];
  stages: PipelineStageOption[];
  appUrl: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const notify = useNotify();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);

  const baseUrl = appUrl.replace(/\/+$/, "");

  function urlFor(token: string) {
    return `${baseUrl}/api/captacao/${token}`;
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(urlFor(token));
      setCopied(token);
      notify("Endereço copiado");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      notify("Não foi possível copiar; selecione o endereço manualmente", "error");
    }
  }

  function onCreate(formData: FormData) {
    startTransition(async () => {
      try {
        await createCaptureSource(formData);
        notify("Fonte criada. Cole o endereço no formulário ou na automação.");
        router.refresh();
      } catch (e) {
        notify((e as Error).message.replace(/^Error:\s*/, ""), "error");
      }
    });
  }

  function onToggle(id: string, active: boolean) {
    startTransition(async () => {
      try {
        await toggleCaptureSource(id, active);
        notify(active ? "Fonte ativada" : "Fonte desativada");
        router.refresh();
      } catch (e) {
        notify((e as Error).message.replace(/^Error:\s*/, ""), "error");
      }
    });
  }

  function onDelete(id: string, name: string) {
    if (!window.confirm(`Apagar a fonte "${name}"? A URL deixa de funcionar. Os leads já captados ficam.`)) return;
    startTransition(async () => {
      try {
        await deleteCaptureSource(id);
        notify("Fonte apagada");
        router.refresh();
      } catch (e) {
        notify((e as Error).message.replace(/^Error:\s*/, ""), "error");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-bold">Nova fonte de captação</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Cada fonte tem um endereço próprio. Use um por campanha (site, landing, anúncio,
            Zapier/n8n) para saber de onde o lead veio.
          </p>
        </div>

        {canManage ? (
          <form action={onCreate} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Nome da fonte
              </label>
              <input
                name="name"
                required
                placeholder="ex.: Site, Landing Black Friday, Anúncio Meta"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Entrar no funil em (opcional)
              </label>
              <select
                name="stage_id"
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                defaultValue=""
              >
                <option value="">Primeira etapa do funil</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              <Plus size={15} />
              Criar fonte
            </button>
          </form>
        ) : (
          <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
            Só administrador ou gerente cria e altera fontes. Você pode ver os endereços abaixo.
          </p>
        )}

        <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">Como enviar</p>
          <p>
            A fonte aceita <span className="font-mono">POST</span> em JSON ou form-urlencoded.
            Campos aceitos: <span className="font-mono">nome</span>,{" "}
            <span className="font-mono">telefone</span>, <span className="font-mono">email</span>,{" "}
            <span className="font-mono">empresa</span>, <span className="font-mono">cidade</span>,{" "}
            <span className="font-mono">mensagem</span> e <span className="font-mono">utm_*</span>.
            Telefone ou e-mail é obrigatório.
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-2 text-[11px] leading-relaxed">
{`<form action="URL_DA_FONTE" method="post">
  <input name="nome" />
  <input name="telefone" />
  <input name="email" />
  <input type="hidden" name="utm_source" value="site" />
</form>`}
          </pre>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">Fontes cadastradas</h3>
          <Badge className="bg-accent text-accent-foreground">{sources.length}</Badge>
        </div>

        {sources.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
            Nenhuma fonte ainda. Crie a primeira ao lado e cole o endereço no seu formulário.
          </p>
        )}

        {sources.map((source) => (
          <div key={source.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 size={15} className="text-primary" />
                <p className="text-sm font-semibold">{source.name}</p>
                <Badge
                  className={
                    source.is_active
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {source.is_active ? "ativa" : "desativada"}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {source.stage?.name ? `Etapa: ${source.stage.name}` : "Primeira etapa do funil"}
              </p>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={urlFor(source.token)}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => void copy(source.token)}
                title="Copiar endereço"
                className="rounded-lg border p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Copy size={14} />
              </button>
            </div>
            {copied === source.token && (
              <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">Copiado</p>
            )}

            {canManage && (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onToggle(source.id, !source.is_active)}
                  className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-accent disabled:opacity-50"
                >
                  <Power size={13} />
                  {source.is_active ? "Desativar" : "Ativar"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onDelete(source.id, source.name)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 size={13} />
                  Apagar
                </button>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
