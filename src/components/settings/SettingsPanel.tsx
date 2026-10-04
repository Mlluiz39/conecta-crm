"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyPreset, createCustomField, deleteCustomField, inviteUser, setUserRole } from "@/lib/data/presets";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { BusinessType } from "@/types/domain";

type Preset = { business_type: BusinessType; name: string; description: string; icon: string };
type Field = { id: string; key: string; name: string; type: string };
type Member = { id: string; full_name: string; email: string; role: string; is_active: boolean };

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", gerente: "Gerente", atendente: "Atendente" };

export function SettingsPanel({
  org,
  presets,
  fields,
  team,
  myRole,
}: {
  org: { name: string; business_type: BusinessType; settings: any };
  presets: Preset[];
  fields: Field[];
  team: Member[];
  myRole: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"negocio" | "campos" | "equipe" | "atendimento">("negocio");

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b">
        {(
          [
            ["negocio", "Tipo de negócio"],
            ["campos", "Campos personalizados"],
            ["equipe", "Equipe"],
            ["atendimento", "Atendimento"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "shrink-0 border-b-2 px-3 pb-2 text-sm font-semibold",
              tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "negocio" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {presets.map((p) => (
            <Card key={p.business_type} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">{p.name}</h3>
                {org.business_type === p.business_type && (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Atual</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{p.description}</p>
              <button
                onClick={async () => {
                  await applyPreset(p.business_type);
                  router.refresh();
                }}
                className="w-full rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
              >
                {org.business_type === p.business_type ? "Reaplicar campos/etapas" : "Aplicar preset"}
              </button>
            </Card>
          ))}
        </div>
      )}

      {tab === "campos" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-bold">Campos atuais</h3>
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum campo personalizado.</p>
            ) : (
              <div className="space-y-2">
                {fields.map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                    <div>
                      <span className="font-semibold">{f.name}</span>
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">{f.key} · {f.type}</span>
                    </div>
                    <button
                      onClick={async () => { await deleteCustomField(f.id); router.refresh(); }}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-bold">Novo campo</h3>
            <form
              action={async (fd) => { await createCustomField(fd); router.refresh(); }}
              className="space-y-3"
            >
              <input name="name" required placeholder="Nome exibido (ex: Bairro)" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
              <input name="key" required placeholder="chave (ex: bairro)" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
              <select name="type" className="w-full rounded-xl border bg-background px-3 py-2 text-sm">
                {["text", "number", "date", "select", "currency"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input name="options" placeholder="Opções p/ select, separadas por vírgula" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
              <button type="submit" className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
                Adicionar campo
              </button>
            </form>
          </Card>
        </div>
      )}

      {tab === "equipe" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
          <Card>
            <h3 className="mb-3 text-sm font-bold">Membros ({team.length})</h3>
            <div className="space-y-2">
              {team.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                  <div>
                    <p className="font-semibold">{m.full_name || m.email}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  {myRole === "admin" && m.role !== "admin" ? (
                    <select
                      defaultValue={m.role}
                      onChange={async (e) => { await setUserRole(m.id, e.target.value); router.refresh(); }}
                      className="rounded-lg border bg-background px-2 py-1 text-xs"
                    >
                      <option value="gerente">Gerente</option>
                      <option value="atendente">Atendente</option>
                    </select>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground">{ROLE_LABEL[m.role] ?? m.role}</Badge>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {myRole === "admin" && (
            <Card>
              <h3 className="mb-3 text-sm font-bold">Convidar usuário</h3>
              <form action={async (fd) => { await inviteUser(fd); router.refresh(); }} className="space-y-3">
                <input name="full_name" placeholder="Nome" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
                <input name="email" type="email" required placeholder="e-mail" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
                <select name="role" className="w-full rounded-xl border bg-background px-3 py-2 text-sm">
                  <option value="atendente">Atendente</option>
                  <option value="gerente">Gerente</option>
                </select>
                <button type="submit" className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
                  Enviar convite
                </button>
                <p className="text-[11px] text-muted-foreground">
                  O usuário recebe um e-mail para definir a senha e já entra na organização.
                </p>
              </form>
            </Card>
          )}
        </div>
      )}

      {tab === "atendimento" && (
        <Card className="space-y-3">
          <h3 className="text-sm font-bold">Horário e distribuição</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <ReadField label="Horário de atendimento" value={org.settings?.horario_atendimento ?? "—"} />
            <ReadField label="Fuso horário" value={org.settings?.timezone ?? "America/Sao_Paulo"} />
          </div>
          <p className="text-xs text-muted-foreground">
            Regras de distribuição entre atendentes e mensagem fora do horário são configuradas por agente
            (aba Handoff) e nas regras de lembrete do Calendário.
          </p>
        </Card>
      )}
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
