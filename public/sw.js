/**
 * Service worker do ConectaCRM.
 *
 * Estratégia deliberadamente conservadora, porque o CRM mostra dado de cliente:
 *  - HTML de página NUNCA é guardado em cache (rede primeiro; sem rede, /offline)
 *  - /api/ passa direto pelo navegador (nada de resposta de dado autenticado em cache)
 *  - só asset estático (JS, CSS, fonte, ícone) vai para cache-first
 *
 * Assim o app abre rápido e continua abrindo sem sinal, sem risco de mostrar
 * tela de um usuário para outro depois de trocar de conta.
 */
const VERSAO = "conecta-v1";
const CACHE_SHELL = `${VERSAO}-shell`;
const CACHE_ASSETS = `${VERSAO}-assets`;

const SHELL = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL);
      // Um arquivo faltando não pode impedir a instalação do service worker.
      await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: "reload" }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => !n.startsWith(VERSAO)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/** Só esses caminhos podem ir para o cache permanente. */
function ehAssetEstatico(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf)$/i.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Dado de negócio, autenticação e webhooks nunca passam pelo cache.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Navegação: rede primeiro, /offline quando não há conexão.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // no-store de propósito: sem isso o navegador responde da própria
          // cache HTTP e o app "abre" pela metade (HTML sim, dados não) —
          // melhor cair na tela de sem conexão, que é honesta.
          return await fetch(request, { cache: "no-store" });
        } catch {
          const cache = await caches.open(CACHE_SHELL);
          const offline = await cache.match("/offline");
          return offline ?? new Response("Sem conexão", { status: 503, headers: { "content-type": "text/plain" } });
        }
      })(),
    );
    return;
  }

  if (!ehAssetEstatico(url)) return;

  // Asset: responde do cache e atualiza em segundo plano (stale-while-revalidate).
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_ASSETS);
      const guardado = await cache.match(request);
      const daRede = fetch(request)
        .then((resposta) => {
          if (resposta.ok) cache.put(request, resposta.clone());
          return resposta;
        })
        .catch(() => null);

      if (guardado) return guardado;
      const resposta = await daRede;
      return resposta ?? new Response("", { status: 504, statusText: "offline" });
    })(),
  );
});

/* ── Notificações push ──────────────────────────────────────────────────
   O servidor manda { titulo, corpo, url, tag }. A notificação aparece mesmo
   com o app fechado, porque quem a exibe é o sistema a partir deste worker. */
self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    dados = { corpo: event.data ? event.data.text() : "" };
  }

  const titulo = dados.titulo || "ConectaCRM";
  const opcoes = {
    body: dados.corpo || "Você tem uma novidade no CRM.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: dados.tag || "conecta-crm",
    renotify: Boolean(dados.tag),
    data: { url: dados.url || "/conversas" },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/conversas", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Já tem o app aberto? Foca a janela e manda ela navegar.
      for (const janela of janelas) {
        if (new URL(janela.url).origin !== self.location.origin) continue;
        if ("navigate" in janela) {
          try {
            await janela.navigate(destino);
          } catch {
            /* alguns navegadores não deixam navegar daqui: foca e segue */
          }
        }
        return janela.focus();
      }
      return self.clients.openWindow(destino);
    })(),
  );
});
