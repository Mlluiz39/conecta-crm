import React, { useState } from 'react';
import { useCrm } from '../context/CrmContext';
import { WhatsAppTemplate } from '../types/crm';

export const TemplatesPage: React.FC = () => {
  const { templates, updateTemplate, addTemplate, addToast } = useCrm();

  const [statusFilter, setStatusFilter] = useState<'all' | 'APROVADO' | 'PENDENTE' | 'REJEITADO'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);

  // Form Fields
  const [templateName, setTemplateName] = useState('lembrete_reuniao_comercial');
  const [category, setCategory] = useState<'UTILIDADE' | 'MARKETING' | 'AUTENTICACAO'>('UTILIDADE');
  const [headerType, setHeaderType] = useState<'none' | 'text' | 'image' | 'document'>('text');
  const [headerText, setHeaderText] = useState('Confirmação de Reunião com Marcelo Luiz');
  const [bodyText, setBodyText] = useState(
    'Olá, {{1}}! Aqui é da equipe ConectaCRM. Confirmamos sua demonstração exclusiva para {{2}} às {{3}} com nosso especialista {{4}}. Por favor, confirme sua presença clicando abaixo.'
  );
  const [footerText, setFooterText] = useState('ConectaCRM - Gestão Comercial Inteligente');
  const [btn1Text, setBtn1Text] = useState('Sim, estarei presente');
  const [btn2Text, setBtn2Text] = useState('Preciso remarcar');
  const [btn3Text, setBtn3Text] = useState('Acessar Google Meet');
  const [btn3Url, setBtn3Url] = useState('https://meet.google.com/xyz-crm');

  const filteredTemplates = templates.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.body.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const openNewModal = () => {
    setEditingTemplate(null);
    setTemplateName('novo_modelo_whatsapp');
    setCategory('UTILIDADE');
    setHeaderType('text');
    setHeaderText('Aviso Importante');
    setBodyText('Olá, {{1}}! Recebemos sua solicitação na {{2}}.');
    setFooterText('ConectaCRM');
    setIsModalOpen(true);
  };

  const openEditModal = (tpl: WhatsAppTemplate) => {
    setEditingTemplate(tpl);
    setTemplateName(tpl.name);
    setCategory(tpl.category);
    setHeaderType(tpl.headerType);
    setHeaderText(tpl.headerText || '');
    setBodyText(tpl.body);
    setFooterText(tpl.footer || '');
    setBtn1Text(tpl.buttons?.[0]?.text || '');
    setBtn2Text(tpl.buttons?.[1]?.text || '');
    setBtn3Text(tpl.buttons?.[2]?.text || '');
    setBtn3Url(tpl.buttons?.[2]?.value || 'https://meet.google.com');
    setIsModalOpen(true);
  };

  const handleSave = (status: 'APROVADO' | 'PENDENTE' = 'PENDENTE') => {
    const buttons = [];
    if (btn1Text) buttons.push({ type: 'quick_reply' as const, text: btn1Text });
    if (btn2Text) buttons.push({ type: 'quick_reply' as const, text: btn2Text });
    if (btn3Text) buttons.push({ type: 'url' as const, text: btn3Text, value: btn3Url });

    if (editingTemplate) {
      updateTemplate({
        ...editingTemplate,
        name: templateName,
        category,
        headerType,
        headerText,
        body: bodyText,
        footer: footerText,
        buttons,
        status,
        updatedAt: 'Agora',
      });
    } else {
      addTemplate({
        name: templateName,
        category,
        language: 'pt_BR',
        headerType,
        headerText,
        body: bodyText,
        footer: footerText,
        buttons,
        status,
      });
    }
    setIsModalOpen(false);
  };

  const insertVariable = (tag: string) => {
    setBodyText(prev => `${prev} ${tag}`);
  };

  // Preview formatted text substituting variables
  const previewFormattedBody = bodyText
    .replace(/\{\{1\}\}/g, 'Rafael Costa')
    .replace(/\{\{2\}\}/g, '24/10')
    .replace(/\{\{3\}\}/g, '16:00')
    .replace(/\{\{4\}\}/g, 'Marcelo Luiz');

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200/80 dark:border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tracking-tight">
              Templates de WhatsApp (HSM)
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-xs flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Meta Cloud API Conectada
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Gerencie modelos de mensagens pré-aprovados pela Meta Cloud API para disparos automáticos, réguas comerciais e campanhas.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => addToast('Sincronização Meta', 'Todos os 6 templates verificados com sucesso no Business Manager.', 'success')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 shadow-xs transition-colors"
          >
            <span className="material-symbols-outlined text-indigo-600 text-base">sync</span>
            <span>Sincronizar com Meta</span>
          </button>
          <button
            onClick={openNewModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
          >
            <span className="material-symbols-outlined text-base">add</span>
            <span>Novo Template</span>
          </button>
        </div>
      </div>

      {/* Filter and Status Chips Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto text-xs font-bold">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              statusFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Todos ({templates.length})
          </button>
          <button
            onClick={() => setStatusFilter('APROVADO')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              statusFilter === 'APROVADO'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Aprovados ({templates.filter(t => t.status === 'APROVADO').length})
          </button>
          <button
            onClick={() => setStatusFilter('PENDENTE')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              statusFilter === 'PENDENTE'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Pendentes ({templates.filter(t => t.status === 'PENDENTE').length})
          </button>
          <button
            onClick={() => setStatusFilter('REJEITADO')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              statusFilter === 'REJEITADO'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Rejeitados ({templates.filter(t => t.status === 'REJEITADO').length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome ou texto..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {/* Templates Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredTemplates.map(tpl => {
          const isApproved = tpl.status === 'APROVADO';
          const isPending = tpl.status === 'PENDENTE';
          const isRejected = tpl.status === 'REJEITADO';

          return (
            <div
              key={tpl.id}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-5 flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                {/* Card Top: Name and Status Badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <h3 className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate">
                      {tpl.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="px-2 py-0.2 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                        {tpl.category}
                      </span>
                      <span className="text-[10px] text-slate-400">pt_BR 🇧🇷</span>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 flex items-center gap-1 ${
                      isApproved
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : isPending
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xs">
                      {isApproved ? 'check_circle' : isPending ? 'schedule' : 'cancel'}
                    </span>
                    {tpl.status}
                  </span>
                </div>

                {/* Rejection Alert if rejected */}
                {isRejected && tpl.rejectionReason && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-[11px] leading-tight flex items-start gap-1.5 my-2 border border-rose-200 dark:border-rose-800">
                    <span className="material-symbols-outlined text-xs shrink-0 mt-0.5">error</span>
                    <span>{tpl.rejectionReason}</span>
                  </div>
                )}

                {/* WhatsApp Chat Balloon Preview */}
                <div className="my-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 space-y-2">
                  {tpl.headerText && (
                    <p className="font-heading font-bold text-xs text-slate-900 dark:text-white">
                      {tpl.headerText}
                    </p>
                  )}
                  {tpl.headerMediaUrl && (
                    <img
                      src={tpl.headerMediaUrl}
                      alt="Header Preview"
                      className="w-full h-24 object-cover rounded-lg"
                    />
                  )}
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
                    {tpl.body}
                  </p>
                  {tpl.footer && (
                    <p className="text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-1">
                      {tpl.footer}
                    </p>
                  )}

                  {/* Buttons preview */}
                  {tpl.buttons && tpl.buttons.length > 0 && (
                    <div className="pt-2 space-y-1">
                      {tpl.buttons.map((b, i) => (
                        <div
                          key={i}
                          className="py-1.5 px-3 rounded-lg bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-bold text-[11px] text-center shadow-xs border border-slate-200/60 dark:border-slate-700"
                        >
                          {b.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer: Metrics & Actions */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-400">
                  <span className="material-symbols-outlined text-xs text-emerald-600">send</span>
                  {tpl.metrics.sent.toLocaleString('pt-BR')} enviados
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(tpl)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Editar Template"
                  >
                    <span className="material-symbols-outlined text-base">edit</span>
                  </button>
                  <button
                    onClick={() => addToast('Duplicado', `Cópia do template ${tpl.name} criada.`, 'info')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Duplicar"
                  >
                    <span className="material-symbols-outlined text-base">content_copy</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CREATE / EDIT TEMPLATE MODAL WITH LIVE WHATSAPP PHONE PREVIEW */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col my-auto max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                  <span className="material-symbols-outlined text-xl">mark_chat_unread</span>
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                    {editingTemplate ? 'Editar Template WhatsApp' : 'Criar Novo Template para Meta WhatsApp'}
                  </h3>
                  <p className="text-xs text-slate-400">Configure o modelo oficial de acordo com as diretrizes da Meta Cloud API.</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Modal Body: 2 Columns (Form on left, Phone Preview on right) */}
            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/50 dark:bg-slate-950/40">
              {/* Form Config (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nome do Template * (letras minúsculas e _ apenas)
                  </label>
                  <input
                    type="text"
                    required
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    placeholder="ex: confirmacao_visita_comercial"
                    className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 font-mono text-xs text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Categoria da Meta
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'UTILIDADE', label: 'Utilidade', desc: 'Agendamentos e pedidos' },
                      { id: 'MARKETING', label: 'Marketing', desc: 'Ofertas e campanhas' },
                      { id: 'AUTENTICACAO', label: 'Autenticação', desc: 'Códigos 2FA / OTP' },
                    ].map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id as any)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          category === cat.id
                            ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-600 text-indigo-700 dark:text-indigo-300'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <p className="font-bold text-xs">{cat.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{cat.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Tipo de Cabeçalho
                    </label>
                    <select
                      value={headerType}
                      onChange={e => setHeaderType(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="text">Texto</option>
                      <option value="image">Mídia: Imagem</option>
                      <option value="document">Mídia: PDF / Documento</option>
                      <option value="none">Nenhum</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Texto do Cabeçalho
                    </label>
                    <input
                      type="text"
                      value={headerText}
                      onChange={e => setHeaderText(e.target.value)}
                      placeholder="Ex: Confirmação de Demonstração"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Corpo da Mensagem (Body) *
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 text-[10px]">Inserir:</span>
                      {['{{1}}', '{{2}}', '{{3}}', '{{4}}'].map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => insertVariable(tag)}
                          className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-indigo-600 font-mono text-[10px] font-bold"
                        >
                          +{tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    required
                    value={bodyText}
                    onChange={e => setBodyText(e.target.value)}
                    className="w-full p-3 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed font-sans"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Rodapé (Footer Opcional)
                  </label>
                  <input
                    type="text"
                    value={footerText}
                    onChange={e => setFooterText(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs"
                  />
                </div>

                {/* Buttons Config */}
                <div className="space-y-2 text-xs">
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                    Botões de Interação (Máx. 3)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={btn1Text}
                      onChange={e => setBtn1Text(e.target.value)}
                      placeholder="Botão 1 (Resposta rápida)"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={btn2Text}
                      onChange={e => setBtn2Text(e.target.value)}
                      placeholder="Botão 2 (Resposta rápida)"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={btn3Text}
                      onChange={e => setBtn3Text(e.target.value)}
                      placeholder="Botão 3 (Link URL)"
                      className="w-1/3 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                    <input
                      type="text"
                      value={btn3Url}
                      onChange={e => setBtn3Url(e.target.value)}
                      placeholder="https://meet.google.com/..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[11px]"
                    />
                  </div>
                </div>
              </div>

              {/* Phone Live Preview (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 overflow-hidden">
                  {/* Phone Header */}
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                        C
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">ConectaCRM</span>
                          <span className="material-symbols-outlined text-indigo-600 text-xs">verified</span>
                        </div>
                        <span className="text-[10px] text-slate-400">Conta Comercial Oficial</span>
                      </div>
                    </div>
                  </div>

                  {/* Simulated WhatsApp Wallpaper */}
                  <div className="p-4 bg-[#efeae2]/50 dark:bg-slate-950/70 min-h-[380px] flex flex-col justify-end">
                    <div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl shadow-sm space-y-2 border border-slate-200/60 dark:border-slate-700 max-w-sm ml-auto">
                      {headerText && (
                        <p className="font-bold text-xs text-slate-900 dark:text-white">{headerText}</p>
                      )}
                      <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans">
                        {previewFormattedBody}
                      </p>
                      {footerText && (
                        <p className="text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-1">
                          {footerText}
                        </p>
                      )}
                      <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400">
                        <span>14:48</span>
                        <span className="material-symbols-outlined text-xs text-indigo-500">done_all</span>
                      </div>
                    </div>

                    {/* Interactive Buttons Preview */}
                    <div className="mt-2 space-y-1 max-w-sm ml-auto w-full text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      {btn1Text && (
                        <div className="py-2 px-3 rounded-xl bg-white dark:bg-slate-800 text-center shadow-xs border border-slate-200/60 dark:border-slate-700 flex items-center justify-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">reply</span>
                          <span>{btn1Text}</span>
                        </div>
                      )}
                      {btn2Text && (
                        <div className="py-2 px-3 rounded-xl bg-white dark:bg-slate-800 text-center shadow-xs border border-slate-200/60 dark:border-slate-700 flex items-center justify-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">reply</span>
                          <span>{btn2Text}</span>
                        </div>
                      )}
                      {btn3Text && (
                        <div className="py-2 px-3 rounded-xl bg-white dark:bg-slate-800 text-center shadow-xs border border-slate-200/60 dark:border-slate-700 flex items-center justify-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                          <span>{btn3Text}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Meta Approval Tips */}
                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                  <span className="font-bold text-indigo-600 flex items-center gap-1">
                    <span className="material-symbols-outlined text-base">tips_and_updates</span>
                    Dicas de Aprovação Meta
                  </span>
                  <ul className="text-slate-500 space-y-1 list-disc list-inside text-[11px]">
                    <li>Mantenha as variáveis sequenciais: {'{{1}}'}, {'{{2}}'}.</li>
                    <li>Evite caixa alta excessiva ou termos apelativos de spam.</li>
                    <li>Tempo de análise na Meta Cloud API: ~1 a 15 minutos.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">WABA ID: 94810294812</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSave('PENDENTE')}
                  className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-300"
                >
                  Salvar Rascunho
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleSave('APROVADO');
                    addToast('Template Submetido', 'Modelo enviado com sucesso para a fila de análise da Meta Cloud API.', 'success');
                  }}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20"
                >
                  Enviar para Aprovação da Meta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
