"use client";

import { useEffect, useState } from "react";
import { pollFetch, startPolling } from "@/lib/client/poll";

/**
 * Polling do estado "digitando" das conversas do WhatsApp.
 * Retorna um mapa { conversationId: true }. Indicador cosmético: intervalo folgado
 * e sem sobreposição de requisições (o bridge pode demorar).
 */
export function useTypingConversations(intervalMs = 6000) {
  const [typing, setTyping] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    const stop = startPolling(async (signal) => {
      const res = await pollFetch("/api/presence", signal);
      if (!res.ok) return;
      const json = (await res.json()) as { typing?: Record<string, boolean> };
      if (!cancelled) setTyping(json.typing ?? {});
    }, intervalMs);

    return () => {
      cancelled = true;
      stop();
    };
  }, [intervalMs]);

  return typing;
}
