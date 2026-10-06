"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/layout/nav-items";

/**
 * Menu de navegação para telas pequenas (< lg).
 * A sidebar fixa some no mobile, então aqui fica o botão "hambúrguer"
 * com gaveta lateral contendo os mesmos itens.
 *
 * A gaveta sai por portal no <body> de propósito: este botão vive dentro do
 * <header>, que tem `backdrop-blur` — e `backdrop-filter` faz o elemento virar
 * containing block de descendentes `fixed`, o que prenderia a gaveta na altura
 * do header (64px) em vez da tela inteira.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // fecha a gaveta a cada troca de rota
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // trava o scroll do body enquanto a gaveta está aberta
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // fecha com ESC
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu de navegação"
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="shrink-0 rounded-lg border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
      >
        <Menu size={18} />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Fechar menu de navegação"
              onClick={() => setOpen(false)}
              className="absolute inset-0 h-full w-full cursor-default bg-black/50 backdrop-blur-sm"
            />

            <aside
              id="mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r bg-card shadow-xl"
            >
              <div className="flex h-16 shrink-0 items-center justify-between px-4">
                <span className="text-lg font-extrabold tracking-tight text-primary">
                  ConectaCRM
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar menu"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
                {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                  const active = pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      prefetch={true}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <Icon size={18} className="shrink-0" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </nav>
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
