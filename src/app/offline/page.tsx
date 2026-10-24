import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sem conexão · ConectaCRM",
  robots: { index: false, follow: false },
};

/**
 * Fallback mostrado pelo service worker quando a navegação falha sem rede.
 * Fica fora do grupo (dashboard) de propósito: precisa abrir sem sessão.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
        📶
      </div>
      <h1 className="text-lg font-bold">Você está sem conexão</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        O ConectaCRM precisa de internet para falar com o servidor. Verifique o sinal, o
        Wi-Fi ou os dados móveis e tente de novo — o que você já tinha aberto volta a
        funcionar assim que a conexão retornar.
      </p>
      <a
        href="/dashboard"
        className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
      >
        Tentar novamente
      </a>
    </main>
  );
}
