"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  takeoverConversation,
  reactivateBot,
  addInternalNote,
  sendHumanMessage,
  deleteMessage,
  clearConversationMessages,
} from "@/lib/data/actions";
import { Badge } from "@/components/ui/primitives";
import { useConfirm, useNotify } from "@/components/ui/dialog-provider";
import { pollFetch, startPolling } from "@/lib/client/poll";
import { formatDateTime } from "@/lib/utils";
import { useTypingConversations } from "@/components/conversas/useTyping";
import { CHANNEL_LABEL, type ChannelType } from "@/types/domain";

type Conv = {
  id: string;
  channel_type: ChannelType;
  status: string;
  bot_active: boolean;
  unread_count: number;
  last_message_at: string | null;
  agent: { name: string } | null;
  contact: { id: string; name: string; phone: string | null } | null;
};

type Msg = {
  id: string;
  direction: "in" | "out";
  sender_type: "contact" | "agent_ai" | "user" | "system";
  content: string | null;
  created_at: string;
  status: string;
};

type Note = { id: string; content: string; created_at: string };

const CHANNEL_DOT: Record<string, string> = {
  whatsapp: "bg-emerald-500",
  instagram: "bg-pink-500",
  messenger: "bg-blue-500",
};

/** Mesma mensagem? (id igual ou mesmo texto/direção em até 3 min — evita duplicar otimista + real) */
function sameMessage(a: Msg, b: Msg): boolean {
  if (a.id === b.id) return true;
  if (a.content !== b.content || a.direction !== b.direction || a.sender_type !== b.sender_type) return false;
  return Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < 180_000;
}

function sameNote(a: Note, b: Note): boolean {
  if (a.id === b.id) return true;
  if (a.content !== b.content) return false;
  return Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < 180_000;
}

/** Ajuste local (otimista) que expira sozinho, para nunca mascarar o estado real do servidor. */
type Patch<T> = { value: Partial<T>; at: number };
const PATCH_TTL_MS = 8_000;

export function Inbox({
  initialConversations,
  initialMessages,
  initialNotes,
  organizationId,
  initialActiveId,
}: {
  initialConversations: Conv[];
  initialMessages: Record<string, Msg[]>;
  initialNotes: Record<string, Note[]>;
  organizationId: string;
  initialActiveId?: string;
}) {
  const router = useRouter();
  const notify = useNotify();
  const confirmDialog = useConfirm();

  // Estado derivado das props (nunca um snapshot congelado): o servidor manda o
  // estado novo depois de cada action e a tela acompanha; os ajustes otimistas
  // ficam por cima por alguns segundos e caem sozinhos.
  const [patches, setPatches] = useState<Record<string, Patch<Conv>>>({});
  const [extraMessages, setExtraMessages] = useState<Record<string, Msg[]>>({});
  const [extraNotes, setExtraNotes] = useState<Record<string, Note[]>>({});
  const [tick, setTick] = useState(() => Date.now());
  const [botBusy, setBotBusy] = useState<null | "assumir" | "reativar">(null);
  /** Mensagens apagadas nesta sessão: saem da tela na hora (o servidor confirma depois). */
  const [removed, setRemoved] = useState<Record<string, true>>({});
  const [busyMsg, setBusyMsg] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 2_000);
    return () => clearInterval(id);
  }, []);

  const conversations = useMemo(
    () =>
      initialConversations.map((c) => {
        const patch = patches[c.id];
        return patch && tick - patch.at < PATCH_TTL_MS ? { ...c, ...patch.value } : c;
      }),
    [initialConversations, patches, tick],
  );

  const messages = useMemo(() => {
    const out: Record<string, Msg[]> = {};
    for (const [conversationId, list] of Object.entries(initialMessages)) {
      out[conversationId] = list;
    }
    for (const [conversationId, list] of Object.entries(extraMessages)) {
      const base = out[conversationId] ?? [];
      out[conversationId] = [...base, ...list.filter((m) => !base.some((b) => sameMessage(b, m)))];
    }
    for (const conversationId of Object.keys(out)) {
      if (Object.keys(removed).length === 0) break;
      const filtradas = out[conversationId].filter((m) => !removed[m.id]);
      if (filtradas.length !== out[conversationId].length) out[conversationId] = filtradas;
    }
    return out;
  }, [initialMessages, extraMessages, removed]);

  const notes = useMemo(() => {
    const out: Record<string, Note[]> = { ...initialNotes };
    for (const [conversationId, list] of Object.entries(extraNotes)) {
      const base = out[conversationId] ?? [];
      out[conversationId] = [...list.filter((n) => !base.some((b) => sameNote(b, n))), ...base];
    }
    return out;
  }, [initialNotes, extraNotes]);

  function patchConversation(conversationId: string, value: Partial<Conv>) {
    setPatches((prev) => ({ ...prev, [conversationId]: { value, at: Date.now() } }));
  }

  const [activeId, setActiveId] = useState<string | null>(initialActiveId ?? initialConversations[0]?.id ?? null);
  const [channelFilter, setChannelFilter] = useState<"all" | ChannelType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "bot" | "humano">("all");
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"message" | "note">("message");

  const typingMap = useTypingConversations();
  const [botPaused, setBotPaused] = useState(false);

  // estado global do bot (emergency stop do Hermes) — atualiza a cada 10s
  useEffect(() => {
    let cancelled = false;
    const stop = startPolling(async (signal) => {
      const res = await pollFetch("/api/hermes/bot-pause", signal);
      if (!res.ok) return;
      const json = (await res.json()) as { paused?: boolean };
      if (!cancelled) setBotPaused(Boolean(json.paused));
    }, 10_000);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const activeMessages = activeId ? messages[activeId] ?? [] : [];

  // Supabase Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const m = payload.new as Msg & { conversation_id: string };
          setExtraMessages((prev) => ({
            ...prev,
            [m.conversation_id]: [...(prev[m.conversation_id] ?? []), m],
          }));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const c = payload.new as Conv;
          patchConversation(c.id, c);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [organizationId]);

  const filtered = useMemo(
    () =>
      conversations.filter((c) => {
        if (channelFilter !== "all" && c.channel_type !== channelFilter) return false;
        if (statusFilter === "bot" && !c.bot_active) return false;
        if (statusFilter === "humano" && c.bot_active) return false;
        return true;
      }),
    [conversations, channelFilter, statusFilter],
  );

  /** Assumir conversa (pausa a IA) / reativar bot — com resposta imediata na tela. */
  async function handleBotAction() {
    if (!active || botBusy) return;
    const conversa = active;
    const assumindo = conversa.bot_active;
    setBotBusy(assumindo ? "assumir" : "reativar");
    patchConversation(conversa.id, { bot_active: !assumindo });

    try {
      // O flag nativo (`conversations.bot_active`) é a verdade: o motor respeita antes de
      // responder. O Hermes, quando existe, é só um bônus (pausa o turno dele também).
      if (assumindo) {
        const res = await takeoverConversation(conversa.id);
        notify(
          res.hermesPaused
            ? "Você assumiu a conversa. A IA está pausada."
            : "Você assumiu a conversa. A IA nativa parou de responder este lead.",
          "success",
        );
      } else {
        await reactivateBot(conversa.id);
        notify("Bot de IA reativado. A IA voltou a responder.", "success");
      }
    } catch (error) {
      patchConversation(conversa.id, { bot_active: assumindo });
      notify(
        (assumindo ? "Não deu para assumir: " : "Não deu para reativar: ") + (error as Error).message,
        "error",
      );
    } finally {
      setBotBusy(null);
      router.refresh();
    }
  }

  /** Apaga uma mensagem: sai do CRM e, se foi enviada por nós, também do WhatsApp do lead. */
  async function handleDeleteMessage(m: Msg) {
    if (busyMsg) return;
    const ok = await confirmDialog({
      title: "Apagar esta mensagem?",
      description:
        m.direction === "out"
          ? "Ela sai do CRM e é apagada também no WhatsApp do lead (para todos). Não dá para desfazer."
          : "Ela sai do CRM. No celular do lead não dá para apagar: o WhatsApp só permite apagar para todos as mensagens que saíram daqui.",
      confirmLabel: "Apagar",
      tone: "danger",
    });
    if (!ok) return;

    setBusyMsg(m.id);
    setRemoved((prev) => ({ ...prev, [m.id]: true }));
    try {
      const res = await deleteMessage(m.id);
      if (res.revoked > 0) {
        notify("Mensagem apagada aqui e no WhatsApp do lead.", "success");
      } else if (res.failures > 0) {
        notify(
          "Saiu do CRM, mas o WhatsApp recusou apagar no celular do lead (mensagem antiga demais?).",
          "error",
        );
      } else {
        notify("Mensagem apagada do CRM.", "success");
      }
    } catch (error) {
      setRemoved((prev) => {
        const next = { ...prev };
        delete next[m.id];
        return next;
      });
      notify("Não deu para apagar: " + (error as Error).message, "error");
    } finally {
      setBusyMsg(null);
      router.refresh();
    }
  }

  /** Limpa o histórico da conversa (o contato e a conversa continuam). */
  async function handleClearConversation() {
    if (!active || busyMsg) return;
    const conversa = active;
    const quantas = activeMessages.length;
    if (quantas === 0) {
      notify("Não há mensagens nesta conversa.", "error");
      return;
    }
    const ok = await confirmDialog({
      title: `Limpar ${quantas} mensagem(ns) desta conversa?`,
      description:
        "O contato e a conversa continuam no CRM. As mensagens que nós enviamos também são apagadas no WhatsApp do lead; as que ele escreveu saem só daqui. Não dá para desfazer.",
      confirmLabel: "Limpar histórico",
      tone: "danger",
    });
    if (!ok) return;

    setBusyMsg("__clear__");
    setRemoved((prev) => {
      const next = { ...prev };
      for (const m of activeMessages) next[m.id] = true;
      return next;
    });
    try {
      const res = await clearConversationMessages(conversa.id);
      const partes = [`${res.deleted} mensagem(ns) apagada(s) do CRM`];
      if (res.revoked > 0) partes.push(`${res.revoked} também no WhatsApp do lead`);
      if (res.failures > 0) partes.push(`${res.failures} recusada(s) pelo WhatsApp`);
      if (res.skipped > 0) partes.push(`${res.skipped} acima do teto de revogação`);
      notify(partes.join(" · "), res.failures > 0 ? "error" : "success");
    } catch (error) {
      notify("Não deu para limpar: " + (error as Error).message, "error");
      setRemoved({});
    } finally {
      setBusyMsg(null);
      router.refresh();
    }
  }

  async function handleSend() {
    if (!input.trim() || !active) return;
    const text = input.trim();
    const conversationId = active.id;
    setInput("");
    if (mode === "note") {
      setExtraNotes((prev) => ({
        ...prev,
        [conversationId]: [
          { id: `tmp_${Date.now()}`, content: text, created_at: new Date().toISOString() },
          ...(prev[conversationId] ?? []),
        ],
      }));
      try {
        await addInternalNote(conversationId, text);
        router.refresh();
      } catch (error) {
        setExtraNotes((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).filter((n) => n.content !== text),
        }));
        notify("Não deu para salvar a nota: " + (error as Error).message, "error");
      }
    } else {
      const optimistic: Msg = {
        id: `tmp_${Date.now()}`,
        direction: "out",
        sender_type: "user",
        content: text,
        created_at: new Date().toISOString(),
        status: "enviada",
      };
      setExtraMessages((prev) => ({
        ...prev,
        [conversationId]: [...(prev[conversationId] ?? []), optimistic],
      }));
      try {
        await sendHumanMessage(conversationId, text);
        router.refresh();
      } catch (error) {
        setExtraMessages((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).filter((m) => !sameMessage(m, optimistic)),
        }));
        notify("Não deu para enviar: " + (error as Error).message, "error");
      }
    }
  }

  return (
    <div className="grid h-[calc(100vh-9rem)] grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr_18rem]">
      {/* Lista */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card">
        <div className="space-y-2 border-b p-3">
          <div className="flex gap-1 text-xs">
            {(["all", "whatsapp", "instagram", "messenger"] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className={`rounded-full px-2.5 py-1 font-semibold ${
                  channelFilter === ch ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {ch === "all" ? "Todos" : CHANNEL_LABEL[ch]}
              </button>
            ))}
          </div>
          <div className="flex gap-1 text-xs">
            {([["all", "Todas"], ["bot", "🤖 Com IA"], ["humano", "👤 Humano"]] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setStatusFilter(v)}
                className={`rounded-full px-2.5 py-1 font-semibold ${
                  statusFilter === v ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa.</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`flex w-full flex-col gap-1 border-b p-3 text-left transition-colors ${
                  activeId === c.id ? "bg-accent/60" : "hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{c.contact?.name ?? "Contato"}</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full ${CHANNEL_DOT[c.channel_type] ?? "bg-slate-400"}`} />
                    {typingMap[c.id] ? (
                      <span className="font-semibold text-emerald-600">digitando…</span>
                    ) : c.last_message_at ? (
                      formatDateTime(c.last_message_at)
                    ) : (
                      ""
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {c.bot_active ? (
                    <Badge className="bg-primary/10 text-primary">🤖 {c.agent?.name ?? "IA"}</Badge>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground">👤 Humano</Badge>
                  )}
                  {c.unread_count > 0 && (
                    <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {c.unread_count}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread */}
      {active ? (
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card">
          {botPaused && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              <span className="font-bold">⏸️ Bot pausado — você está no controle.</span>
              <span className="text-amber-700/80">
                A IA não responde novos turnos até você retomar. Pelo celular: mande{" "}
                <code className="rounded bg-background px-1">/pause</code> na conversa com o bot e{" "}
                <code className="rounded bg-background px-1">/pause off</code> para voltar.
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-b p-3">
            <div>
              <p className="text-sm font-bold">{active.contact?.name ?? "Contato"}</p>
              <p className="text-xs text-muted-foreground">
                {typingMap[active.id] ? (
                  <span className="font-semibold text-emerald-600">digitando…</span>
                ) : (
                  <>
                    {CHANNEL_LABEL[active.channel_type]} · {active.contact?.phone ?? ""}
                  </>
                )}
              </p>
            </div>
            {botBusy ? (
              <button
                disabled
                className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white opacity-60 ${
                  botBusy === "assumir" ? "bg-primary" : "bg-emerald-600"
                }`}
              >
                {botBusy === "assumir" ? "Assumindo…" : "Reativando…"}
              </button>
            ) : active.bot_active ? (
              <button
                onClick={() => void handleBotAction()}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
              >
                Assumir conversa
              </button>
            ) : (
              <button
                onClick={() => void handleBotAction()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
              >
                Reativar bot (IA)
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5">
            <span className="text-[11px] text-muted-foreground">
              {activeMessages.length} mensagem(ns) no histórico
            </span>
            <button
              type="button"
              onClick={() => void handleClearConversation()}
              disabled={busyMsg === "__clear__" || activeMessages.length === 0}
              title="Apagar todas as mensagens desta conversa (o contato continua)"
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {busyMsg === "__clear__" ? "Limpando…" : "Limpar histórico"}
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
            {activeMessages.length === 0 && (
              <p className="text-center text-xs text-muted-foreground">Sem mensagens.</p>
            )}
            {activeMessages.map((m) => {
              const inbound = m.direction === "in";
              const isAi = m.sender_type === "agent_ai";
              const apagar = (
                <button
                  type="button"
                  onClick={() => void handleDeleteMessage(m)}
                  disabled={busyMsg === m.id}
                  title={inbound ? "Apagar do CRM (o celular do lead não é afetado)" : "Apagar aqui e no WhatsApp do lead"}
                  aria-label="Apagar mensagem"
                  className="mb-4 shrink-0 rounded-lg border border-border/60 bg-background p-1 text-muted-foreground opacity-60 transition-opacity hover:border-destructive/40 hover:text-destructive hover:opacity-100 disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              );
              return (
                <div
                  key={m.id}
                  className={`group flex items-end gap-1.5 ${inbound ? "justify-start" : "justify-end"}`}
                >
                  {!inbound && apagar}
                  <div className={`max-w-[75%] ${inbound ? "text-left" : "text-right"}`}>
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm ${
                        inbound
                          ? "bg-card border"
                          : isAi
                            ? "bg-primary text-primary-foreground"
                            : "bg-emerald-600 text-white"
                      }`}
                    >
                      {m.content}
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {isAi ? "🤖 IA · " : m.sender_type === "user" ? "👤 Atendente · " : ""}
                      {formatDateTime(m.created_at)}
                    </p>
                  </div>
                  {inbound && apagar}
                </div>
              );
            })}
          </div>

          <div className="border-t p-3">
            <div className="mb-2 flex gap-1 text-xs">
              <button
                onClick={() => setMode("message")}
                className={`rounded-lg px-2.5 py-1 font-semibold ${mode === "message" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                Mensagem
              </button>
              <button
                onClick={() => setMode("note")}
                className={`rounded-lg px-2.5 py-1 font-semibold ${mode === "note" ? "bg-amber-500 text-white" : "text-muted-foreground"}`}
              >
                Nota interna
              </button>
            </div>
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={2}
                placeholder={mode === "note" ? "Anotação visível só para a equipe..." : "Digite uma mensagem..."}
                className={`flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring ${
                  mode === "note" ? "bg-amber-50 dark:bg-amber-950/30" : "bg-background"
                }`}
              />
              <button
                onClick={() => void handleSend()}
                className={`rounded-xl px-4 text-sm font-bold text-white ${mode === "note" ? "bg-amber-500" : "bg-primary"}`}
              >
                {mode === "note" ? "Salvar" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground">
          Selecione uma conversa
        </div>
      )}

      {/* Painel lateral */}
      {active && (
        <div className="hidden min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border bg-card p-4 lg:flex">
          <div>
            <p className="text-sm font-bold">Dados do contato</p>
            <div className="mt-2 space-y-1 text-sm">
              <p className="font-semibold">{active.contact?.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{active.contact?.phone ?? "Sem telefone"}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Notas internas
            </p>
            {(notes[active.id] ?? []).length === 0 ? (
              <p className="text-xs italic text-muted-foreground">Nenhuma nota registrada.</p>
            ) : (
              <div className="space-y-2">
                {(notes[active.id] ?? []).map((n) => (
                  <div key={n.id} className="rounded-xl border bg-muted/30 p-2.5 text-xs">
                    <p className="text-[10px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
                    <p>{n.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-muted/30 p-3 text-xs">
            <p className="font-semibold">Status do atendimento</p>
            <p className="mt-1 text-muted-foreground">
              {active.bot_active
                ? `Agente IA "${active.agent?.name ?? "—"}" respondendo automaticamente`
                : "Atendimento humano ativo"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
