"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  takeoverConversation,
  reactivateBot,
  addInternalNote,
  sendHumanMessage,
} from "@/lib/data/actions";
import { Badge } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
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

export function Inbox({
  initialConversations,
  initialMessages,
  initialNotes,
  organizationId,
}: {
  initialConversations: Conv[];
  initialMessages: Record<string, Msg[]>;
  initialNotes: Record<string, Note[]>;
  organizationId: string;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [messages, setMessages] = useState(initialMessages);
  const [notes, setNotes] = useState(initialNotes);
  const [channelFilter, setChannelFilter] = useState<"all" | ChannelType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "bot" | "humano">("all");
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"message" | "note">("message");

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
          setMessages((prev) => ({
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
          setConversations((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...c } : x)));
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

  async function handleSend() {
    if (!input.trim() || !active) return;
    const text = input.trim();
    setInput("");
    if (mode === "note") {
      await addInternalNote(active.id, text);
      setNotes((prev) => ({
        ...prev,
        [active.id]: [
          { id: `tmp_${Date.now()}`, content: text, created_at: new Date().toISOString() },
          ...(prev[active.id] ?? []),
        ],
      }));
    } else {
      await sendHumanMessage(active.id, text);
      setMessages((prev) => ({
        ...prev,
        [active.id]: [
          ...(prev[active.id] ?? []),
          {
            id: `tmp_${Date.now()}`,
            direction: "out",
            sender_type: "user",
            content: text,
            created_at: new Date().toISOString(),
            status: "enviada",
          },
        ],
      }));
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
                    {c.last_message_at ? formatDateTime(c.last_message_at) : ""}
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
          <div className="flex items-center justify-between border-b p-3">
            <div>
              <p className="text-sm font-bold">{active.contact?.name ?? "Contato"}</p>
              <p className="text-xs text-muted-foreground">
                {CHANNEL_LABEL[active.channel_type]} · {active.contact?.phone ?? ""}
              </p>
            </div>
            {active.bot_active ? (
              <button
                onClick={() => void takeoverConversation(active.id)}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
              >
                Assumir conversa
              </button>
            ) : (
              <button
                onClick={() => void reactivateBot(active.id)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
              >
                Reativar bot (IA)
              </button>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
            {activeMessages.length === 0 && (
              <p className="text-center text-xs text-muted-foreground">Sem mensagens.</p>
            )}
            {activeMessages.map((m) => {
              const inbound = m.direction === "in";
              const isAi = m.sender_type === "agent_ai";
              return (
                <div key={m.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
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
