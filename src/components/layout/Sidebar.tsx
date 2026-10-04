import React from 'react';
import { useCrm, PageId } from '../../context/CrmContext';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Kanban,
  Calendar,
  BarChart3,
  Bot,
  FileText,
  Settings,
  Layers,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  ChevronsUpDown,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const {
    activePage,
    setActivePage,
    isSidebarCollapsed,
    toggleSidebar,
    conversations,
  } = useCrm();

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  const navItems: Array<{
    id: PageId;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number | string;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'conversas', label: 'Conversas', icon: MessageSquare, badge: totalUnread > 0 ? totalUnread : undefined },
    { id: 'contatos', label: 'Contatos', icon: Users },
    { id: 'pipeline', label: 'Pipeline', icon: Kanban },
    { id: 'calendario', label: 'Calendário', icon: Calendar },
    { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
    { id: 'agentes-de-ia', label: 'Agentes de IA', icon: Bot },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'configuracoes', label: 'Configurações', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {!isSidebarCollapsed && (
        <div
          onClick={toggleSidebar}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-30 lg:hidden"
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-full z-40 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 flex flex-col justify-between transition-all duration-300 shadow-xs ${
          isSidebarCollapsed
            ? '-translate-x-full lg:translate-x-0 lg:w-20'
            : 'translate-x-0 w-64'
        }`}
      >
        {/* Top Brand Logo & Toggle */}
        <div className="flex flex-col flex-1 overflow-y-auto">
          <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 shrink-0">
            <div
              onClick={() => setActivePage('dashboard')}
              className="flex items-center gap-2.5 cursor-pointer overflow-hidden group"
            >
              {/* Logo Icon */}
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center text-white shadow-xs shadow-indigo-500/20 shrink-0 group-hover:scale-105 transition-transform">
                <Layers className="w-5 h-5 font-bold" />
              </div>
              {!isSidebarCollapsed && (
                <div className="flex flex-col">
                  <span className="font-heading font-extrabold text-lg tracking-tight text-slate-900 dark:text-white leading-none">
                    Conecta<span className="text-indigo-600 dark:text-indigo-400">CRM</span>
                  </span>
                  <span className="text-[9px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500 mt-0.5">
                    Multicanal Brasil
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={isSidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu'}
            >
              {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activePage === item.id || (item.id === 'agentes-de-ia' && activePage === 'agentes');
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActivePage(item.id);
                    // On mobile, collapse sidebar after selection
                    if (window.innerWidth < 1024) {
                      toggleSidebar();
                    }
                  }}
                  title={isSidebarCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all text-left relative ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                  } ${isSidebarCollapsed ? 'justify-center' : ''}`}
                >
                  <Icon
                    className={`w-5 h-5 shrink-0 ${
                      isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  />

                  {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}

                  {/* Badge if present */}
                  {item.badge && (
                    <span
                      className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        isActive
                          ? 'bg-white text-indigo-700'
                          : 'bg-rose-500 text-white'
                      } ${isSidebarCollapsed ? 'absolute -top-1 -right-1' : ''}`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Account & Organization Widget */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex flex-col gap-2 shrink-0">
          {/* Company Card */}
          <div
            onClick={() => setActivePage('configuracoes')}
            className={`flex items-center justify-between p-2 rounded-xl hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700 ${
              isSidebarCollapsed ? 'justify-center p-1.5' : ''
            }`}
            title="Matriz Brasil Ltda (Plano Pro)"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-xs shrink-0">
                M
              </div>
              {!isSidebarCollapsed && (
                <div className="truncate">
                  <p className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate">
                    Matriz Brasil Ltda
                  </p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Plano Pro • Ativo
                  </p>
                </div>
              )}
            </div>
            {!isSidebarCollapsed && (
              <ChevronsUpDown className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </div>

          {/* User Card */}
          <div
            className={`flex items-center justify-between p-2 rounded-xl hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700 ${
              isSidebarCollapsed ? 'justify-center p-1.5' : ''
            }`}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="relative shrink-0">
                <img
                  src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&auto=format&fit=crop&q=80"
                  alt="Marcelo Luiz"
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-indigo-500/20"
                />
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
              </div>
              {!isSidebarCollapsed && (
                <div className="truncate">
                  <p className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                    Marcelo Luiz
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                    Administrador Geral
                  </p>
                </div>
              )}
            </div>
            {!isSidebarCollapsed && (
              <MoreVertical className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
