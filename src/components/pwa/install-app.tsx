"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, X } from "lucide-react";

/**
 * Instalação do PWA.
 *
 * Android/Chrome dispara `beforeinstallprompt` — guardamos o evento e mostramos
 * um botão que chama prompt(). iOS/Safari não tem esse evento: ali só existe o
 * caminho manual (Compartilhar → Adicionar à Tela de Início), então mostramos a
 * instrução no lugar do botão.
 */

type PromptInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISPENSOU = "crm-instalar-dispensado";

function jaInstalado(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  // iOS expõe navigator.standalone em vez da media query
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
}

function ehIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Registra o service worker uma vez por sessão. Sem UI. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const timer = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((erro) => {
        console.warn("[pwa] service worker não registrou:", erro?.message ?? erro);
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

/**
 * Cartão de instalação, para colocar em Configurações.
 * Some sozinho quando o app já está instalado.
 */
export function InstallAppCard() {
  const [prompt, setPrompt] = useState<PromptInstalacao | null>(null);
  const [instalado, setInstalado] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalado(jaInstalado());
    setIos(ehIOS());
    function onPrompt(evento: Event) {
      evento.preventDefault();
      setPrompt(evento as PromptInstalacao);
    }
    function onInstalado() {
      setInstalado(true);
      setPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalado);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalado);
    };
  }, []);

  if (instalado) {
    return (
      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-bold">App instalado</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          O ConectaCRM já está na tela inicial deste aparelho. Abrindo pelo ícone ele roda em
          tela cheia, sem a barra do navegador.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-bold">Instalar como app</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Fica na tela inicial do celular, abre em tela cheia e funciona melhor no 3G da rua.
      </p>

      {prompt ? (
        <button
          type="button"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice.catch(() => null);
            setPrompt(null);
          }}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <Download size={16} /> Instalar no aparelho
        </button>
      ) : ios ? (
        <ol className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="font-bold">1.</span> Toque em <Share size={12} className="mt-0.5 inline" />{" "}
            <strong>Compartilhar</strong> na barra do Safari.
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">2.</span> Escolha <strong>Adicionar à Tela de Início</strong>.
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">3.</span> Confirme em <strong>Adicionar</strong>.
          </li>
        </ol>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Abra este endereço no Chrome do Android (ou no Safari do iPhone) e use o menu do
          navegador → <strong>Instalar app</strong> / <strong>Adicionar à Tela de Início</strong>.
        </p>
      )}
    </div>
  );
}

/**
 * Faixa discreta no topo do app quando dá para instalar.
 * Aparece uma vez; dispensada, não volta a incomodar no mesmo aparelho.
 */
export function InstallBanner() {
  const caminho = usePathname();
  const [visivel, setVisivel] = useState(false);
  const [prompt, setPrompt] = useState<PromptInstalacao | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (jaInstalado()) return;
    try {
      if (localStorage.getItem(DISPENSOU) === "1") return;
    } catch {
      return;
    }
    setIos(ehIOS());

    function onPrompt(evento: Event) {
      evento.preventDefault();
      setPrompt(evento as PromptInstalacao);
      setVisivel(true);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    // iPhone nunca recebe o evento: mostra a instrução depois de um tempo de uso.
    const timer = ehIOS() ? setTimeout(() => setVisivel(true), 4000) : null;
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // A caixa de entrada precisa da altura toda no celular: a faixa sairia da
  // conta e empurraria o campo de mensagem para fora da tela.
  if (caminho?.startsWith("/conversas")) return null;
  if (!visivel) return null;

  const dispensar = () => {
    setVisivel(false);
    try {
      localStorage.setItem(DISPENSOU, "1");
    } catch {
      /* modo privado: só não persiste */
    }
  };

  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 lg:hidden">
      <Download size={16} className="mt-0.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-xs">
        <strong className="block">Instalar o ConectaCRM no celular</strong>
        <span className="text-muted-foreground">
          {prompt
            ? "Fica na tela inicial e abre em tela cheia — melhor para prospectar na rua."
            : ios
              ? "No Safari: Compartilhar → Adicionar à Tela de Início."
              : "No menu do navegador: Instalar app."}
        </span>
        {prompt && (
          <button
            type="button"
            onClick={async () => {
              await prompt.prompt();
              await prompt.userChoice.catch(() => null);
              dispensar();
            }}
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground"
          >
            Instalar agora
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dispensar}
        aria-label="Dispensar aviso de instalação"
        className="-mr-1 -mt-1 inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground"
      >
        <X size={14} />
      </button>
    </div>
  );
}
