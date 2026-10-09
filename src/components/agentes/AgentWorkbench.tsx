"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  saveDraft,
  publishDraft,
  restoreVersion,
  setAgentChannel,
  toggleTool,
  toggleRule,
  toggleAgentActive,
  createAgent,
  updateAgentRole,
  updateAgentName,
  updateAgentMemory,
} from "@/lib/data/actions";
import { Badge, Card } from "@/components/ui/primitives";
import { AGENT_ROLE_LABEL, AGENT_TONE_LABEL, CHANNEL_LABEL, HANDOFF_RULE_LABEL, TOOL_LABEL } from "@/types/domain";
import type { AgentRole, AgentTone, AgentToolKey, ChannelType, HandoffRuleKey } from "@/types/domain";

type Agent = {
  id: string;
  name: string;
  role: AgentRole;
  tone: AgentTone;
  is_active: boolean;
  manager_agent_id?: string | null;
};
type Version = { id: string; version: number; prompt: string; status: string; created_at: string };
type Channel = { channel: ChannelType; is_active: boolean };
type Tool = { tool_key: AgentToolKey; enabled: boolean };
type Rule = { rule_key: HandoffRuleKey; enabled: boolean };
type Memory = { id: string; key: string; content: string; updated_at: string };

const CHANNELS: ChannelType[] = ["whatsapp", "telegram", "instagram", "messenger"];
const ALL_TOOLS: AgentToolKey[] = [
  "buscar_informacoes",
  "agendar_visita",
  "derivar_para_atendente",
  "atualizar_contato",
  "mover_etapa_funil",
];
const ALL_RULES: HandoffRuleKey[] = [
  "cliente_pede_humano",
  "sentimento_negativo",
  "falhas_seguidas",
  "fora_do_horario",
];
const VARS = ["{{nome_empresa}}", "{{nome_contato}}", "{{horario_atendimento}}", "{{canal}}", "{{nome_agente}}"];

export function AgentWorkbench({
  agents,
  selectedId,
  detail,
}: {
  agents: Agent[];
  selectedId: string | null;
  detail:
    | { versions: Version[]; channels: Channel[]; tools: Tool[]; rules: Rule[]; memories: Memory[] }
    | null;
}) {
  const [tab, setTab] = useState<"prompt" | "memoria" | "canais" | "ferramentas" | "handoff" | "playground">("prompt");
  const [creating, setCreating] = useState(false);
  /**
   * O painel abre em **só leitura**: olhar um agente não pode mexer nele. Trocar de agente pelo
   * menu lateral também volta ao modo leitura, para ninguém editar o agente errado por engano.
   */
  const [editing, setEditing] = useState(false);
  const agent = agents.find((a) => a.id === selectedId);

  useEffect(() => {
    setEditing(false);
  }, [selectedId]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Coluna: lista de agentes */}
      <div className="space-y-3 lg:col-span-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Meus Agentes ({agents.length})</h2>
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground"
          >
            + Novo
          </button>
        </div>

        {agents.map((a) => (
          <a
            key={a.id}
            href={`/agentes?agent=${a.id}`}
            className={`block rounded-2xl border p-4 transition-colors ${
              a.id === selectedId ? "border-primary ring-2 ring-primary/20" : "hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{a.name}</span>
              <span className={`h-2 w-2 rounded-full ${a.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge className="bg-primary/10 text-primary">{AGENT_ROLE_LABEL[a.role]}</Badge>
              <span className="text-[10px] text-muted-foreground">{AGENT_TONE_LABEL[a.tone] ?? a.tone}</span>
            </div>
          </a>
        ))}
      </div>

      {/* Coluna: editor */}
      <div className="lg:col-span-5">
        {!detail || !selectedId || !agent ? (
          <Card className="text-sm text-muted-foreground">Selecione ou crie um agente.</Card>
        ) : (
          <Card key={selectedId} className="space-y-4">
            {/* Cabeçalho: quem está selecionado e em que modo o painel está */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-bold">{agent.name}</h3>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${agent.is_active ? "bg-emerald-500" : "bg-slate-400"}`}
                  />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge className="bg-primary/10 text-primary">{AGENT_ROLE_LABEL[agent.role]}</Badge>
                  <span className="text-[10px] text-muted-foreground">{AGENT_TONE_LABEL[agent.tone] ?? agent.tone}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {agent.is_active ? "· ativo" : "· inativo"} · {editing ? "editando" : "só leitura"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setEditing((v) => !v)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                  editing
                    ? "border text-muted-foreground hover:bg-accent"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                {editing ? (
                  "Cancelar edição"
                ) : (
                  <>
                    <Pencil size={12} /> Editar
                  </>
                )}
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto border-b pb-2 text-xs font-bold">
              {(
                [
                  ["prompt", "Prompt"],
                  ["memoria", "Memória"],
                  ["canais", "Canais"],
                  ["ferramentas", "Ferramentas"],
                  ["handoff", "Handoff"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`shrink-0 border-b-2 px-2 pb-1.5 ${
                    tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* `key` por modo: sair da edição descarta o que não foi salvo, como o botão promete */}
            <div key={editing ? "edicao" : "leitura"}>
              {tab === "prompt" && (
                <PromptTab agentId={selectedId} agents={agents} versions={detail.versions} editing={editing} />
              )}
              {tab === "memoria" && (
                <MemoryTab agentId={selectedId} memories={detail.memories ?? []} editing={editing} />
              )}
              {tab === "canais" && <ChannelsTab agentId={selectedId} channels={detail.channels} editing={editing} />}
              {tab === "ferramentas" && <ToolsTab agentId={selectedId} tools={detail.tools} editing={editing} />}
              {tab === "handoff" && <RulesTab agentId={selectedId} rules={detail.rules} editing={editing} />}
            </div>
          </Card>
        )}
      </div>

      {/* Coluna: playground */}
      <div className="lg:col-span-4">
        <Playground
          agentId={selectedId}
          activeAgent={agents.find((a) => a.id === selectedId)}
        />
      </div>

      {creating && <NewAgentModal onClose={() => setCreating(false)} />}
    </div>
  );
}

/* ─────────────────────────── Prompt ─────────────────────────── */

function PromptTab({
  agentId,
  agents,
  versions,
  editing,
}: {
  agentId: string;
  agents: Agent[];
  versions: Version[];
  editing: boolean;
}) {
  const agent = agents.find((a) => a.id === agentId);
  const router = useRouter();
  const published = (versions ?? []).find((v) => v.status === "published");
  const draft = (versions ?? []).find((v) => v.status === "draft");
  const [text, setText] = useState(draft?.prompt ?? published?.prompt ?? "");
  const [saving, startSaving] = useTransition();
  const [note, setNote] = useState("");
  const [improving, setImproving] = useState(false);
  const [agentName, setAgentName] = useState(agent?.name ?? "");
  const dirtyName = agentName.trim().length > 0 && agentName.trim() !== (agent?.name ?? "");

  if (!agent) {
    return <div className="text-xs text-muted-foreground p-3">Agente não encontrado.</div>;
  }

  function saveName() {
    if (!dirtyName || saving) return;
    startSaving(async () => {
      await updateAgentName(agentId, agentName.trim());
      router.refresh();
      setNote("Nome atualizado");
    });
  }
  const [templates, setTemplates] = useState<{ id: string; name: string; prompt: string }[]>([]);

  // Modelos iniciais por função/nicho (agent_templates globais + da org).
  useEffect(() => {
    const supabase = createClient();
    void supabase
      .from("agent_templates")
      .select("id, name, prompt")
      .eq("role", agent.role)
      .order("name")
      .then(({ data }) => setTemplates((data ?? []) as any));
  }, [agent.role]);

  async function improve() {
    if (!text.trim() || improving) return;
    setImproving(true);
    setNote("");
    try {
      const res = await fetch("/api/ai/improve-prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "erro");
      setText(data.improved);
      setNote("Prompt melhorado pela IA");
    } catch (e) {
      setNote(`Erro: ${(e as Error).message}`);
    } finally {
      setImproving(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Nome do agente ({{nome_agente}} nos prompts) — só no modo edição */}
      {editing && (
        <div className="rounded-xl border bg-muted/20 p-3">
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Nome do Agente
          </label>
          <div className="flex gap-2">
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && dirtyName && saveName()}
              placeholder="Nome do agente"
              className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => void saveName()}
              disabled={!dirtyName || saving}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar nome"}
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">{"{{nome_agente}}"}</span>
            {note && <span className="text-[11px] text-emerald-600">{note}</span>}
          </div>
        </div>
      )}

      {/* Função do agente: leitura mostra o papel; edição libera a troca (que grava na hora) */}
      <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Função do Agente
          </label>
          <Badge className="bg-primary text-primary-foreground text-[10px]">
            {AGENT_ROLE_LABEL[agent.role]}
          </Badge>
        </div>
        {editing ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              Trocar a função grava no agente assim que você clica e <strong>não</strong> altera o prompt —
              use &quot;Carregar modelo inicial&quot; abaixo se quiser o texto do novo papel.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs font-semibold">
              {(["vendedor", "atendente", "suporte", "agendador"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    startSaving(async () => {
                      await updateAgentRole(agentId, r);
                      router.refresh();
                      setNote(`Função alterada para ${AGENT_ROLE_LABEL[r]}`);
                    });
                  }}
                  className={`rounded-lg py-2 px-2 text-center transition-all ${
                    agent.role === r
                      ? "bg-primary text-primary-foreground font-bold shadow-sm"
                      : "bg-background border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r === "vendedor" && "💼 "}
                  {r === "atendente" && "🎧 "}
                  {r === "suporte" && "🛠️ "}
                  {r === "agendador" && "📅 "}
                  {AGENT_ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <p className="text-[11px] text-muted-foreground italic">
          {agent.role === "vendedor" && "💼 Vendedor: Acolhe, faz perguntas de qualificação e vende valor antes de agendar."}
          {agent.role === "atendente" && "🎧 Atendente: Foco em recepção, SAC e respostas diretas sem tentar vender."}
          {agent.role === "suporte" && "🛠️ Suporte: Foco em resolver dúvidas e problemas técnicos."}
          {agent.role === "agendador" && "📅 Agendador: Foco direto em horários, confirmações e organização da agenda."}
        </p>
      </div>

      {editing && (
        <>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Versão:</span>
            {draft ? (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                rascunho v{draft.version}
              </Badge>
            ) : (
              <Badge className="bg-muted text-muted-foreground">sem rascunho</Badge>
            )}
            {published && (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                publicada v{published.version}
              </Badge>
            )}
          </div>

          {templates.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                if (t) setText(t.prompt);
              }}
              className="w-full rounded-xl border bg-background px-3 py-2 text-xs"
            >
              <option value="">Carregar modelo inicial ({agent.role})...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}

          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            <span className="text-muted-foreground">Variáveis:</span>
            {VARS.map((v) => (
              <button
                key={v}
                onClick={() => setText((t) => `${t} ${v}`)}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-primary hover:bg-accent"
              >
                {v}
              </button>
            ))}
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            className="w-full rounded-xl border bg-muted/30 p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{text.length} caracteres</span>
            {note && <span className="text-emerald-600">{note}</span>}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => void improve()}
              disabled={improving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-accent disabled:opacity-60"
            >
              <Sparkles size={13} /> {improving ? "Melhorando..." : "Melhorar prompt com IA"}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setNote("");
                  startSaving(async () => {
                    await saveDraft(agentId, text);
                    setNote("Rascunho salvo");
                  });
                }}
                disabled={saving}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent disabled:opacity-60"
              >
                Salvar rascunho
              </button>
              <button
                onClick={() => {
                  setNote("");
                  startSaving(async () => {
                    await saveDraft(agentId, text);
                    await publishDraft(agentId);
                    setNote("Versão publicada");
                  });
                }}
                disabled={saving}
                className="rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                Publicar versão
              </button>
            </div>
          </div>
        </>
      )}

      {!editing && (
        <>
          {/* O que o agente usa de verdade agora */}
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Prompt em uso
              </span>
              {published ? (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  publicada v{published.version}
                </Badge>
              ) : (
                <Badge className="bg-muted text-muted-foreground">sem versão publicada</Badge>
              )}
            </div>
            {published ? (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/60 p-2 font-mono text-xs leading-relaxed">
                {published.prompt}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">
                Este agente ainda não tem prompt publicado. Clique em <strong>Editar</strong> para escrever e
                publicar a primeira versão.
              </p>
            )}
            {published && (
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {published.prompt.length} caracteres · criada em{" "}
                {new Date(published.created_at).toLocaleDateString("pt-BR")}
              </p>
            )}
          </div>

          {/* Rascunho pendente: existe, mas não está em uso */}
          {draft && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  Rascunho pendente
                </span>
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  v{draft.version} · não está em uso
                </Badge>
              </div>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/60 p-2 font-mono text-xs leading-relaxed">
                {draft.prompt}
              </pre>
            </div>
          )}
        </>
      )}

      {versions.length > 1 && (
        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Histórico</p>
          <div className="space-y-1">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs">
                <span>
                  v{v.version} · <span className="text-muted-foreground">{v.status}</span>
                </span>
                {editing ? (
                  <button
                    onClick={() =>
                      startSaving(async () => {
                        await restoreVersion(agentId, v.id);
                        router.refresh();
                        setNote(`Versão v${v.version} restaurada`);
                      })
                    }
                    className="font-semibold text-primary hover:underline"
                  >
                    Restaurar
                  </button>
                ) : (
                  <span className="text-[10px] text-muted-foreground">edite para restaurar</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Canais ─────────────────────────── */

function ChannelsTab({
  agentId,
  channels,
  editing,
}: {
  agentId: string;
  channels?: Channel[];
  editing: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const list = channels ?? [];
  const active = list.find((c) => c.is_active)?.channel;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Apenas um agente pode estar ativo por canal.
        {editing
          ? " Escolher aqui transfere o canal para este agente."
          : " Para transferir um canal para este agente, clique em Editar."}
      </p>
      {CHANNELS.map((ch) => {
        const on = active === ch;
        if (!editing) {
          return (
            <div
              key={ch}
              className={`flex w-full items-center justify-between rounded-xl border p-3 text-sm ${
                on ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30" : "opacity-70"
              }`}
            >
              <span className="font-semibold">{CHANNEL_LABEL[ch]}</span>
              <span className={`text-xs font-bold ${on ? "text-emerald-600" : "text-muted-foreground"}`}>
                {on ? "Ativo" : "—"}
              </span>
            </div>
          );
        }
        return (
          <button
            key={ch}
            onClick={() =>
              start(async () => {
                await setAgentChannel(agentId, ch);
                router.refresh();
              })
            }
            className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm ${
              on ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30" : ""
            }`}
          >
            <span className="font-semibold">{CHANNEL_LABEL[ch]}</span>
            <span className={`text-xs font-bold ${on ? "text-emerald-600" : "text-muted-foreground"}`}>
              {on ? "Ativo" : "Ativar"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────── Ferramentas / Regras ───────────────── */

function ToolsTab({ agentId, tools, editing }: { agentId: string; tools?: Tool[]; editing: boolean }) {
  const [, start] = useTransition();
  const list = tools ?? [];
  const map = new Map(list.map((t) => [t.tool_key, t.enabled]));
  return (
    <div className="space-y-2">
      {!editing && (
        <p className="text-xs text-muted-foreground">
          Ferramentas que este agente pode usar durante o atendimento. Clique em Editar para ligar ou desligar.
        </p>
      )}
      {ALL_TOOLS.map((t) =>
        editing ? (
          <ToggleRow
            key={t}
            label={TOOL_LABEL[t]}
            code={t}
            enabled={map.get(t) ?? false}
            onChange={(v) => start(async () => { await toggleTool(agentId, t, v); })}
          />
        ) : (
          <StatusRow key={t} label={TOOL_LABEL[t]} code={t} enabled={map.get(t) ?? false} />
        ),
      )}
    </div>
  );
}

function RulesTab({ agentId, rules, editing }: { agentId: string; rules?: Rule[]; editing: boolean }) {
  const [, start] = useTransition();
  const list = rules ?? [];
  const map = new Map(list.map((r) => [r.rule_key, r.enabled]));
  return (
    <div className="space-y-2">
      {!editing && (
        <p className="text-xs text-muted-foreground">
          Quando o agente deve passar a conversa para uma pessoa. Clique em Editar para ligar ou desligar.
        </p>
      )}
      {ALL_RULES.map((r) =>
        editing ? (
          <ToggleRow
            key={r}
            label={HANDOFF_RULE_LABEL[r]}
            code={r}
            enabled={map.get(r) ?? false}
            onChange={(v) => start(async () => { await toggleRule(agentId, r, v); })}
          />
        ) : (
          <StatusRow key={r} label={HANDOFF_RULE_LABEL[r]} code={r} enabled={map.get(r) ?? false} />
        ),
      )}
    </div>
  );
}

/** Mesma linha do toggle, mas só mostrando o estado — é o que aparece no modo leitura. */
function StatusRow({ label, code, enabled }: { label: string; code: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border p-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="font-mono text-[10px] text-muted-foreground">{code}</p>
      </div>
      <span className={`text-xs font-bold ${enabled ? "text-emerald-600" : "text-muted-foreground"}`}>
        {enabled ? "Ativo" : "Desligado"}
      </span>
    </div>
  );
}

function ToggleRow({
  label,
  code,
  enabled,
  onChange,
}: {
  label: string;
  code: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border p-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="font-mono text-[10px] text-muted-foreground">{code}</p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`h-5 w-9 rounded-full p-0.5 transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/40"}`}
      >
        <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-4" : ""}`} />
      </button>
    </div>
  );
}

/* ────────────────────────── Playground ────────────────────────── */

function Playground({
  agentId,
  activeAgent,
}: {
  agentId: string | null;
  activeAgent?: Agent;
}) {
  const [version, setVersion] = useState<"draft" | "published">("published");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<
    { role: "user" | "agent"; text: string; toolCalls?: any[]; meta?: string }[]
  >([]);

  async function send() {
    if (!agentId || !input.trim() || busy) return;
    const message = input.trim();
    setInput("");
    setLog((l) => [...l, { role: "user", text: message }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/playground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId,
          message,
          version,
          history: log.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao chamar agente");
      setLog((l) => [
        ...l,
        {
          role: "agent",
          text: data.reply || (data.error ? `⚠️ ${data.error}` : "(sem resposta)"),
          toolCalls: data.toolCalls,
          meta: `${data.tokensIn}+${data.tokensOut} tokens · ${data.latencyMs}ms`,
        },
      ]);
    } catch (e) {
      setLog((l) => [...l, { role: "agent", text: `Erro: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between border-b pb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold">Playground</h3>
            {activeAgent && (
              <Badge className="bg-primary text-primary-foreground text-[10px]">
                {activeAgent.role === "vendedor" && "💼 "}
                {activeAgent.role === "atendente" && "🎧 "}
                {activeAgent.role === "suporte" && "🛠️ "}
                {activeAgent.role === "agendador" && "📅 "}
                {AGENT_ROLE_LABEL[activeAgent.role]}
              </Badge>
            )}
          </div>
          {activeAgent && (
            <p className="text-[10px] text-muted-foreground">{activeAgent.name}</p>
          )}
        </div>
        <select
          value={version}
          onChange={(e) => setVersion(e.target.value as any)}
          className="rounded-lg border bg-background px-2 py-1 text-xs"
        >
          <option value="published">Publicada</option>
          <option value="draft">Rascunho</option>
        </select>
      </div>

      <div className="min-h-65 flex-1 space-y-2 overflow-y-auto rounded-xl bg-muted/30 p-3 text-xs">
        {log.length === 0 && <p className="text-muted-foreground">Envie uma mensagem de teste.</p>}
        {log.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
            <div className="max-w-[85%]">
              <div
                className={`rounded-2xl px-3 py-2 ${
                  m.role === "user" ? "border bg-card" : "bg-primary text-primary-foreground"
                }`}
              >
                {m.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          disabled={!agentId || busy}
          placeholder={agentId ? "Mensagem de teste..." : "Selecione um agente"}
          className="flex-1 rounded-xl border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => void send()}
          disabled={busy || !agentId}
          className="rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "..." : "Enviar"}
        </button>
      </div>
    </Card>
  );
}

function MemoryTab({
  agentId,
  memories,
  editing,
}: {
  agentId: string;
  memories?: Memory[];
  editing: boolean;
}) {
  const router = useRouter();
  const list = memories ?? [];
  const memory = list.find((m) => m.key === "perfil") ?? list[0];
  const [content, setContent] = useState(memory?.content ?? "");
  const [saving, startSaving] = useTransition();

  if (!editing) {
    return (
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Memória própria do agente
            </label>
            <Badge className="bg-muted text-muted-foreground">{memory?.key ?? "perfil"}</Badge>
          </div>
          {memory?.content?.trim() ? (
            <>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl border bg-muted/30 p-3 text-xs leading-relaxed">
                {memory.content}
              </pre>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {memory.content.length} caracteres · atualizada em{" "}
                {new Date(memory.updated_at).toLocaleDateString("pt-BR")} · Editar para alterar
              </p>
            </>
          ) : (
            <p className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
              Este agente não tem memória registrada. Clique em <strong>Editar</strong> para escrever o
              contexto fixo dele (preferências, missão, regras específicas).
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Memória própria do agente
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          placeholder="Preferências, missão, contexto fixo e regras específicas deste funcionário..."
          className="w-full rounded-xl border bg-background px-3 py-2 text-xs leading-relaxed outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <button
        disabled={saving}
        onClick={() =>
          startSaving(async () => {
            await updateAgentMemory(agentId, "perfil", content);
            router.refresh();
          })
        }
        className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar memória"}
      </button>
    </div>
  );
}

/* ─────────────────────── Novo agente ─────────────────────── */

function NewAgentModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<AgentRole>("vendedor");
  const [tone, setTone] = useState<AgentTone>("consultivo");
  const [channel, setChannel] = useState<ChannelType>("whatsapp");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl">
        <h3 className="text-base font-bold">Novo Funcionário de IA</h3>
        <div className="mt-4 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do agente (ex: Lucas)"
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <select value={role} onChange={(e) => setRole(e.target.value as AgentRole)} className="rounded-xl border bg-background px-3 py-2 text-sm">
              {Object.entries(AGENT_ROLE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <select value={tone} onChange={(e) => setTone(e.target.value as AgentTone)} className="rounded-xl border bg-background px-3 py-2 text-sm">
              {Object.entries(AGENT_TONE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <select value={channel} onChange={(e) => setChannel(e.target.value as ChannelType)} className="rounded-xl border bg-background px-3 py-2 text-sm">
              {CHANNELS.map((c) => (
                <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Prompt inicial</label>
              <span className="text-[10px] text-muted-foreground">vazio = modelo do papel</span>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={7}
              placeholder={`Você é {{nome_agente}}, ${AGENT_ROLE_LABEL[role].toLowerCase()} da {{nome_empresa}}...`}
              className="w-full rounded-xl border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
              {VARS.map((v) => (
                <button
                  key={v}
                  onClick={() => setPrompt((p) => `${p} ${v}`)}
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-primary hover:bg-accent"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent">
            Cancelar
          </button>
          <button
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const fd = new FormData();
                fd.set("name", name);
                fd.set("role", role);
                fd.set("tone", tone);
                fd.set("channel", channel);
                fd.set("prompt", prompt);
                await createAgent(fd);
                onClose();
                location.reload();
              } catch (e) {
                alert(`Erro ao criar agente: ${(e as Error).message}`);
                setBusy(false);
              }
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Criando..." : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
