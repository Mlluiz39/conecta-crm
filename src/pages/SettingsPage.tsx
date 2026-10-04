import React, { useState } from 'react';
import { useCrm } from '../context/CrmContext';
import { BusinessPresetType, CustomFieldDefinition, CustomFieldType, PipelineStage } from '../types/crm';
import { BUSINESS_PRESETS } from '../mocks/businessPresets';
import {
  Building2,
  ShoppingBag,
  Stethoscope,
  Briefcase,
  CheckCircle2,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Sparkles,
  Sliders,
  Layers,
  Database,
  Calendar,
  Key,
  Webhook,
  Bot,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Check,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const {
    businessPreset,
    setBusinessPreset,
    customFields,
    addCustomField,
    removeCustomField,
    pipelineStages,
    updatePipelineStage,
    reminderSettings,
    updateReminderSettings,
    addToast,
  } = useCrm();

  const [activeTab, setActiveTab] = useState<'preset' | 'fields' | 'pipeline' | 'reminders' | 'integrations'>('preset');

  // New Custom Field Form State
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>('text');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldOptions, setNewFieldOptions] = useState('');

  // Preset switch confirmation dialog
  const [pendingPreset, setPendingPreset] = useState<BusinessPresetType | null>(null);

  const presetsList: Array<{
    id: BusinessPresetType;
    name: string;
    icon: typeof Building2;
    description: string;
    highlights: string[];
    accentColor: string;
  }> = [
    {
      id: 'imobiliaria',
      name: 'Imobiliária & Construtora',
      icon: Building2,
      description: 'Estruturado para captação, visitas a decorados, propostas de compra/locação e comissionamento.',
      highlights: ['Campos de Creci, Bairro e Imóvel', 'Funil com Visita Agendada e Proposta', 'Sofia - Especialista Imobiliária'],
      accentColor: 'indigo',
    },
    {
      id: 'ecommerce',
      name: 'E-commerce & Varejo D2C',
      icon: ShoppingBag,
      description: 'Otimizado para recuperação de carrinho, tracking de pedidos, suporte a trocas e recompra.',
      highlights: ['Campos de ID Pedido, Cupom e Carrinho', 'Funil de Abandono e Pós-venda', 'Lucas - Recuperador de Vendas'],
      accentColor: 'emerald',
    },
    {
      id: 'clinica',
      name: 'Clínica & Saúde / Odonto',
      icon: Stethoscope,
      description: 'Ideal para confirmações automáticas de consultas, triagem pré-anamnese e fidelização de pacientes.',
      highlights: ['Campos de Convênio, Especialidade e Data Consulta', 'Funil de Triagem e Retorno', 'Dra. Beatriz - Concierge Saúde'],
      accentColor: 'sky',
    },
    {
      id: 'agencia',
      name: 'Agência & Serviços B2B',
      icon: Briefcase,
      description: 'Focado em qualificação de budget B2B, discovery calls, envio de escopos e fechamento contratual.',
      highlights: ['Campos de CNPJ, Budget Mensal e Decisor', 'Funil de Diagnóstico e Negociação', 'Felipe - SDR & Qualificador'],
      accentColor: 'purple',
    },
  ];

  const handleApplyPreset = (id: BusinessPresetType) => {
    setBusinessPreset(id);
    setPendingPreset(null);
    addToast({
      type: 'success',
      title: 'Preset alterado!',
      message: `Configurações adaptadas para "${BUSINESS_PRESETS[id].name}". Campos, funil e agentes foram atualizados.`,
    });
  };

  const handleCreateField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim()) {
      addToast({ type: 'warning', title: 'Atenção', message: 'Digite o nome do campo customizado.' });
      return;
    }

    const key = newFieldKey.trim() || newFieldName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const options = newFieldType === 'select' && newFieldOptions.trim()
      ? newFieldOptions.split(',').map((o) => o.trim()).filter(Boolean)
      : undefined;

    const newField: CustomFieldDefinition = {
      id: `field_${Date.now()}`,
      key,
      name: newFieldName.trim(),
      type: newFieldType,
      required: newFieldRequired,
      options,
    };

    addCustomField(newField);
    setNewFieldName('');
    setNewFieldKey('');
    setNewFieldType('text');
    setNewFieldRequired(false);
    setNewFieldOptions('');

    addToast({
      type: 'success',
      title: 'Campo adicionado!',
      message: `O campo "${newField.name}" agora está disponível nos contatos.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-heading">
            Configurações & Adaptação de Negócio
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Personalize o CRM para o seu nicho de atuação, crie campos customizados e gerencie conexões.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Preset Atual: {BUSINESS_PRESETS[businessPreset]?.name}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('preset')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'preset'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Tipo de Negócio (Presets)
        </button>
        <button
          onClick={() => setActiveTab('fields')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'fields'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Campos Customizados ({customFields.length})
        </button>
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'pipeline'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Layers className="w-4 h-4" />
          Etapas do Funil ({pipelineStages.length})
        </button>
        <button
          onClick={() => setActiveTab('reminders')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'reminders'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Lembretes Automáticos
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'integrations'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Webhook className="w-4 h-4" />
          Integrações & Supabase
        </button>
      </div>

      {/* TAB 1: PRESETS */}
      {activeTab === 'preset' && (
        <div className="space-y-6">
          <div className="bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40 rounded-xl p-4 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <h4 className="font-semibold text-indigo-900 dark:text-indigo-200">
                Como funcionam os Presets de Negócio?
              </h4>
              <p className="text-indigo-700/80 dark:text-indigo-300/80 mt-1">
                Ao selecionar um segmento, o ConectaCRM reconfigura automaticamente os campos customizados dos contatos, as etapas do pipeline de vendas, as tags padrão e os prompts iniciais dos Agentes de IA para a linguagem do seu mercado.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {presetsList.map((preset) => {
              const Icon = preset.icon;
              const isCurrent = businessPreset === preset.id;
              return (
                <div
                  key={preset.id}
                  className={`relative p-5 rounded-2xl border transition-all ${
                    isCurrent
                      ? 'border-indigo-500 bg-white dark:bg-slate-900 shadow-md ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {isCurrent && (
                    <div className="absolute top-4 right-4 flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                      <Check className="w-3.5 h-3.5" /> Ativo
                    </div>
                  )}

                  <div className="flex items-start gap-3.5">
                    <div className={`p-3 rounded-xl ${
                      preset.id === 'imobiliaria' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' :
                      preset.id === 'ecommerce' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                      preset.id === 'clinica' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' :
                      'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                    }`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1 pr-14">
                      <h3 className="font-bold text-slate-900 dark:text-white text-base">
                        {preset.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {preset.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      O que inclui:
                    </span>
                    <ul className="mt-2 space-y-1.5">
                      {preset.highlights.map((h, i) => (
                        <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5 pt-3">
                    {isCurrent ? (
                      <button
                        disabled
                        className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-xs font-semibold cursor-default"
                      >
                        Preset atualmente em uso
                      </button>
                    ) : (
                      <button
                        onClick={() => setPendingPreset(preset.id)}
                        className="w-full py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 dark:text-indigo-300 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Mudar para este Preset
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Preset Change Confirmation Modal */}
          {pendingPreset && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
                <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center justify-center mb-4">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Confirmar alteração de preset?
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  Você está prestes a mudar para o preset{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    "{BUSINESS_PRESETS[pendingPreset]?.name}"
                  </strong>
                  . As etapas do funil, campos customizados e prompts padrão serão sincronizados para este segmento.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    onClick={() => setPendingPreset(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleApplyPreset(pendingPreset)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
                  >
                    Sim, aplicar alterações
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CUSTOM FIELDS */}
      {activeTab === 'fields' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Field Form */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs h-fit">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 mb-4">
              <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Adicionar Novo Campo
            </h3>
            <form onSubmit={handleCreateField} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome de Exibição *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Creci do Corretor, Bairro Desejado"
                  value={newFieldName}
                  onChange={(e) => {
                    setNewFieldName(e.target.value);
                    if (!newFieldKey) {
                      setNewFieldKey(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_'));
                    }
                  }}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chave do Campo (identificador)
                </label>
                <input
                  type="text"
                  placeholder="creci_corretor"
                  value={newFieldKey}
                  onChange={(e) => setNewFieldKey(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-400">Usado no banco e em variáveis de IA</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tipo de Dado
                </label>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value as CustomFieldType)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="text">Texto simples (string)</option>
                  <option value="number">Número (inteiro ou decimal)</option>
                  <option value="currency">Moeda (R$)</option>
                  <option value="date">Data (DD/MM/AAAA)</option>
                  <option value="select">Lista de opções (select)</option>
                </select>
              </div>

              {newFieldType === 'select' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Opções (separadas por vírgula)
                  </label>
                  <input
                    type="text"
                    placeholder="Opção 1, Opção 2, Opção 3"
                    value={newFieldOptions}
                    onChange={(e) => setNewFieldOptions(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="req_field"
                  checked={newFieldRequired}
                  onChange={(e) => setNewFieldRequired(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="req_field" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  Preenchimento obrigatório
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Criar Campo
              </button>
            </form>
          </div>

          {/* List of Custom Fields */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-4">
              Campos Ativos no Sistema ({customFields.length})
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {customFields.map((field) => (
                <div key={field.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white text-xs">
                        {field.name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {field.key}
                      </span>
                      {field.required && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 font-semibold">
                          Obrigatório
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                      <span>Tipo: <strong className="font-medium capitalize text-slate-700 dark:text-slate-300">{field.type}</strong></span>
                      {field.options && field.options.length > 0 && (
                        <span>Opções: {field.options.join(', ')}</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (confirm(`Remover o campo "${field.name}"?`)) {
                        removeCustomField(field.id);
                        addToast({ type: 'info', title: 'Campo removido', message: `O campo ${field.name} foi excluído.` });
                      }
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    title="Excluir campo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PIPELINE STAGES */}
      {activeTab === 'pipeline' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Etapas do Funil de Vendas
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Edite o nome e cor das colunas do Kanban. A ordem reflete a jornada do lead.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {pipelineStages.map((stage: PipelineStage, idx: number) => (
              <div
                key={stage.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-4"
              >
                <div className="w-6 text-center font-bold text-xs text-slate-400">
                  {idx + 1}
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase font-semibold">Nome da Etapa</label>
                    <input
                      type="text"
                      value={stage.name}
                      onChange={(e) => updatePipelineStage(stage.id, { name: e.target.value })}
                      className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase font-semibold">Cor Indicadora</label>
                    <select
                      value={stage.color}
                      onChange={(e) => updatePipelineStage(stage.id, { color: e.target.value })}
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white capitalize"
                    >
                      <option value="blue">Azul (Inicial)</option>
                      <option value="amber">Âmbar (Negociação)</option>
                      <option value="purple">Roxo (Visita/Apresentação)</option>
                      <option value="indigo">Índigo (Proposta)</option>
                      <option value="emerald">Esmeralda (Fechamento)</option>
                      <option value="rose">Rosa (Perdido)</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between sm:justify-start gap-4">
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase font-semibold">Taxa de Conversão</label>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {stage.targetConversionRate || 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => addToast({ type: 'success', title: 'Salvo', message: 'Etapas do funil salvas com sucesso.' })}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Save className="w-4 h-4" />
              Salvar Alterações
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: REMINDER SETTINGS */}
      {activeTab === 'reminders' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Configuração de Lembretes Automáticos de Visitas
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Defina como e quando o sistema deve notificar o cliente via WhatsApp antes de compromissos agendados.
            </p>
          </div>

          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Lembrete com 24 Horas de Antecedência
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Dispara mensagem no WhatsApp com dados do local e botão de confirmação.
                </p>
              </div>
              <input
                type="checkbox"
                checked={reminderSettings.enabled24h}
                onChange={(e) => updateReminderSettings({ enabled24h: e.target.checked })}
                className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Lembrete com 2 Horas de Antecedência
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Mensagem rápida alertando sobre o deslocamento e localização Waze/Google Maps.
                </p>
              </div>
              <input
                type="checkbox"
                checked={reminderSettings.enabled2h}
                onChange={(e) => updateReminderSettings({ enabled2h: e.target.checked })}
                className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Follow-up de Não Comparecimento (No-show)
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Se o cliente não comparecer, a IA envia mensagem gentil para reagendamento após 1 hora.
                </p>
              </div>
              <input
                type="checkbox"
                checked={reminderSettings.enabledNoShowFollowup}
                onChange={(e) => updateReminderSettings({ enabledNoShowFollowup: e.target.checked })}
                className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => addToast({ type: 'success', title: 'Preferências salvas', message: 'Configurações de lembretes atualizadas.' })}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
            >
              Salvar Preferências
            </button>
          </div>
        </div>
      )}

      {/* TAB 5: INTEGRATIONS & ARCHITECTURE */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Supabase Ready */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 flex items-center justify-center">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">Supabase (PostgreSQL)</h4>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Arquitetura Pronta p/ Conexão
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  Local State Active
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Toda a camada de dados está desacoplada em <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">src/services/crmStorage.ts</code>. Para conectar seu banco real, basta preencher as chaves de API e URL do Supabase.
              </p>
              <div className="space-y-2 pt-2">
                <input
                  type="text"
                  placeholder="https://xyzcompany.supabase.co"
                  disabled
                  value="https://ais-dev-kdgqq77pgfqt.supabase.co (simulado)"
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-500"
                />
              </div>
            </div>

            {/* Google Gemini API */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400 flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">Google Gemini AI</h4>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Endpoint Conectado (/api/gemini/chat)
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Online
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Utiliza o modelo <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">gemini-3.8-flash</code> via SDK oficial <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">@google/genai</code> no servidor Express para testar agentes e sugestões de respostas.
              </p>
            </div>

            {/* Cernio / WhatsApp Webhook */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400 flex items-center justify-center">
                    <Webhook className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">Meta WhatsApp Cloud / Cernio</h4>
                    <span className="text-[11px] text-slate-500">Webhooks de Mensagens</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  Pronto p/ Produção
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                URL de callback configurada para receber eventos de mensagens recebidas, status de entrega e leitura.
              </p>
              <div className="pt-1">
                <code className="block text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 p-2 rounded-lg font-mono truncate">
                  POST https://seucrm.com.br/api/webhooks/whatsapp
                </code>
              </div>
            </div>

            {/* Google Calendar Sync */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 flex items-center justify-center">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">Google Calendar</h4>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Sincronização Bidirecional
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  Conectado
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Conta conectada: <strong className="text-slate-800 dark:text-slate-200">marcelo.luiz@conectacrm.com.br</strong>. Todas as visitas marcadas no ConectaCRM sincronizam em tempo real na agenda do Google.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
