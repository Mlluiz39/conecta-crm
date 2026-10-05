import { requireProfile } from "@/lib/auth/session";
import { logout } from "@/lib/auth/actions";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  atendente: "Atendente",
};

export async function Header() {
  const profile = await requireProfile();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/80 px-4 backdrop-blur sm:px-6">
      <div className="text-sm text-muted-foreground">
        Olá, <span className="font-semibold text-foreground">{profile.fullName || profile.email}</span>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <span className="hidden rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground sm:inline">
          {ROLE_LABEL[profile.role] ?? profile.role}
        </span>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
