"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyPreset, createCustomField, deleteCustomField, inviteUser, setUserRole, updateOrganizationName } from "@/lib/data/presets";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { BusinessType, UserRole } from "@/types/domain";

type Preset = { business_type: BusinessType; name: string; custom_fields: any[]; pipeline_stages: any[] };
type Field = { id: string; key: string; label: string; type: string };
type Member = { id: string; full_name: string; email: string; role: UserRole; is_active: boolean };

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", gerente: "Gerente", atendente: "Atendente" };

export function SettingsPanel({
  org,
  presets,
  fields,
  team,
  myRole,
}: {
  org: { name: string; business_type: BusinessType; timezone?: string; out_of_hours_message?: string };
  presets: Preset[];
  fields: Field[];
  team: Member[];
  myRole: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"negocio" | "campos" | "equipe" | "atendimento">("negocio");
  const [orgName, setOrgName] = useState(org.name);
  const [nameNote, setNameNote] = useState("");
  const [savingName, setSavingName] = useState(false);

  async function saveOrgName() {
    const clean = orgName.trim();
    if (!clean || clean === org.name) {
      setOrgName(org.name);
      return;
    }
    setSavingName(true);
    try {
      await updateOrganizationName(clean);
      setNameNote("Nome atualizado");
      router.refresh();
    } catch (e) {
      setNameNote(`Erro: ${(e as Error).message}`);
    } finally {
      setSavingName(false);
    }
  }

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
          {/* Nome da organização ({{nome_agente}}/{{nome_empresa}} nos prompts) */}
          <Card className="space-y-2 sm:col-span-2">
            <h3 className="text-sm font-bold">Nome da empresa</h3>
            <p className="text-xs text-muted-foreground">
              Usado como <span className="font-mono">{"{{nome_empresa}}"}</span> nos prompts dos agentes de IA.
            </p>
            <div className="flex gap-2">
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                onBlur={() => void saveOrgName()}
                onKeyDown={(e) => e.key === "Enter" && void saveOrgName()}
                placeholder="Nome da empresa"
                className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                disabled={savingName || !orgName.trim() || orgName.trim() === org.name}
                onClick={() => void saveOrgName()}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {savingName ? "Salvando..." : "Salvar"}
              </button>
            </div>
            {nameNote && <p className="text-[11px] text-emerald-600">{nameNote}</p>}
          </Card>

          {presets.map((p) => (
            <Card key={p.business_type} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">{p.name}</h3>
                {org.business_type === p.business_type && (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Atual</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Configura automaticamente funil de vendas, campos customizados e etiquetas para {p.name}.
              </p>
              <button
                onClick={async () => {
                  await applyPreset(p.business_type);
                  router.refresh();
                }}
                className="w-full rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
              >
                {org.business_type === p.business_type ? "Reaplicar configuração do nicho" : `Mudar para ${p.name}`}
              </button>
            </Card>
          ))}
        </div>
      )}

      {tab === "campos" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-bold">Campos personalizados atuais</h3>
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum campo personalizado.</p>
            ) : (
              <div className="space-y-2">
                {fields.map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                    <div>
                      <span className="font-semibold">{f.label}</span>
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
              <input name="name" required placeholder="Rótulo visível (ex: Bairro de interesse)" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
              <input name="key" required placeholder="chave_sem_espaco (ex: bairro_interesse)" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
              <select name="type" className="w-full rounded-xl border bg-background px-3 py-2 text-sm">
                {["text", "number", "date", "select", "currency"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input name="options" placeholder="Opções para select, separadas por vírgula" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
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
              <h3 className="mb-3 text-sm font-bold">Convidar atendente / gerente</h3>
              <form action={async (fd) => { await inviteUser(fd); router.refresh(); }} className="space-y-3">
                <input name="full_name" placeholder="Nome completo" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
                <input name="email" type="email" required placeholder="E-mail" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
                <select name="role" className="w-full rounded-xl border bg-background px-3 py-2 text-sm">
                  <option value="atendente">Atendente</option>
                  <option value="gerente">Gerente</option>
                </select>
                <button type="submit" className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
                  Enviar convite
                </button>
                <p className="text-[11px] text-muted-foreground">
                  O usuário recebe um link para definir sua senha de acesso.
                </p>
              </form>
            </Card>
          )}
        </div>
      )}

      {tab === "atendimento" && (
        <Card className="space-y-3">
          <h3 className="text-sm font-bold">Horário de funcionamento e regras</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">Fuso horário</p>
              <p className="font-semibold">{org.timezone ?? "America/Sao_Paulo"}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">Horário padrão</p>
              <p className="font-semibold">Segunda a Sexta, 09:00 às 18:00</p>
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">Mensagem fora do expediente</p>
            <p className="text-sm">{org.out_of_hours_message || "Estamos fora do horário de atendimento. Retornaremos em breve."}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
