"use client";

/**
 * Polling em cliente sem sobrepor chamadas.
 *
 * Motivo: telas com `setInterval` + `fetch` podem empilhar requisições quando o
 * servidor demora mais que o intervalo (dev/HMR, bridge lento). O acúmulo trava
 * a navegação e obriga o usuário a dar refresh. Aqui cada tick só começa quando o
 * anterior terminou, requisições têm timeout, e nada roda com a aba em segundo plano.
 */
export function startPolling(
  fn: (signal: AbortSignal) => Promise<void>,
  intervalMs: number,
  options: { runWhenHidden?: boolean; timeoutMs?: number } = {},
): () => void {
  const { runWhenHidden = false, timeoutMs = 12_000 } = options;
  let inFlight = false;
  let stopped = false;

  async function tick() {
    if (stopped || inFlight) return;
    if (!runWhenHidden && typeof document !== "undefined" && document.hidden) return;
    inFlight = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fn(controller.signal);
    } catch {
      // silencioso: polling não deve quebrar a tela
    } finally {
      clearTimeout(timer);
      inFlight = false;
    }
  }

  void tick();
  const id = setInterval(() => void tick(), intervalMs);
  const onVisible = () => {
    if (!document.hidden) void tick();
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    stopped = true;
    clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** fetch com timeout embutido (usa o signal do poller). */
export function pollFetch(url: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, { cache: "no-store", signal });
}
