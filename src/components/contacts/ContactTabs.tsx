"use client";

import { useState } from "react";
import { updateContact } from "@/lib/data/actions";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { formatBRL, formatDateTime } from "@/lib/utils";
import { CHANNEL_LABEL, type ChannelType } from "@/types/domain";

type FieldDef = { key: string; name: string; type: string };
type Tab = "dados" | "conversas" | "oportunidades" | "agendamentos" | "historico";

export function ContactTabs({
  contact,
  customFields,
  opportunities,
  appointments,
  activities,
  conversations,
}: {
  contact: any;
  customFields: FieldDef[];
  opportunities: any[];
  appointments: any[];
  activities: any[];
  conversations: any[];
}) {
  const [tab, setTab] = useState<Tab>("dados");
  const [saving, setSaving] = useState(false);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "dados", label: "Dados" },
    { id: "conversas", label: "Conversas", count: conversations.length },
    { id: "oportunidades", label: "Oportunidades", count: opportunities.length },
    { id: "agendamentos", label: "Agendamentos", count: appointments.length },
    { id: "historico", label: "Histórico", count: activities.length },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 border-b-2 px-3 pb-2 text-sm font-semibold transition-colors ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px]">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "dados" && (
        <Card>
          <form
            action={async (fd) => {
              setSaving(true);
              try {
                await updateContact(fd);
              } finally {
                setSaving(false);
              }
            }}
            className="space-y-4"
          >
            <input type="hidden" name="id" value={contact.id} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input name="name" label="Nome" defaultValue={contact.name} required />
              <Input name="phone" label="Telefone" defaultValue={contact.phone ?? ""} />
              <Input name="email" label="E-mail" defaultValue={contact.email ?? ""} />
              <Input name="company" label="Empresa" defaultValue={contact.company ?? ""} />
              <Input name="city" label="Cidade" defaultValue={contact.city ?? ""} />
              <Input name="state" label="UF" defaultValue={contact.state ?? ""} />
            </div>

            {customFields.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Campos do tipo de negócio
                </p>
                <CustomFieldsEditor
                  defs={customFields}
                  initial={contact.custom_fields}
                />
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {tab === "conversas" && (
        conversations.length === 0 ? <EmptyState label="Nenhuma conversa." /> : (
          <div className="space-y-2">
            {conversations.map((c) => (
              <Card key={c.id} className="flex items-center justify-between">
                <div>
                  <Badge className="bg-accent text-accent-foreground">
                    {CHANNEL_LABEL[c.channel as ChannelType] ?? c.channel}
                  </Badge>
                  <span className="ml-3 text-sm text-muted-foreground">
                    {c.last_message_at ? formatDateTime(c.last_message_at) : "—"}
                  </span>
                </div>
                <Badge className="bg-muted text-muted-foreground">{c.status}</Badge>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === "oportunidades" && (
        opportunities.length === 0 ? <EmptyState label="Nenhuma oportunidade." /> : (
          <div className="space-y-2">
            {opportunities.map((o) => (
              <Card key={o.id} className="flex items-center justify-between">
                <span className="font-semibold">{o.title ?? "Oportunidade"}</span>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-emerald-600">{formatBRL(Number(o.value))}</span>
                  <Badge className="bg-muted text-muted-foreground">{o.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === "agendamentos" && (
        appointments.length === 0 ? <EmptyState label="Nenhum agendamento." /> : (
          <div className="space-y-2">
            {appointments.map((a) => (
              <Card key={a.id} className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(a.starts_at)}</p>
                </div>
                <Badge className="bg-muted text-muted-foreground">{a.status}</Badge>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === "historico" && (
        activities.length === 0 ? <EmptyState label="Nenhuma interação registrada." /> : (
          <div className="space-y-2">
            {activities.map((a) => (
              <Card key={a.id}>
                <div className="flex items-center gap-2">
                  <Badge className="bg-accent text-accent-foreground">{a.type}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTime(a.occurred_at)}</span>
                </div>
                <p className="mt-1.5 text-sm">{a.title ?? a.body}</p>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function Input({ name, label, defaultValue, required }: { name: string; label: string; defaultValue?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

/** Editor de campos JSONB — serializa o conjunto num único input oculto. */
function CustomFieldsEditor({ defs, initial }: { defs: FieldDef[]; initial: Record<string, unknown> }) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const d of defs) out[d.key] = initial?.[d.key] != null ? String(initial[d.key]) : "";
    return out;
  });

  return (
    <>
      <input type="hidden" name="custom_fields" value={JSON.stringify(values)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {defs.map((d) => (
          <div key={d.key}>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">{d.name}</label>
            <input
              value={values[d.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [d.key]: e.target.value }))}
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ))}
      </div>
    </>
  );
}
