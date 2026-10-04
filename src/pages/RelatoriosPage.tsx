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
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from 'recharts';
import { INITIAL_AGENT_PERFORMANCE } from '../mocks/initialData';
import { exportAgentPerformanceToCSV } from '../services/exportService';
import { useCrm } from '../context/CrmContext';

export const RelatoriosPage: React.FC = () => {
  const { addToast } = useCrm();
  const [filterType, setFilterType] = useState<'all' | 'human' | 'ai'>('all');

  const monthlyRevenueData = [
    { month: 'Mai', value: 310000 },
    { month: 'Jun', value: 345000 },
    { month: 'Jul', value: 380000 },
    { month: 'Ago', value: 415000 },
    { month: 'Set', value: 428000 },
    { month: 'Out', value: 482650 },
  ];

  const leadsOverTimeData = [
    { week: 'Semana 1', total: 240, mql: 150 },
    { week: 'Semana 2', total: 320, mql: 200 },
    { week: 'Semana 3', total: 390, mql: 245 },
    { week: 'Semana 4', total: 478, mql: 297 },
  ];

  const channelDistributionData = [
    { name: 'WhatsApp Cloud API', value: 842, color: '#006e2f', percent: '59%' },
    { name: 'Instagram Direct', value: 396, color: '#e1306c', percent: '28%' },
    { name: 'Facebook Messenger', value: 128, color: '#4f46e5', percent: '9%' },
    { name: 'Webchat & Outros', value: 62, color: '#777587', percent: '4%' },
  ];

  const filteredAgents = INITIAL_AGENT_PERFORMANCE.filter(a => {
    if (filterType === 'human') return !a.isAi;
    if (filterType === 'ai') return a.isAi;
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Breadcrumb & Section Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>Analytics &amp; Inteligência</span>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="text-indigo-600 dark:text-indigo-400">Relatórios Comerciais</span>
          </div>
          <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tracking-tight mt-1">
            Relatórios de Vendas &amp; Atendimento
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">
            Acompanhe métricas consolidadas de receita, aquisição multicanal e eficiência da equipe em tempo real.
          </p>
        </div>

        {/* Date and Export Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 shadow-xs">
            <span className="material-symbols-outlined text-indigo-600 text-base">calendar_month</span>
            <span>01 a 31 de Outubro, 2024</span>
          </div>

          <button
            onClick={() => {
              exportAgentPerformanceToCSV(INITIAL_AGENT_PERFORMANCE);
              addToast('Relatório Exportado', 'Download do arquivo relatorio_performance_atendentes.csv iniciado.', 'success');
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
          >
            <span className="material-symbols-outlined text-base">download</span>
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* 4 Top KPI Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Receita Mensal
              </span>
              <h2 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white mt-1">
                R$ 482.650
              </h2>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">payments</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
              <span className="material-symbols-outlined text-sm">arrow_upward</span>
              <span>+18.4%</span>
              <span className="text-slate-400 font-normal">vs mês anterior</span>
            </div>
            <p className="text-slate-500 mt-1">Meta: <strong>R$ 450.000 (107%)</strong></p>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Leads Novos
              </span>
              <h2 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white mt-1">
                1.428
              </h2>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">person_add</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
              <span className="material-symbols-outlined text-sm">arrow_upward</span>
              <span>+12.1%</span>
              <span className="text-slate-400 font-normal">vs mês anterior</span>
            </div>
            <p className="text-slate-500 mt-1"><strong className="text-emerald-600">842</strong> WhatsApp, <strong className="text-pink-600">396</strong> Instagram</p>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Taxa de Conversão Geral
              </span>
              <h2 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white mt-1">
                22.8%
              </h2>
            </div>
            <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">trending_up</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
              <span className="material-symbols-outlined text-sm">arrow_upward</span>
              <span>+3.2%</span>
              <span className="text-slate-400 font-normal">vs mês anterior</span>
            </div>
            <p className="text-slate-500 mt-1">Benchmark do setor: 16.5%</p>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Tempo Médio de Resposta
              </span>
              <h2 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white mt-1">
                3.4 min
              </h2>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">timer</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
              <span className="material-symbols-outlined text-sm">arrow_downward</span>
              <span>-42%</span>
              <span className="text-slate-400 font-normal">mais rápido</span>
            </div>
            <p className="text-slate-500 mt-1">Sofia (IA): <strong className="text-indigo-600">4.1s</strong> • Equipe: 7.8 min</p>
          </div>
        </div>
      </div>

      {/* 2x2 Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Evolução da Receita Mensal */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                Evolução da Receita Mensal (2024)
              </h3>
              <p className="text-xs text-slate-500">Comparativo de Maio a Outubro com linha de meta mensal</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1 text-indigo-600">
                <span className="w-3 h-3 rounded bg-indigo-600" /> Realizado
              </span>
              <span className="flex items-center gap-1 text-rose-500">
                <span className="w-3 h-0.5 bg-rose-500" /> Meta (R$ 450k)
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRevenueData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={val => `R$${val / 1000}k`} />
                <Tooltip
                  formatter={(val: any) => [`R$ ${Number(val || 0).toLocaleString('pt-BR')}`, 'Receita']}
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <ReferenceLine y={450000} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Meta: 450k', fill: '#ef4444', fontSize: 10 }} />
                <Bar dataKey="value" fill="#4f46e5" radius={[8, 8, 0, 0]} barSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <span>Taxa de Atingimento Global</span>
            <span className="font-bold text-emerald-600">107.2% da meta alcançada em Outubro</span>
          </div>
        </div>

        {/* Chart 2: Novos Leads ao Longo do Tempo */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                Novos Leads ao Longo do Tempo
              </h3>
              <p className="text-xs text-slate-500">Evolução semanal de captação vs leads qualificados (MQL)</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1 text-indigo-600">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> Total Leads
              </span>
              <span className="flex items-center gap-1 text-emerald-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> Leads MQL
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={leadsOverTimeData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="week" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Area type="monotone" dataKey="total" stroke="#4f46e5" strokeWidth={3} fill="#4f46e5" fillOpacity={0.15} />
                <Area type="monotone" dataKey="mql" stroke="#10b981" strokeWidth={2.5} fill="#10b981" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <span>Índice MQL / Lead Total</span>
            <span className="font-bold text-slate-900 dark:text-white">62.5% de qualificação qualificada</span>
          </div>
        </div>

        {/* Chart 3: Funil de Conversão por Etapa */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                Funil de Conversão por Etapa
              </h3>
              <p className="text-xs text-slate-500">Taxa de passagem entre fases do funil comercial</p>
            </div>
            <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300">
              5 Etapas Ativas
            </span>
          </div>

          <div className="space-y-4 py-2">
            <div>
              <div className="flex justify-between items-center mb-1 text-xs font-bold">
                <span className="text-slate-700 dark:text-slate-300">1. Entrada / Novos Contatos</span>
                <span>1.428 leads (100%)</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                <div className="bg-indigo-600 h-3 rounded-full w-full" />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1 text-xs font-bold">
                <span className="text-slate-700 dark:text-slate-300">2. Qualificados MQL (Sofia IA)</span>
                <span>892 leads (62.5%)</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                <div className="bg-indigo-500 h-3 rounded-full w-[62.5%]" />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1 text-xs font-bold">
                <span className="text-slate-700 dark:text-slate-300">3. Reunião / Demonstração</span>
                <span>485 reuniões (34.0%)</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                <div className="bg-indigo-400 h-3 rounded-full w-[34%]" />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1 text-xs font-bold">
                <span className="text-slate-700 dark:text-slate-300">4. Proposta Enviada</span>
                <span>382 propostas (26.7%)</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                <div className="bg-emerald-500 h-3 rounded-full w-[26.7%]" />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1 text-xs font-bold text-emerald-600">
                <span>5. Negócios Fechados (Ganho)</span>
                <span>326 clientes (22.8%)</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                <div className="bg-emerald-600 h-3 rounded-full w-[22.8%]" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <span>Conversão Proposta → Fechamento</span>
            <span className="font-bold text-emerald-600">85.3%</span>
          </div>
        </div>

        {/* Chart 4: Distribuição por Canal (Donut) */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                Distribuição de Leads por Canal
              </h3>
              <p className="text-xs text-slate-500">Aquisições consolidadas por canal digital</p>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">
              WhatsApp Dominante
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
            <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channelDistributionData}
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {channelDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">1.428</span>
                <span className="text-[10px] text-slate-400 font-bold">Total Leads</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 w-full max-w-xs text-xs">
              {channelDistributionData.map(ch => (
                <div key={ch.name} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ch.color }} />
                    <span className="font-medium text-slate-700 dark:text-slate-300">{ch.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-900 dark:text-white">{ch.percent}</span>
                    <span className="text-[10px] text-slate-400 block">{ch.value} leads</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <span>Canal de Maior Retenção</span>
            <span className="font-bold text-slate-900 dark:text-white">WhatsApp (Ticket Médio R$ 1.540)</span>
          </div>
        </div>
      </div>

      {/* Performance dos Atendentes Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
              Performance da Equipe Comercial &amp; IA
            </h3>
            <p className="text-xs text-slate-500">Produtividade, velocidade de atendimento e geração de receita</p>
          </div>

          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filterType === 'all'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Todos (6)
            </button>
            <button
              onClick={() => setFilterType('human')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filterType === 'human'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Humanos (5)
            </button>
            <button
              onClick={() => setFilterType('ai')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filterType === 'ai'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Agentes IA (1)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-3 rounded-l-xl">Atendente</th>
                <th className="py-3 px-3">Conversas Atendidas</th>
                <th className="py-3 px-3">Tempo Médio (TMR)</th>
                <th className="py-3 px-3">Leads Convertidos</th>
                <th className="py-3 px-3">Taxa de Conversão</th>
                <th className="py-3 px-3">Receita Gerada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {filteredAgents.map(a => (
                <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2.5">
                      {a.isAi ? (
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 font-bold flex items-center justify-center text-xs">
                          🤖
                        </div>
                      ) : (
                        <img
                          src={a.avatar || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=80&auto=format&fit=crop&q=80'}
                          alt={a.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 dark:text-white">{a.name}</span>
                          {a.badge && (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-[10px]">
                              {a.badge}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">{a.role}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 font-semibold">{a.conversationsHandled}</td>
                  <td className="py-3 px-3 font-bold text-indigo-600">{a.avgResponseTime}</td>
                  <td className="py-3 px-3 font-semibold">{a.convertedLeads}</td>
                  <td className="py-3 px-3 font-bold text-emerald-600">{a.conversionRate.toFixed(1)}%</td>
                  <td className="py-3 px-3 font-heading font-extrabold text-sm text-slate-900 dark:text-white">
                    R$ {a.revenueGenerated.toLocaleString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
