"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Check, Smartphone } from "lucide-react";
import { useNotify } from "@/components/ui/dialog-provider";

/**
 * Liga/desliga a notificação de "o lead respondeu" neste aparelho.
 *
 * O que o navegador exige: permissão de notificação concedida pela pessoa,
 * conexão HTTPS e o app instalado (ou aberto) — o service worker faz o resto.
 * No iPhone, push só funciona com o app na Tela de Início: sem isso o botão
 * explica o caminho em vez de fingir que funcionou.
 */

type Estado = "carregando" | "indisponivel" | "desligado" | "ligado" | "bloqueado";

function chaveBase64ParaBytes(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalizado = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(normalizado);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

function nomeAparelho(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) {
    const modelo = ua.match(/Android[^;]*;\s*([^)]+)\)/)?.[1]?.trim();
    return modelo ? `Android · ${modelo.slice(0, 40)}` : "Android";
  }
  return navigator.platform || "Computador";
}

export function PushToggle() {
  const notify = useNotify();
  const [estado, setEstado] = useState<Estado>("carregando");
  const [aparelhos, setAparelhos] = useState(0);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suportado, setSuportado] = useState(false);

  const iosSemApp = () =>
    /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !window.matchMedia("(display-mode: standalone)").matches;

  const carregar = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setEstado("indisponivel");
      setMotivo(
        iosSemApp()
          ? "No iPhone a notificação só funciona com o app instalado: Compartilhar → Adicionar à Tela de Início, depois abra por lá."
          : "Este navegador não suporta notificação push.",
      );
      return;
    }

    const res = await fetch("/api/push").catch(() => null);
    const dados = res?.ok ? ((await res.json()) as { disponivel: boolean; publicKey: string }) : null;
    if (!dados?.disponivel) {
      setEstado("indisponivel");
      setMotivo("O servidor ainda não tem as chaves de notificação configuradas (VAPID).");
      return;
    }

    setAparelhos((dados as unknown as { aparelhos?: number }).aparelhos ?? 0);
    setSuportado(true);

    if (Notification.permission === "denied") {
      setEstado("bloqueado");
      return;
    }

    const registro = await navigator.serviceWorker.getRegistration("/");
    const inscricao = await registro?.pushManager.getSubscription().catch(() => null);
    setEstado(inscricao ? "ligado" : "desligado");
  }, []);

  useEffect(() => {
    void carregar().catch(() => setEstado("indisponivel"));
  }, [carregar]);

  async function ligar() {
    setBusy(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        if (permissao === "denied") {
          notify("Permissão negada. Libere as notificações nas configurações do navegador.", "error");
        }
        return;
      }

      const info = await fetch("/api/push").then((r) => r.json());
      const registro =
        (await navigator.serviceWorker.getRegistration("/")) ??
        (await navigator.serviceWorker.ready);

      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveBase64ParaBytes(info.publicKey),
      });

      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: inscricao.toJSON(), aparelho: nomeAparelho() }),
      });
      if (!res.ok) {
        const erro = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(erro?.error ?? `HTTP ${res.status}`);
      }

      setEstado("ligado");
      notify("Notificações ativadas neste aparelho.", "success");
      await carregar();
    } catch (erro) {
      notify(`Não deu para ativar: ${(erro as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function desligar() {
    setBusy(true);
    try {
      const registro = await navigator.serviceWorker.getRegistration("/");
      const inscricao = await registro?.pushManager.getSubscription();
      if (inscricao) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: inscricao.endpoint }),
        }).catch(() => null);
        await inscricao.unsubscribe();
      }
      setEstado("desligado");
      notify("Notificações desligadas neste aparelho.");
      await carregar();
    } catch (erro) {
      notify(`Não deu para desligar: ${(erro as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  const ligado = estado === "ligado";

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-2">
        {ligado ? (
          <Bell size={17} className="mt-0.5 shrink-0 text-primary" />
        ) : (
          <BellOff size={17} className="mt-0.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">Avisar quando o lead responder</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Chega como notificação no celular, mesmo com o app fechado. Tocar abre a conversa.
            {aparelhos > 0 && ligado ? ` ${aparelhos} aparelho(s) ativo(s) nesta conta.` : ""}
          </p>

          {motivo && <p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700">{motivo}</p>}

          {estado === "bloqueado" && (
            <p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700">
              As notificações estão bloqueadas para este site. No Chrome: cadeado na barra de
              endereço → Notificações → Permitir. No iPhone: Ajustes → Notificações → ConectaCRM.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {estado === "carregando" && (
              <span className="text-xs text-muted-foreground">Verificando…</span>
            )}

            {estado === "ligado" && (
              <>
                <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600/10 px-3 text-xs font-bold text-emerald-700">
                  <Check size={14} /> Ativada neste aparelho
                </span>
                <button
                  type="button"
                  onClick={() => void desligar()}
                  disabled={busy}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold disabled:opacity-50"
                >
                  <BellOff size={14} /> Desligar
                </button>
              </>
            )}

            {(estado === "desligado" || estado === "bloqueado") && (
              <button
                type="button"
                onClick={() => void ligar()}
                disabled={busy || estado === "bloqueado"}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                <Smartphone size={14} />
                {busy ? "Ativando…" : "Ativar notificações"}
              </button>
            )}

            {estado === "indisponivel" && (
              <span className="text-xs text-muted-foreground">
                {suportado ? "Indisponível neste aparelho." : "Sem suporte neste navegador."}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
