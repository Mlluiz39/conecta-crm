import React, { useState } from 'react';
import { useCrm } from '../../context/CrmContext';
import { BUSINESS_PRESETS } from '../../mocks/businessPresets';
import {
  Search,
  X,
  Sun,
  Moon,
  Bell,
  Plus,
  Menu,
  Building2,
  ShoppingBag,
  Stethoscope,
  Briefcase,
  CheckCircle2,
  Calendar,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

export const Header: React.FC = () => {
  const {
    isSidebarCollapsed,
    toggleSidebar,
    theme,
    toggleTheme,
    businessPreset,
    setBusinessPreset,
    setIsNewLeadModalOpen,
    contacts,
    setSelectedContact,
    setActivePage,
    addToast,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const currentPreset = BUSINESS_PRESETS[businessPreset] || BUSINESS_PRESETS.imobiliaria;

  const searchResults = searchTerm.trim()
    ? contacts.filter(
        c =>
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.phone.includes(searchTerm) ||
          c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.cnpj && c.cnpj.includes(searchTerm))
      )
    : [];

  const getPresetIcon = (id: string) => {
    switch (id) {
      case 'imobiliaria':
        return <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
      case 'ecommerce':
        return <ShoppingBag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'clinica':
        return <Stethoscope className="w-4 h-4 text-sky-600 dark:text-sky-400" />;
      case 'agencia':
        return <Briefcase className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    }
  };

  return (
    <header className="sticky top-0 w-full h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 z-30 flex items-center justify-between px-4 sm:px-6 shrink-0 transition-colors">
      {/* Left Area: Mobile Menu Toggle + Global Search */}
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        {/* Toggle button on mobile/tablet */}
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Abrir menu lateral"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Search Input Bar with live search dropdown */}
        <div className="relative flex-1">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Buscar leads, contatos, CNPJ ou mensagens..."
              className="w-full pl-9 pr-8 py-2 bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 text-xs sm:text-sm rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:bg-white dark:focus:bg-slate-800 transition-all border border-transparent focus:border-indigo-500"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setIsSearchOpen(false);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Live Search Popup */}
          {isSearchOpen && searchTerm.trim() && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-2 max-h-80 overflow-y-auto z-50">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase text-slate-400">
                Resultados ({searchResults.length})
              </div>
              {searchResults.length > 0 ? (
                searchResults.map(c => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedContact(c);
                      setActivePage('contatos');
                      setIsSearchOpen(false);
                      setSearchTerm('');
                    }}
                    className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/60 cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs">
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight">
                          {c.name}
                        </p>
                        <p className="text-xs text-slate-400">{c.company} • {c.phone}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      R$ {c.opportunityValue.toLocaleString('pt-BR')}
                    </span>
                  </div>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-slate-500 text-center">
                  Nenhum lead ou contato encontrado para "{searchTerm}".
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3 ml-2">
        {/* Business Preset Quick Switcher */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs">
          {getPresetIcon(businessPreset)}
          <span className="text-slate-500 dark:text-slate-400 font-medium">Nicho:</span>
          <select
            value={businessPreset}
            onChange={e => setBusinessPreset(e.target.value as any)}
            className="bg-transparent font-semibold text-slate-800 dark:text-slate-100 focus:outline-hidden cursor-pointer"
          >
            {Object.values(BUSINESS_PRESETS).map(p => (
              <option key={p.id} value={p.id} className="dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Theme Toggle (Light / Dark) */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
        </button>

        {/* Notifications Button */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
            title="Notificações"
          >
            <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 z-50">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                <span className="font-bold text-sm text-slate-900 dark:text-white">Notificações</span>
                <span
                  onClick={() => setIsNotificationsOpen(false)}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 cursor-pointer hover:underline"
                >
                  Marcar lidas
                </span>
              </div>
              <div className="space-y-3 mt-3">
                <div className="flex items-start gap-2.5 p-2 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40">
                  <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      Rafael Costa respondeu no WhatsApp
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">"Sim, seria ótimo hoje às 16h..."</p>
                    <span className="text-[10px] text-slate-400">Há 14 min</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <Calendar className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      Lembrete de Demonstração
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Reunião com Rafael Costa em 4 horas (Google Meet).</p>
                    <span className="text-[10px] text-slate-400">Hoje às 16:00</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      Oportunidade Fechada!
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Auto Peças Brasil fechou R$ 54.000 via WhatsApp.</p>
                    <span className="text-[10px] text-slate-400">Ontem</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CTA: Novo Lead */}
        <button
          onClick={() => setIsNewLeadModalOpen(true)}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo Lead</span>
        </button>

        {/* User Avatar */}
        <div
          onClick={() => addToast('Perfil do Administrador', 'Logado como Marcelo Luiz (Matriz Brasil Ltda).', 'info')}
          className="cursor-pointer shrink-0"
          title="Marcelo Luiz (Admin)"
        >
          <img
            src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&auto=format&fit=crop&q=80"
            alt="Marcelo Luiz"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover ring-2 ring-indigo-500/20 hover:ring-indigo-500/40 transition-all"
          />
        </div>
      </div>
    </header>
  );
};
