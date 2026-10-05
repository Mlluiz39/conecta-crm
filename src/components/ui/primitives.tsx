import Link from "next/link";
import { ChevronRight, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border bg-card p-4 shadow-sm", className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        className,
      )}
      {...props}
    />
  );
}

/** Atalho de navegação: sempre tem "Dashboard"; `back` adiciona o nível pai. */
export function Breadcrumbs({
  back,
  className,
}: {
  back?: { href: string; label: string } | null;
  className?: string;
}) {
  const crumbs = back === null ? [] : [back ?? { href: "/dashboard", label: "Dashboard" }];
  if (back === null) return null;

  return (
    <nav className={cn("mb-2 flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold transition-colors hover:bg-accent hover:text-foreground"
      >
        <LayoutDashboard size={12} />
        Dashboard
      </Link>
      {crumbs
        .filter((crumb) => crumb.href !== "/dashboard")
        .map((crumb) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            <ChevronRight size={12} className="opacity-60" />
            <Link
              href={crumb.href}
              className="rounded-md px-1.5 py-0.5 font-semibold transition-colors hover:bg-accent hover:text-foreground"
            >
              {crumb.label}
            </Link>
          </span>
        ))}
    </nav>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  /**
   * Navegação de volta. Sem `back`, mostra só o atalho "Dashboard"
   * (todas as telas internas têm como voltar para o início). `back={null}` esconde.
   */
  back?: { href: string; label: string } | null;
}) {
  return (
    <div className="mb-6">
      <Breadcrumbs back={back} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
