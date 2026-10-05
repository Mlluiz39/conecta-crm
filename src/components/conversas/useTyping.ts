"use client";

import { useEffect, useState } from "react";

/**
 * Polling do estado "digitando" das conversas do WhatsApp.
 * Retorna um mapa { conversationId: true }.
 */
export function useTypingConversations(intervalMs = 3000) {
  const [typing, setTyping] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/presence", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { typing?: Record<string, boolean> };
        if (!cancelled) setTyping(json.typing ?? {});
      } catch {
        // silencioso: sem indicador quando o bridge não responde
      }
    }

    void tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return typing;
}
