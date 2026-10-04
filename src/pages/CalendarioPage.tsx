import React, { useState } from 'react';
import { useCrm } from '../context/CrmContext';
import { VisitAppointment } from '../types/crm';

export const CalendarioPage: React.FC = () => {
  const {
    appointments,
    addAppointment,
    reminders,
    updateReminders,
    contacts,
    setSelectedContact,
    setActivePage,
    addToast
  } = useCrm();

  const [viewTab, setViewTab] = useState<'mes' | 'semana' | 'dia' | 'lista'>('semana');
  const [selectedAgent, setSelectedAgent] = useState('Marcelo Luiz');
  const [selectedChannel, setSelectedChannel] = useState('all');

  // Modal for new appointment
  const [isNewAptModalOpen, setIsNewAptModalOpen] = useState(false);
  const [aptContactName, setAptContactName] = useState('Rafael Costa');
  const [aptCompany, setAptCompany] = useState('Construtora Horizonte');
  const [aptTitle, setAptTitle] = useState('Demonstração Online - Google Meet');
  const [aptDate, setAptDate] = useState('2024-10-24');
  const [aptTime, setAptTime] = useState('16:00');
  const [aptDuration, setAptDuration] = useState('60');
  const [aptType, setAptType] = useState<VisitAppointment['type']>('demo');
  const [aptChannel, setAptChannel] = useState<VisitAppointment['channel']>('meet');
  const [aptValue, setAptValue] = useState('45000');

  const handleCreateAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    addAppointment({
      contactId: 'c_custom',
      contactName: aptContactName,
      company: aptCompany,
      title: aptTitle,
      date: aptDate,
      time: aptTime,
      durationMinutes: Number(aptDuration) || 45,
      type: aptType,
      channel: aptChannel,
      meetLink: aptChannel === 'meet' ? 'https://meet.google.com/xyz-crm-demo' : undefined,
      status: 'confirmada',
      value: Number(aptValue) || 0,
      assignedTo: selectedAgent,
    });
    setIsNewAptModalOpen(false);
  };

  const toggleReminderItem = (key: keyof typeof reminders) => {
    updateReminders({
      ...reminders,
      [key]: !reminders[key],
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Context Bar */}
      <div className="flex flex-col gap-4">
        {/* Breadcrumb & Realtime Google Calendar Sync Pill */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 font-semibold">
            <span className="hover:text-indigo-600 cursor-pointer">Agenda &amp; Reuniões</span>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-slate-900 dark:text-white">Calendário Comercial Multicanal</span>
          </div>

          <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Google Calendar</span>
            <span className="text-slate-400">marcelo.luiz@conectacrm.com.br</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-500 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">sync</span> Sincronizado há 2 min
            </span>
          </div>
        </div>

        {/* Title Bar and Quick CTA Actions */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tracking-tight">
                Calendário Comercial &amp; Visitas
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs border border-indigo-200 dark:border-indigo-800">
                Q4 Fechamento
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Orquestre videochamadas, visitas técnicas e follow-ups em múltiplos canais sem conflito de agenda.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <a
              href="https://meet.google.com/new"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 shadow-xs transition-colors"
            >
              <span className="material-symbols-outlined text-indigo-600 text-base">video_call</span>
              <span>Google Meet Rápido</span>
            </a>

            <button
              onClick={() => setIsNewAptModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
            >
              <span className="material-symbols-outlined text-base">add</span>
              <span>Novo Agendamento</span>
            </button>
          </div>
        </div>

        {/* Calendar Navigation & Filters Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5">
              <button
                onClick={() => addToast('Semana Anterior', 'Visualizando agenda do período anterior.', 'info')}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              <button
                onClick={() => addToast('Semana Atual', 'Retornando à semana atual.', 'info')}
                className="px-3 py-1 text-xs font-bold text-slate-800 dark:text-slate-200"
              >
                Hoje
              </button>
              <button
                onClick={() => addToast('Próxima Semana', 'Avançando para próxima semana.', 'info')}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-600 text-xl">event</span>
              <span className="font-heading font-extrabold text-sm text-slate-900 dark:text-white">
                21 a 27 de Outubro, 2024
              </span>
            </div>
          </div>

          {/* View Mode & Filter Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center text-xs font-semibold">
              <button
                onClick={() => setViewTab('mes')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  viewTab === 'mes'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Mês
              </button>
              <button
                onClick={() => setViewTab('semana')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  viewTab === 'semana'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Semana
              </button>
              <button
                onClick={() => setViewTab('dia')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  viewTab === 'dia'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Dia
              </button>
              <button
                onClick={() => setViewTab('lista')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                  viewTab === 'lista'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Lista</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </button>
            </div>

            <div className="flex items-center bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl text-xs font-semibold gap-1.5 text-slate-700 dark:text-slate-200">
              <span className="w-4 h-4 rounded-full bg-indigo-200 text-indigo-800 font-bold flex items-center justify-center text-[9px]">ML</span>
              <span>Marcelo Luiz</span>
            </div>

            <select
              value={selectedChannel}
              onChange={e => setSelectedChannel(e.target.value)}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl focus:outline-none"
            >
              <option value="all">Todos os Canais</option>
              <option value="meet">Google Meet</option>
              <option value="whatsapp">WhatsApp Call</option>
              <option value="presencial">Presencial</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main 2-Column Calendar Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left/Center: Interactive Week Time Grid (9 Cols on XL) */}
        <div className="xl:col-span-9 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 overflow-hidden flex flex-col">
          {/* Days of Week Header */}
          <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-center text-xs">
            <div className="py-3 px-2 text-slate-400 font-semibold border-r border-slate-200/60 dark:border-slate-700/60">
              Horário
            </div>
            <div className="py-3 px-1 border-r border-slate-200/60 dark:border-slate-700/60">
              <p className="text-[10px] uppercase font-bold text-slate-400">Seg</p>
              <p className="font-heading font-extrabold text-sm text-slate-800 dark:text-slate-200">21</p>
            </div>
            <div className="py-3 px-1 border-r border-slate-200/60 dark:border-slate-700/60">
              <p className="text-[10px] uppercase font-bold text-slate-400">Ter</p>
              <p className="font-heading font-extrabold text-sm text-slate-800 dark:text-slate-200">22</p>
            </div>
            <div className="py-3 px-1 border-r border-slate-200/60 dark:border-slate-700/60">
              <p className="text-[10px] uppercase font-bold text-slate-400">Qua</p>
              <p className="font-heading font-extrabold text-sm text-slate-800 dark:text-slate-200">23</p>
            </div>
            {/* Qui (Hoje - Highlighted) */}
            <div className="py-3 px-1 border-r border-slate-200/60 dark:border-slate-700/60 bg-indigo-50/70 dark:bg-indigo-950/40 relative">
              <span className="absolute top-1 right-1.5 px-1 rounded-full bg-indigo-600 text-white font-bold text-[9px] uppercase">
                Hoje
              </span>
              <p className="text-[10px] uppercase font-extrabold text-indigo-600 dark:text-indigo-400">Qui</p>
              <p className="font-heading font-extrabold text-sm text-indigo-600 dark:text-indigo-400">24</p>
            </div>
            <div className="py-3 px-1 border-r border-slate-200/60 dark:border-slate-700/60">
              <p className="text-[10px] uppercase font-bold text-slate-400">Sex</p>
              <p className="font-heading font-extrabold text-sm text-slate-800 dark:text-slate-200">25</p>
            </div>
            <div className="py-3 px-1 text-slate-400 bg-slate-100/40 dark:bg-slate-800/20">
              <p className="text-[10px] uppercase font-bold">Sáb</p>
              <p className="font-heading font-extrabold text-sm">26</p>
            </div>
          </div>

          {/* Time Slots Area */}
          <div className="relative overflow-y-auto max-h-[640px] divide-y divide-slate-100 dark:divide-slate-800">
            {/* Red Line: Indicador de Horário Atual (11:30 Hoje na Coluna Qui 24) */}
            <div className="absolute top-[210px] left-0 right-0 pointer-events-none z-20 flex items-center">
              <div className="w-[14.28%] text-right pr-2">
                <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px] shadow-sm">
                  11:30
                </span>
              </div>
              <div className="w-[85.72%] h-[2px] bg-rose-500 flex items-center">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-600 -ml-1" />
              </div>
            </div>

            {/* 08:00 */}
            <div className="grid grid-cols-7 min-h-[60px] text-xs">
              <div className="p-2 text-right text-slate-400 border-r border-slate-100 dark:border-slate-800">08:00</div>
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800 bg-indigo-50/20" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 bg-slate-50/30" />
            </div>

            {/* 09:00 */}
            <div className="grid grid-cols-7 min-h-[68px] text-xs">
              <div className="p-2 text-right text-slate-400 border-r border-slate-100 dark:border-slate-800">09:00</div>
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              {/* Ter 09:00: Daily SDRs */}
              <div className="p-1 border-r border-slate-100 dark:border-slate-800">
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 shadow-xs border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-700 dark:text-slate-300">
                    <span>09:00 - 09:45</span>
                    <span className="material-symbols-outlined text-xs text-indigo-600">groups</span>
                  </div>
                  <p className="font-bold text-xs text-slate-900 dark:text-white truncate mt-0.5">Daily SDRs &amp; Closer</p>
                  <p className="text-[10px] text-slate-400 truncate">Alinhamento de Metas</p>
                </div>
              </div>
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800 bg-indigo-50/20" />
              {/* Sex 09:00: TechSolutions SP */}
              <div className="p-1 border-r border-slate-100 dark:border-slate-800">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800">
                  <span className="text-[10px] font-bold text-indigo-600">09:00 - 10:30</span>
                  <p className="font-bold text-xs text-slate-900 dark:text-white truncate">TechSolutions SP</p>
                  <span className="text-[10px] text-slate-500">15 Lic. Onboarding</span>
                </div>
              </div>
              <div className="p-1 bg-slate-50/30" />
            </div>

            {/* 10:00 */}
            <div className="grid grid-cols-7 min-h-[68px] text-xs">
              <div className="p-2 text-right text-slate-400 border-r border-slate-100 dark:border-slate-800">10:00</div>
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              {/* Ter 10:00: Autopeças Brasil */}
              <div className="p-1 border-r border-slate-100 dark:border-slate-800">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 shadow-xs">
                  <div className="flex items-center justify-between text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                    <span>10:00 - 11:30</span>
                    <span className="px-1 py-0.2 rounded bg-emerald-600 text-white text-[9px]">R$ 82k</span>
                  </div>
                  <p className="font-bold text-xs text-slate-900 dark:text-white truncate">Autopeças Brasil</p>
                  <span className="text-[10px] text-emerald-700">Presencial</span>
                </div>
              </div>
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              {/* Qui 10:00: Dr. Arnaldo */}
              <div className="p-1 border-r border-slate-100 dark:border-slate-800 bg-indigo-50/20">
                <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-600">10:00 - 10:45</span>
                  <p className="font-bold text-xs text-slate-900 dark:text-white truncate">Dr. Arnaldo Silveira</p>
                  <span className="text-[10px] text-slate-400">Apresentação Proposta</span>
                </div>
              </div>
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 bg-slate-50/30" />
            </div>

            {/* 11:00 */}
            <div className="grid grid-cols-7 min-h-[68px] text-xs">
              <div className="p-2 text-right text-slate-400 border-r border-slate-100 dark:border-slate-800">11:00</div>
              {/* Seg 11:00: Follow-up Crítico Grupo Vanguarda */}
              <div className="p-1 border-r border-slate-100 dark:border-slate-800">
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800">
                  <span className="px-1 py-0.2 rounded bg-rose-600 text-white font-bold text-[9px]">Urgente</span>
                  <p className="font-bold text-xs text-slate-900 dark:text-white truncate mt-0.5">Grupo Vanguarda</p>
                  <span className="text-[10px] text-rose-700">Follow-up Objeção</span>
                </div>
              </div>
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800 bg-indigo-50/20" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 bg-slate-50/30" />
            </div>

            {/* 12:00: Intervalo de Almoço */}
            <div className="grid grid-cols-7 min-h-[44px] bg-slate-50/50 dark:bg-slate-800/20 text-xs">
              <div className="p-2 text-right text-slate-400 border-r border-slate-100 dark:border-slate-800">12:00</div>
              <div className="col-span-6 flex items-center px-4 text-slate-400 text-xs italic">
                <span className="material-symbols-outlined text-sm mr-1">restaurant</span> Intervalo de Almoço Livre
              </div>
            </div>

            {/* 14:00 */}
            <div className="grid grid-cols-7 min-h-[68px] text-xs">
              <div className="p-2 text-right text-slate-400 border-r border-slate-100 dark:border-slate-800">14:00</div>
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              {/* Qua 14:30: Mariana Alencar */}
              <div className="p-1 border-r border-slate-100 dark:border-slate-800">
                <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 shadow-xs">
                  <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300">14:30 - 15:30</span>
                  <p className="font-bold text-xs text-slate-900 dark:text-white truncate">Mariana Alencar</p>
                  <span className="text-[10px] text-amber-700 font-semibold">Clínica OdontoVida 🔥</span>
                </div>
              </div>
              <div className="p-1 border-r border-slate-100 dark:border-slate-800 bg-indigo-50/20" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 bg-slate-50/30" />
            </div>

            {/* 16:00 (Quinta HOJE - HIGHLIGHT EVENT: Rafael Costa) */}
            <div className="grid grid-cols-7 min-h-[96px] text-xs">
              <div className="p-2 text-right text-slate-400 border-r border-slate-100 dark:border-slate-800">16:00</div>
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              {/* Quinta 16:00 Hero Event */}
              <div className="p-1.5 border-r border-slate-100 dark:border-slate-800 bg-indigo-50/40">
                <div className="p-3 rounded-2xl bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-400/30">
                  <div className="flex items-center justify-between text-[11px] mb-1 font-bold">
                    <span>16:00 - 17:00</span>
                    <span className="px-1.5 py-0.2 rounded bg-white text-indigo-700 text-[10px]">R$ 45.000</span>
                  </div>
                  <p className="font-heading font-extrabold text-sm truncate">Rafael Costa</p>
                  <p className="text-[11px] text-indigo-100 truncate">Construtora Horizonte</p>
                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/20 text-[10px]">
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="material-symbols-outlined text-xs">video_call</span> Google Meet
                    </span>
                    <span className="px-1 rounded bg-emerald-400 text-slate-900 font-bold">WhatsApp</span>
                  </div>
                </div>
              </div>
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 bg-slate-50/30" />
            </div>

            {/* 17:00 Slot */}
            <div className="grid grid-cols-7 min-h-[68px] text-xs">
              <div className="p-2 text-right text-slate-400 border-r border-slate-100 dark:border-slate-800">17:00</div>
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              {/* Quinta 17:30 Carlos Drummond */}
              <div className="p-1 border-r border-slate-100 dark:border-slate-800 bg-indigo-50/20">
                <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-600">17:30 - 18:00</span>
                  <p className="font-bold text-xs text-slate-900 dark:text-white truncate">Carlos Drummond</p>
                  <span className="text-[10px] text-slate-400">Logística Express Brasil</span>
                </div>
              </div>
              <div className="p-1 border-r border-slate-100 dark:border-slate-800" />
              <div className="p-1 bg-slate-50/30" />
            </div>
          </div>

          {/* Footer Legend */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center gap-4 flex-wrap font-medium">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> Demo B2B</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> Fechamento Final</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Lead Quente WhatsApp</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Follow-up Crítico</span>
            </div>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              🔒 Bloqueios automáticos sincronizados 2 vias
            </span>
          </div>
        </div>

        {/* Right Panel (3 Cols on XL): Próximas Visitas & Automações */}
        <div className="xl:col-span-3 flex flex-col gap-4">
          {/* Card 1: Próximas Visitas */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-600 text-lg">timer</span>
                <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-white">
                  Próximas Visitas
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                3 hoje
              </span>
            </div>

            {/* Highlight Hero Card */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[10px] animate-pulse">
                  Em 4h30min • 16:00
                </span>
                <span className="font-heading font-extrabold text-sm text-indigo-600 dark:text-indigo-400">
                  R$ 45.000
                </span>
              </div>
              <h4 className="font-heading font-bold text-sm text-slate-900 dark:text-white">
                Rafael Costa
              </h4>
              <p className="text-xs text-slate-500">Construtora Horizonte • 15 corretores</p>

              <div className="pt-2 flex flex-col gap-2">
                <a
                  href="https://meet.google.com/xyz-crm-demo"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all text-center"
                >
                  <span className="material-symbols-outlined text-base">video_call</span>
                  <span>Entrar no Google Meet</span>
                </a>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => addToast('WhatsApp Lead', 'Enviando lembrete de confirmação para Rafael Costa.', 'success')}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs hover:bg-emerald-100 transition-colors"
                  >
                    <span className="material-symbols-outlined text-xs">chat</span>
                    <span>WhatsApp</span>
                  </button>
                  <button
                    onClick={() => {
                      const c = contacts.find(item => item.name.includes('Rafael'));
                      if (c) {
                        setSelectedContact(c);
                        setActivePage('contatos');
                      }
                    }}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-slate-200/60 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs hover:bg-slate-200 transition-colors"
                  >
                    <span className="material-symbols-outlined text-xs">folder_open</span>
                    <span>Ver Dossiê</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Subsequent Items */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">
                  17h
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 dark:text-slate-200 truncate">Carlos Drummond</p>
                  <p className="text-[11px] text-slate-400 truncate">Logística Express • Diagnóstico</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                  Sex
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 dark:text-slate-200 truncate">Beatriz Lima</p>
                  <p className="text-[11px] text-slate-400 truncate">Escola Crescer Mais • Presencial</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Automação de Lembretes Multicanal (Sofia IA) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-600 text-lg">smart_toy</span>
                <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-white">
                  Lembretes com IA
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[10px]">
                Sofia Ativa
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Disparos automáticos e confirmação inteligente em linguagem natural.
            </p>

            <div className="space-y-3 pt-1">
              {/* Toggle 1 */}
              <div className="flex items-start justify-between gap-3 text-xs">
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-200">Lembrete 24h via WhatsApp</p>
                  <p className="text-[11px] text-slate-400">Botão interativo "Sim, confirmo" / "Reagendar"</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleReminderItem('whatsapp24h')}
                  className={`w-10 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
                    reminders.whatsapp24h ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      reminders.whatsapp24h ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Toggle 2 */}
              <div className="flex items-start justify-between gap-3 text-xs">
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-200">Lembrete 1h com Link Meet</p>
                  <p className="text-[11px] text-slate-400">Link seguro de 1 clique direto no chat</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleReminderItem('meet1h')}
                  className={`w-10 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
                    reminders.meet1h ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      reminders.meet1h ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Toggle 3 */}
              <div className="flex items-start justify-between gap-3 text-xs">
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-200">Aviso 10min antes (SMS/Push)</p>
                  <p className="text-[11px] text-slate-400">Reduz no-show de última hora</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleReminderItem('smsPush10min')}
                  className={`w-10 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
                    reminders.smsPush10min ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      reminders.smsPush10min ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Performance Stat */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-xl">trending_up</span>
                <div>
                  <p className="font-heading font-extrabold text-sm text-slate-900 dark:text-white">89.4%</p>
                  <p className="text-[11px] text-slate-400">Taxa de Comparecimento</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                +14% vs. manual
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Novo Agendamento */}
      {isNewAptModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                Novo Agendamento Comercial
              </h3>
              <button
                onClick={() => setIsNewAptModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateAppointment} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Título da Reunião
                </label>
                <input
                  type="text"
                  required
                  value={aptTitle}
                  onChange={e => setAptTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cliente / Lead
                  </label>
                  <input
                    type="text"
                    required
                    value={aptContactName}
                    onChange={e => setAptContactName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Empresa
                  </label>
                  <input
                    type="text"
                    value={aptCompany}
                    onChange={e => setAptCompany(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Data</label>
                  <input
                    type="date"
                    required
                    value={aptDate}
                    onChange={e => setAptDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Horário</label>
                  <input
                    type="time"
                    required
                    value={aptTime}
                    onChange={e => setAptTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Canal</label>
                  <select
                    value={aptChannel}
                    onChange={e => setAptChannel(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="meet">Google Meet (Vídeo)</option>
                    <option value="whatsapp">WhatsApp Call</option>
                    <option value="presencial">Presencial no Cliente</option>
                    <option value="phone">Telefone</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Valor da Oportunidade (R$)
                  </label>
                  <input
                    type="number"
                    value={aptValue}
                    onChange={e => setAptValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewAptModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/20"
                >
                  Confirmar Agendamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
