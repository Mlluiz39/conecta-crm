"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

/**
 * Diálogos do CRM: substitui window.confirm/prompt/alert por um modal no padrão
 * visual do sistema (claro/escuro, cantos arredondados, foco no botão de ação).
 */

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  /** Exige digitar esta frase para liberar a confirmação (ações destrutivas). */
  requirePhrase?: string;
  /**
   * Caixa de marcar dentro do diálogo, para a ação ter uma variação (ex.: "apagar o contato
   * junto"). Use `confirmWithOption` para receber o estado dela — `confirm` devolve só o ok.
   */
  checkbox?: {
    label: string;
    hint?: string;
    defaultChecked?: boolean;
  };
};

/** Resultado do diálogo: se confirmou e como ficou a caixa de marcar. */
export type ConfirmResult = { ok: boolean; checked: boolean };

type ToastKind = "success" | "error";

type DialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmWithOption: (options: ConfirmOptions) => Promise<ConfirmResult>;
  notify: (message: string, kind?: ToastKind) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useConfirm precisa do <DialogProvider> no layout");
  return ctx.confirm;
}

/** Igual ao `useConfirm`, mas devolve também o estado da caixa de marcar. */
export function useConfirmWithOption() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useConfirmWithOption precisa do <DialogProvider> no layout");
  return ctx.confirmWithOption;
}

export function useNotify() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useNotify precisa do <DialogProvider> no layout");
  return ctx.notify;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [phrase, setPhrase] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const resolver = useRef<((value: ConfirmResult) => void) | null>(null);
  const confirmButton = useRef<HTMLButtonElement | null>(null);
  /** O `close` é chamado também de fora do React (ESC/backdrop): o estado da caixa vem daqui. */
  const checkedRef = useRef(false);

  const open = useCallback((opts: ConfirmOptions) => {
    setPhrase("");
    const inicial = Boolean(opts.checkbox?.defaultChecked);
    checkedRef.current = inicial;
    setChecked(inicial);
    setOptions(opts);
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const confirm = useCallback(
    async (opts: ConfirmOptions) => (await open(opts)).ok,
    [open],
  );

  const confirmWithOption = useCallback((opts: ConfirmOptions) => open(opts), [open]);

  const notify = useCallback((message: string, kind: ToastKind = "success") => {
    setToast({ message, kind });
  }, []);

  const close = useCallback((value: boolean) => {
    resolver.current?.({ ok: value, checked: checkedRef.current });
    resolver.current = null;
    setOptions(null);
    setPhrase("");
    setBusy(false);
  }, []);

  // Fecha o aviso sozinho
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // ESC cancela; foco vai para o botão principal
  useEffect(() => {
    if (!options) return;
    confirmButton.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, close]);

  const value = useMemo(
    () => ({ confirm, confirmWithOption, notify }),
    [confirm, confirmWithOption, notify],
  );

  const phraseOk = !options?.requirePhrase || phrase.trim() === options.requirePhrase;
  const danger = options?.tone === "danger";

  return (
    <DialogContext.Provider value={value}>
      {children}

      {options && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close(false);
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-2xl">
            <div className="flex items-start gap-3 p-5">
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  danger ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                }`}
              >
                <AlertTriangle size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-foreground">{options.title}</h2>
                {options.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{options.description}</p>
                )}

                {options.checkbox && (
                  <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border bg-muted/30 p-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        checkedRef.current = e.target.checked;
                        setChecked(e.target.checked);
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-destructive"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-foreground">
                        {options.checkbox.label}
                      </span>
                      {options.checkbox.hint && (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {options.checkbox.hint}
                        </span>
                      )}
                    </span>
                  </label>
                )}

                {options.requirePhrase && (
                  <div className="mt-3 space-y-1.5">
                    <label className="block text-xs font-semibold text-muted-foreground">
                      Digite <span className="font-mono text-destructive">{options.requirePhrase}</span> para confirmar
                    </label>
                    <input
                      value={phrase}
                      onChange={(e) => setPhrase(e.target.value)}
                      autoFocus
                      className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => close(false)}
                aria-label="Fechar"
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-5 py-3">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-xl border bg-background px-4 py-2 text-sm font-semibold hover:bg-accent"
              >
                {options.cancelLabel ?? "Cancelar"}
              </button>
              <button
                ref={confirmButton}
                type="button"
                disabled={!phraseOk || busy}
                onClick={() => {
                  setBusy(true);
                  close(true);
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 ${
                  danger ? "bg-destructive" : "bg-primary text-primary-foreground"
                }`}
              >
                {options.confirmLabel ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50">
          <div
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-lg ${
              toast.kind === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {toast.kind === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            <span className="font-medium">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-1 rounded p-0.5 opacity-70 hover:opacity-100"
              aria-label="Fechar aviso"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
