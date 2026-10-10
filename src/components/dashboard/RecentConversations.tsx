"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/primitives";

export type RecentConversation = {
  id: string;
  channel_type: string;
  unread_count: number;
  last_message_at: string | null;
  contact: { name?: string | null; phone?: string | null } | null;
};

/** Lista as conversas recentes e mostra "digitando…" quando o contato escreve. */
export function RecentConversations({ conversations }: { conversations: RecentConversation[] }) {

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold">Conversas recentes</h2>
        <Link
          href="/conversas"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          abrir inbox <ArrowRight size={13} />
        </Link>
      </div>

      {conversations.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma conversa ainda. Quando alguém escrever no WhatsApp, ela aparece aqui.
        </p>
      ) : (
        <ul className="divide-y">
          {conversations.map((c) => {
            return (
              <li key={c.id}>
                <Link
                  href={`/conversas?c=${c.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-accent/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">
                        {c.contact?.name ?? c.contact?.phone ?? "Conversa"}
                      </span>
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {c.channel_type}
                      {c.unread_count > 0 ? ` · ${c.unread_count} não lida(s)` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.last_message_at
                      ? new Date(c.last_message_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
