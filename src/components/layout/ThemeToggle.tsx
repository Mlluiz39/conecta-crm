"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "crm-theme";

/**
 * Alterna entre tema claro e escuro.
 * A preferência fica em localStorage; sem escolha salva, o layout usa a
 * preferência do sistema (ver script inline em app/layout.tsx).
 */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !(dark ?? false);
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // modo privado / storage bloqueado: segue só na sessão
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      title={dark ? "Tema claro" : "Tema escuro"}
      className="rounded-lg border px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {dark === null ? (
        <span className="block h-[15px] w-[15px]" />
      ) : dark ? (
        <Sun size={15} />
      ) : (
        <Moon size={15} />
      )}
    </button>
  );
}
