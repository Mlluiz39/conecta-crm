"use client";

import { useState, useTransition } from "react";
import { Flame, Snowflake, Sun } from "lucide-react";
import { updateContact, setLeadTemperature, saveLeadOpportunity } from "@/lib/data/actions";
import { useNotify } from "@/components/ui/dialog-provider";
import { TEMPERATURE_TAGS, type LeadTemperature } from "@/lib/data/lead-temperature";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { formatBRL, formatDateTime } from "@/lib/utils";
import { CHANNEL_LABEL, type ChannelType } from "@/types/domain";

type FieldDef = { key: string; label: string; type: string; options?: string[] };
type Tab = "dados" | "conversas" | "oportunidades" | "agendamentos" | "historico";

export function ContactTabs({
  contact,
  customFields,
  opportunities,
  appointments,
  notes,
  conversations,
  temperature = null,
  tags = [],
}: {
  contact: any;
  customFields: FieldDef[];
  opportunities: any[];
  appointments: any[];
  notes: any[];
  conversations: any[];
  /** Temperatura atual (etiqueta) do contato */
  temperature?: LeadTemperature | null;
  /** Todas as etiquetas do contato */
  tags?: { name: string; color: string }[];
}) {
  const [tab, setTab] = useState<Tab>("dados");
  const [saving, setSaving] = useState(false);
  const [temp, setTemp] = useState<LeadTemperature | null>(temperature);
  const [dealValue, setDealValue] = useState(
    opportunities[0]?.value ? String(opportunities[0].value) : "",
  );
  const [tempPending, startTempTransition] = useTransition();
  const notify = useNotify();

  function changeTemperature(next: LeadTemperature) {
    const target = temp === next ? null : next;
    const previous = temp;
    setTemp(target);
    startTempTransition(async () => {
      try {
        await setLeadTemperature(contact.id, target);
        notify(target ? `Etiqueta: ${TEMPERATURE_TAGS[target].name}` : "Etiqueta de temperatura removida");
      } catch (e) {
        setTemp(previous);
        notify((e as Error).message.replace(/^Error:\s*/, ""), "error");
      }
    });
  }

  function saveValue() {
    const numeric = Number(dealValue.replace(/[^\d,.]/g, "").replace(".", "").replace(",", "."));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      notify("Informe o valor do serviço", "error");
      return;
    }
    startTempTransition(async () => {
      try {
        await saveLeadOpportunity({ contactId: contact.id, value: numeric });
        notify(`Oportunidade salva: ${formatBRL(numeric)}`);
      } catch (e) {
        notify((e as Error).message.replace(/^Error:\s*/, ""), "error");
      }
    });
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "dados", label: "Dados" },
    { id: "conversas", label: "Conversas", count: conversations.length },
    { id: "oportunidades", label: "Oportunidades", count: opportunities.length },
    { id: "agendamentos", label: "Agendamentos", count: appointments.length },
    { id: "historico", label: "Anotações", count: notes.length },
  ];

  const custom = contact.custom_fields || {};

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
              <Input name="instagram_handle" label="Instagram (@)" defaultValue={contact.instagram_handle ?? ""} />
              <Input name="company" label="Empresa" defaultValue={custom.empresa ?? ""} />
              <Input name="city" label="Cidade" defaultValue={custom.cidade ?? ""} />
              <Input name="state" label="UF" defaultValue={custom.estado ?? ""} />
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

          <div className="mt-5 grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Temperatura do lead
              </p>
              <div className="flex items-center gap-2">
                {(
                  [
                    ["frio", Snowflake],
                    ["morno", Sun],
                    ["quente", Flame],
                  ] as [LeadTemperature, typeof Flame][]
                ).map(([key, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={tempPending}
                    onClick={() => changeTemperature(key)}
                    title={TEMPERATURE_TAGS[key].name}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                      temp === key
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <Icon size={14} />
                    {TEMPERATURE_TAGS[key].name.replace("Lead ", "")}
                  </button>
                ))}
              </div>

              {tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <span
                      key={t.name}
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: `${t.color}20`, color: t.color }}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Valor do serviço (oportunidade)
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveValue();
                  }}
                  placeholder="ex.: 2.500,00"
                  className="w-40 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={saveValue}
                  disabled={tempPending}
                  className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Salvar valor
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {opportunities.length > 0
                  ? `Oportunidade atual: ${formatBRL(Number(opportunities[0].value))} · veja a aba Oportunidades`
                  : "Ainda sem oportunidade — salvar cria uma no funil."}
              </p>
            </div>
          </div>
        </Card>
      )}

      {tab === "conversas" && (
        conversations.length === 0 ? <EmptyState label="Nenhuma conversa." /> : (
          <div className="space-y-2">
            {conversations.map((c) => (
              <Card key={c.id} className="flex items-center justify-between">
                <div>
                  <Badge className="bg-accent text-accent-foreground">
                    {CHANNEL_LABEL[c.channel_type as ChannelType] ?? c.channel_type}
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
                <span className="font-bold text-emerald-600">{formatBRL(Number(o.value))}</span>
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
        notes.length === 0 ? <EmptyState label="Nenhuma anotação registrada." /> : (
          <div className="space-y-2">
            {notes.map((n) => (
              <Card key={n.id}>
                <span className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</span>
                <p className="mt-1 text-sm">{n.content}</p>
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
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">{d.label}</label>
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
