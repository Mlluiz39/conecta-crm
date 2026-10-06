import {
  LayoutDashboard,
  MessagesSquare,
  Users,
  KanbanSquare,
  CalendarDays,
  BarChart3,
  Bot,
  Cable,
  Megaphone,
  Settings,
} from "lucide-react";

/**
 * Itens de navegação principal do CRM.
 * Fonte única para a sidebar (desktop) e para o menu mobile.
 */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/conversas", label: "Conversas", icon: MessagesSquare },
  { href: "/contatos", label: "Contatos", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/agentes", label: "Agentes de IA", icon: Bot },
  { href: "/prospeccao", label: "Prospecção", icon: Megaphone },
  { href: "/conexoes", label: "Conexões", icon: Cable },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
] as const;
