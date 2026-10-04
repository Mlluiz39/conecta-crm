import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';
import { useCrm } from '../context/CrmContext';
import { ChannelBadge } from '../components/common/ChannelBadge';

export const DashboardPage: React.FC = () => {
  const {
    contacts,
    opportunities,
    stages,
    appointments,
    setActivePage,
    setSelectedContact,
    setIsNewLeadModalOpen,
    addToast
  } = useCrm();

  const [period, setPeriod] = useState<'30d' | 'hoje' | 'mes' | 'q2'>('30d');

  // Calculate dynamic metrics from local state
  const totalContacted = 1482 + contacts.length;
  const totalFunnelValue = opportunities.reduce((acc, o) => acc + o.value, 0) || 384500;
  const newLeadsCount = contacts.length || 349;
  const conversionRate = 22.8;
  const totalVisits = appointments.length || 62;

  // Chart data
  const revenueMonthlyData = [
    { month: 'Jan', value: 110000, label: 'R$ 110k' },
    { month: 'Fev', value: 128000, label: 'R$ 128k' },
    { month: 'Mar', value: 142000, label: 'R$ 142k' },
    { month: 'Abr', value: 135000, label: 'R$ 135k' },
    { month: 'Mai', value: 172000, label: 'R$ 172k' },
    { month: 'Jun', value: 205000, label: 'R$ 205k' },
  ];

  const leadsConversionWeeklyData = [
    { week: 'Sem 1', leads: 48, convertidos: 12 },
    { week: 'Sem 2', leads: 64, convertidos: 16 },
    { week: 'Sem 3', leads: 72, convertidos: 19 },
    { week: 'Sem 4', leads: 80, convertidos: 22 },
    { week: 'Sem 5', leads: 92, convertidos: 27 },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Command Context Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-4">
          <div className="relative">
            <img
              src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=120&auto=format&fit=crop&q=80"
              alt="Marcelo Luiz"
              className="w-14 h-14 rounded-2xl object-cover ring-2 ring-indigo-500/30 shadow-sm"
            />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading font-extrabold text-xl text-slate-900 dark:text-white tracking-tight">
                Olá, Marcelo Luiz
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold text-xs border border-indigo-200 dark:border-indigo-800">
                Admin Geral
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Operação ativa em São Paulo • Hub Comercial Omnichannel
            </p>
          </div>
        </div>

        {/* Date Period Filter + Action Pill */}
        <div className="flex items-center gap-2 self-start lg:self-auto flex-wrap">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => setPeriod('hoje')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                period === 'hoje'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setPeriod('mes')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                period === 'mes'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Este Mês
            </button>
            <button
              onClick={() => setPeriod('30d')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                period === '30d'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Últimos 30 dias
            </button>
            <button
              onClick={() => setPeriod('q2')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                period === 'q2'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Q4 2024
            </button>
          </div>

          <button
            onClick={() => addToast('Exportação Iniciada', 'Gerando planilha consolidada XLS...', 'info')}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
            title="Exportar Relatório Consolidado"
          >
            <span className="material-symbols-outlined text-lg leading-none">download</span>
          </button>
        </div>
      </div>

      {/* 5 KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI 1: Clientes contactados */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between hover:shadow-md transition-shadow group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Clientes Contactados
            </span>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-xl">forum</span>
            </div>
          </div>
          <div>
            <div className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tracking-tight">
              {totalContacted.toLocaleString('pt-BR')}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="material-symbols-outlined text-sm">trending_up</span>
              <span>+12.4%</span>
              <span className="text-slate-400 font-normal">vs mês ant.</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Valor do Funil em R$ */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between hover:shadow-md transition-shadow group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Valor do Funil
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-xl">payments</span>
            </div>
          </div>
          <div>
            <div className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tracking-tight truncate">
              R$ {totalFunnelValue.toLocaleString('pt-BR')}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="material-symbols-outlined text-sm">trending_up</span>
              <span>+8.2%</span>
              <span className="text-slate-400 font-normal">vs mês ant.</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Leads Novos */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between hover:shadow-md transition-shadow group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Leads Novos
            </span>
            <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center text-violet-600 dark:text-violet-400 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-xl">person_add</span>
            </div>
          </div>
          <div>
            <div className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tracking-tight">
              {newLeadsCount}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="material-symbols-outlined text-sm">trending_up</span>
              <span>+18.6%</span>
              <span className="text-slate-400 font-normal">vs mês ant.</span>
            </div>
          </div>
        </div>

        {/* KPI 4: Taxa de Conversão */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between hover:shadow-md transition-shadow group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Taxa de Conversão
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-xl">pie_chart</span>
            </div>
          </div>
          <div>
            <div className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tracking-tight">
              {conversionRate.toFixed(1)}%
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="material-symbols-outlined text-sm">trending_up</span>
              <span>+3.2%</span>
              <span className="text-slate-400 font-normal">vs mês ant.</span>
            </div>
          </div>
        </div>

        {/* KPI 5: Visitas Agendadas */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between hover:shadow-md transition-shadow group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Visitas Agendadas
            </span>
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-xl">calendar_month</span>
            </div>
          </div>
          <div>
            <div className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tracking-tight">
              {totalVisits}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="material-symbols-outlined text-sm">trending_up</span>
              <span>+15.0%</span>
              <span className="text-slate-400 font-normal">vs mês ant.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Analytical Dual Visualizations Section (Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Faturamento Mensal (BarChart) */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                Faturamento Mensal
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Receita consolidada de vendas (Janeiro a Junho)
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
              Total: R$ 892.400
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueMonthlyData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={val => `R$${val / 1000}k`}
                />
                <Tooltip
                  formatter={(val: any) => [`R$ ${Number(val || 0).toLocaleString('pt-BR')}`, 'Faturamento']}
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="value"
                  fill="#4f46e5"
                  radius={[8, 8, 0, 0]}
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              Média mensal: R$ 148.730
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              +19.1% recorde histórico em Junho
            </span>
          </div>
        </div>

        {/* Chart 2: Leads vs Conversão Semanal (AreaChart) */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                Leads vs Conversão Semanal
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Taxa de captação e conclusão por ciclo de 7 dias
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                <span className="w-3 h-1 bg-indigo-600 rounded-full" /> Leads
              </span>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span className="w-3 h-1 bg-emerald-600 rounded-full" /> Convertidos
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={leadsConversionWeeklyData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="week" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="leads"
                  stroke="#4f46e5"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#leadsGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="convertidos"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#convGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold">
              <span className="material-symbols-outlined text-sm">bolt</span>
              Semana 5 com pico de 92 novos leads
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Eficiência de fechamento: 29.3%
            </span>
          </div>
        </div>
      </div>

      {/* Preview do Pipeline de Oportunidades (Compact Kanban matching Image 4) */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">view_kanban</span>
            </div>
            <div>
              <h2 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                Preview do Pipeline de Oportunidades
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gestão em tempo real de negócios por estágio e valor acumulado
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActivePage('pipeline')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
            >
              <span>Ver Kanban Completo</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
            <button
              onClick={() => setIsNewLeadModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <span className="material-symbols-outlined text-base">add</span>
              <span>Adicionar Card</span>
            </button>
          </div>
        </div>

        {/* 5 Kanban Stage Columns Preview */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5 pt-2">
          {stages.slice(0, 5).map(stage => {
            const stageOps = opportunities.filter(o => o.stageId === stage.id);
            const stageTotal = stageOps.reduce((acc, o) => acc + o.value, 0);

            return (
              <div
                key={stage.id}
                className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex flex-col gap-2.5 border border-slate-100 dark:border-slate-800"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-1 border-b border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color || '#4f46e5' }}
                    />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {stage.name}
                    </span>
                    <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                      {stageOps.length}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    R$ {(stageTotal / 1000).toFixed(0)}k
                  </span>
                </div>

                {/* Cards in Column */}
                <div className="space-y-2">
                  {stageOps.slice(0, 2).map(op => {
                    const contact = contacts.find(c => c.id === op.contactId);
                    return (
                      <div
                        key={op.id}
                        onClick={() => {
                          if (contact) {
                            setSelectedContact(contact);
                            setActivePage('contatos');
                          }
                        }}
                        className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-xs hover:shadow-md transition-all border border-slate-100 dark:border-slate-700 cursor-pointer group"
                      >
                        <div className="flex items-start justify-between gap-1 mb-1.5">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 transition-colors">
                            {op.contactName}
                          </h4>
                          <ChannelBadge channel={op.channel} size="sm" />
                        </div>
                        <div className="font-heading font-extrabold text-sm text-indigo-600 dark:text-indigo-400 mb-2">
                          R$ {op.value.toLocaleString('pt-BR')}
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-50 dark:border-slate-700/50 pt-1.5">
                          <span className="truncate">{op.company}</span>
                          <span className="shrink-0">{op.lastActivity}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Mini Footer / System State Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 pt-2 px-1">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span>Sincronização com WhatsApp Cloud API e Instagram Graph ativa (Latência: 38ms)</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => addToast('Regras de Distribuição', 'Distribuição inteligente round-robin ativa para corretores.', 'info')}
            className="hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            Regras de Distribuição
          </button>
          <span>•</span>
          <button
            onClick={() => addToast('Exportar XLS', 'Download do relatório consolidado gerado.', 'success')}
            className="hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            Exportar XLS
          </button>
          <span>•</span>
          <button
            onClick={() => setActivePage('configuracoes')}
            className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
          >
            Central de Configurações
          </button>
        </div>
      </div>
    </div>
  );
};
