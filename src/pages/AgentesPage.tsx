import React, { useState } from 'react';
import { useCrm } from '../context/CrmContext';
import { AIAgent } from '../types/crm';
import { sendAgentMessageToGemini } from '../services/geminiService';

export const AgentesPage: React.FC = () => {
  const {
    agents,
    selectedAgentId,
    setSelectedAgentId,
    updateAgent,
    addAgent,
    addToast
  } = useCrm();

  const selectedAgent = agents.find(a => a.id === selectedAgentId) || agents[0];

  // Playground state
  const [testMessages, setTestMessages] = useState<Array<{ sender: 'user' | 'agent'; text: string; tokens?: number; latency?: number }>>([
    {
      sender: 'user',
      text: 'Olá! Queria entender como funciona o ConectaCRM para uma imobiliária de 12 corretores.',
    },
    {
      sender: 'agent',
      text: 'Olá! Prazer enorme falar com você. O ConectaCRM centraliza todos os números de WhatsApp e Instagram dos seus 12 corretores em uma única tela, com distribuição inteligente de leads e relatórios de conversão em tempo real.\n\nGostaria de ver uma demonstração de 15 minutinhos hoje com nosso especialista Marcelo Luiz?',
      tokens: 88,
      latency: 290,
    },
  ]);
  const [playgroundInput, setPlaygroundInput] = useState('');
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [editorTab, setEditorTab] = useState<'prompt' | 'canais' | 'ferramentas' | 'handoff'>('prompt');

  // New Agent Modal
  const [isNewAgentModalOpen, setIsNewAgentModalOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRole, setNewAgentRole] = useState<AIAgent['role']>('Vendedor');

  const handleSendMessageToPlayground = async (textToSend?: string) => {
    const text = textToSend || playgroundInput;
    if (!text.trim() || isLoadingAi) return;

    const userMsg = { sender: 'user' as const, text: text.trim() };
    setTestMessages(prev => [...prev, userMsg]);
    if (!textToSend) setPlaygroundInput('');
    setIsLoadingAi(true);

    const historyForAi = testMessages.map(m => ({
      role: m.sender,
      text: m.text,
    }));

    try {
      const response = await sendAgentMessageToGemini({
        systemPrompt: selectedAgent.systemPrompt,
        message: text.trim(),
        history: historyForAi,
        tone: selectedAgent.toneOfVoice.join(', '),
        agentRole: selectedAgent.role,
        variables: {
          nome_empresa: 'Matriz Brasil Ltda',
          nome_contato: 'Lead Simulado',
          horario_atendimento: 'Segunda a Sexta das 09h às 18h',
          link_agendamento: 'https://meet.google.com/xyz-crm-demo',
        },
      });

      setTestMessages(prev => [
        ...prev,
        {
          sender: 'agent',
          text: response.reply,
          tokens: response.tokensUsed,
          latency: response.latencyMs,
        },
      ]);
    } catch {
      setTestMessages(prev => [
        ...prev,
        {
          sender: 'agent',
          text: 'Olá! Aqui é a Sofia. Perfeito, posso agendar uma demonstração rápida de 15 minutos hoje às 16h com o Marcelo Luiz?',
          tokens: 42,
          latency: 210,
        },
      ]);
    } finally {
      setIsLoadingAi(false);
    }
  };

  const handleToggleTool = (toolKey: keyof AIAgent['tools']) => {
    const updated: AIAgent = {
      ...selectedAgent,
      tools: {
        ...selectedAgent.tools,
        [toolKey]: !selectedAgent.tools[toolKey],
      },
    };
    updateAgent(updated);
  };

  const handleToggleChannel = (channel: 'whatsapp' | 'instagram' | 'messenger') => {
    const hasChannel = selectedAgent.channels.includes(channel);
    const updatedChannels = hasChannel
      ? selectedAgent.channels.filter(c => c !== channel)
      : [...selectedAgent.channels, channel];

    if (updatedChannels.length === 0) {
      addToast('Atenção', 'O agente deve estar atribuído a pelo menos um canal.', 'warning');
      return;
    }

    updateAgent({
      ...selectedAgent,
      channels: updatedChannels,
    });
  };

  const handleCreateAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;

    addAgent({
      name: newAgentName.trim(),
      role: newAgentRole,
      roleTag: newAgentRole,
      toneOfVoice: ['Consultivo', 'Amigável'],
      systemPrompt: `Você é o agente virtual de atendimento da {{nome_empresa}}.\nAtenda o cliente {{nome_contato}} com atenção e tire dúvidas sobre nossos serviços.`,
      channels: ['whatsapp'],
      tools: {
        searchKnowledge: true,
        scheduleVisit: true,
        handoffToHuman: true,
      },
      promptVersion: 'publicada',
      active: true,
    });

    setNewAgentName('');
    setIsNewAgentModalOpen(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200/80 dark:border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tracking-tight">
              Agentes de IA &amp; Automação
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-xs flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Engine Gemini 3.8 Flash Ativo
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Crie, personalize e monitore múltiplos agentes autônomos por função, canal e regras de transbordo humano.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs shadow-xs">
            <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {agents.filter(a => a.active).length} Agentes Ativos
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-emerald-600 font-bold">Latência ~320ms</span>
          </div>
        </div>
      </div>

      {/* 3-Column Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMN 1: Meus Agentes Directory (3 Cols on LG) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-bold text-sm text-slate-900 dark:text-white">
                Meus Agentes
              </h2>
              <span className="px-2 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300">
                {agents.length}
              </span>
            </div>
            <button
              onClick={() => setIsNewAgentModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              <span>Novo Agente</span>
            </button>
          </div>

          {/* Stack of Agent Cards */}
          <div className="space-y-3">
            {agents.map(agent => {
              const isSelected = selectedAgent?.id === agent.id;
              return (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`p-4 rounded-2xl transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-white dark:bg-slate-800 border-indigo-600 shadow-md ring-2 ring-indigo-500/20'
                      : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                        <span className="material-symbols-outlined text-xl">
                          {agent.avatarIcon || 'smart_toy'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {agent.name.split('—')[0].trim()}
                          </h3>
                          <span className="px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                            {agent.roleTag}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {agent.toneOfVoice.join(', ')}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        updateAgent({ ...agent, active: !agent.active });
                      }}
                      className={`w-8 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                        agent.active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          agent.active ? 'translate-x-3' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex items-center gap-1">
                      {agent.channels.map(ch => (
                        <span key={ch} className="uppercase font-bold text-[9px] text-slate-500">
                          {ch === 'whatsapp' ? 'WA' : ch === 'instagram' ? 'IG' : 'MSG'}
                        </span>
                      ))}
                    </div>
                    <span>{agent.conversationsCount.toLocaleString('pt-BR')} conversas</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Autonomous Resolution Widget */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold">Resolução Autônoma</span>
              <span className="font-heading font-extrabold text-emerald-600 text-sm">87.4%</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full w-[87.4%]" />
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Apenas 12.6% das conversas necessitaram de intervenção de operadores humanos.
            </p>
          </div>
        </div>

        {/* COLUMN 2: Agent Editor (5 Cols on LG) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-6 space-y-5">
            {/* Editor Tabs */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-3 text-xs font-bold">
                <button
                  onClick={() => setEditorTab('prompt')}
                  className={`pb-2 border-b-2 transition-colors flex items-center gap-1 ${
                    editorTab === 'prompt'
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">psychology</span>
                  <span>Prompt &amp; Personalidade</span>
                </button>
                <button
                  onClick={() => setEditorTab('canais')}
                  className={`pb-2 border-b-2 transition-colors flex items-center gap-1 ${
                    editorTab === 'canais'
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">cell_tower</span>
                  <span>Canais ({selectedAgent.channels.length})</span>
                </button>
                <button
                  onClick={() => setEditorTab('ferramentas')}
                  className={`pb-2 border-b-2 transition-colors flex items-center gap-1 ${
                    editorTab === 'ferramentas'
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">build</span>
                  <span>Ferramentas</span>
                </button>
              </div>

              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                {selectedAgent.promptVersion === 'publicada' ? 'Publicada' : 'Rascunho'}
              </span>
            </div>

            {/* TAB: PROMPT */}
            {editorTab === 'prompt' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nome do Agente
                    </label>
                    <input
                      type="text"
                      value={selectedAgent.name}
                      onChange={e => updateAgent({ ...selectedAgent, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Função Principal (Role)
                    </label>
                    <select
                      value={selectedAgent.role}
                      onChange={e => updateAgent({ ...selectedAgent, role: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold cursor-pointer"
                    >
                      <option value="Vendedor">Vendedor (Qualificação &amp; Demo)</option>
                      <option value="Atendente">Atendente (Triagem &amp; SAC)</option>
                      <option value="Agendador">Agendador (Calendar &amp; Reuniões)</option>
                      <option value="Suporte">Suporte Técnico N2</option>
                      <option value="Personalizado">Personalizado</option>
                    </select>
                  </div>
                </div>

                {/* Tone of Voice Chips */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Tom de Voz
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['Formal', 'Amigável', 'Consultivo', 'Direto & Objetivo', 'Empático'].map(tone => {
                      const isToneActive = selectedAgent.toneOfVoice.includes(tone);
                      return (
                        <button
                          key={tone}
                          type="button"
                          onClick={() => {
                            const newTones = isToneActive
                              ? selectedAgent.toneOfVoice.filter(t => t !== tone)
                              : [...selectedAgent.toneOfVoice, tone];
                            updateAgent({ ...selectedAgent, toneOfVoice: newTones });
                          }}
                          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                            isToneActive
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                          }`}
                        >
                          {tone}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* System Prompt Textarea */}
                <div>
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      System Prompt (Diretrizes da IA)
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-slate-400">Variáveis:</span>
                      {['{{nome_empresa}}', '{{nome_contato}}', '{{horario_atendimento}}'].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            updateAgent({
                              ...selectedAgent,
                              systemPrompt: `${selectedAgent.systemPrompt} ${v}`,
                            });
                          }}
                          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-600 text-[10px] font-mono hover:bg-indigo-50"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    rows={10}
                    value={selectedAgent.systemPrompt}
                    onChange={e => updateAgent({ ...selectedAgent, systemPrompt: e.target.value })}
                    className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                  />
                </div>

                {/* Prompt Versioning Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">Versão:</span>
                    <select
                      value={selectedAgent.promptVersion}
                      onChange={e => updateAgent({ ...selectedAgent, promptVersion: e.target.value as any })}
                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
                    >
                      <option value="publicada">v3 — Publicada (Produção)</option>
                      <option value="rascunho">v4 — Rascunho (Em testes)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => addToast('Rascunho Salvo', 'As alterações do prompt foram gravadas localmente.', 'info')}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Salvar Rascunho
                    </button>
                    <button
                      onClick={() => {
                        updateAgent({ ...selectedAgent, promptVersion: 'publicada' });
                        addToast('Versão Publicada!', 'O agente passará a responder com as novas diretrizes.', 'success');
                      }}
                      className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all"
                    >
                      Publicar Versão
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: CANAIS */}
            {editorTab === 'canais' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">
                  Selecione quais canais este agente irá monitorar e responder automaticamente:
                </p>

                <div className="space-y-2.5">
                  <div
                    onClick={() => handleToggleChannel('whatsapp')}
                    className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      selectedAgent.channels.includes('whatsapp')
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                        <span className="material-symbols-outlined text-lg">chat</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">WhatsApp Cloud API</h4>
                        <p className="text-xs text-slate-400">+55 (11) 98452-9910 • Número Oficial Verificado</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-emerald-600 text-xl font-bold">
                      {selectedAgent.channels.includes('whatsapp') ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </div>

                  <div
                    onClick={() => handleToggleChannel('instagram')}
                    className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      selectedAgent.channels.includes('instagram')
                        ? 'bg-pink-50/50 dark:bg-pink-950/30 border-pink-300 dark:border-pink-800'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-pink-600 text-white flex items-center justify-center font-bold">
                        <span className="material-symbols-outlined text-lg">photo_camera</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">Instagram Direct</h4>
                        <p className="text-xs text-slate-400">@conectacrm_oficial • Direct Messages &amp; Stories</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-pink-600 text-xl font-bold">
                      {selectedAgent.channels.includes('instagram') ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </div>

                  <div
                    onClick={() => handleToggleChannel('messenger')}
                    className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      selectedAgent.channels.includes('messenger')
                        ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                        <span className="material-symbols-outlined text-lg">send</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">Facebook Messenger</h4>
                        <p className="text-xs text-slate-400">Página Comercial ConectaCRM</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-blue-600 text-xl font-bold">
                      {selectedAgent.channels.includes('messenger') ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: FERRAMENTAS */}
            {editorTab === 'ferramentas' && (
              <div className="space-y-4 text-xs">
                <p className="text-slate-500">
                  Habilite as ferramentas que a IA pode invocar de forma autônoma durante a conversa:
                </p>

                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        [rag_knowledge] Buscar Informações da Base
                      </h4>
                      <p className="text-slate-400 mt-0.5">
                        Permite consultar catálogo de preços, FAQs e políticas da empresa.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleTool('searchKnowledge')}
                      className={`w-9 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                        selectedAgent.tools.searchKnowledge ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          selectedAgent.tools.searchKnowledge ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        [agendar_visita] Agendar Visita / Google Meet
                      </h4>
                      <p className="text-slate-400 mt-0.5">
                        Verifica slots livres no Google Calendar e envia o link da reunião diretamente ao cliente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleTool('scheduleVisit')}
                      className={`w-9 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                        selectedAgent.tools.scheduleVisit ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          selectedAgent.tools.scheduleVisit ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        [derivar_para_atendente] Handoff Humano
                      </h4>
                      <p className="text-slate-400 mt-0.5">
                        Transfere a conversa para o corretor ou consultor responsável quando o lead solicita.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleTool('handoffToHuman')}
                      className={`w-9 h-5 rounded-full transition-colors p-0.5 shrink-0 ${
                        selectedAgent.tools.handoffToHuman ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          selectedAgent.tools.handoffToHuman ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COLUMN 3: Test Playground Sandbox with Gemini API (4 Cols on LG) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-slate-200/80 dark:border-slate-800 overflow-hidden flex flex-col">
            {/* Playground Header */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-white">
                    Testar {selectedAgent.name.split('—')[0].trim()}
                  </h3>
                  <span className="material-symbols-outlined text-indigo-600 text-base">science</span>
                </div>
                <p className="text-[11px] text-slate-400">Playground com Gemini 3.8 Flash</p>
              </div>

              <button
                onClick={() => setTestMessages([])}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors"
                title="Limpar Conversa de Teste"
              >
                <span className="material-symbols-outlined text-base">restart_alt</span>
              </button>
            </div>

            {/* Tool Trace Alert Strip */}
            <div className="px-4 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-100 dark:border-emerald-800/60 flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-300">
              <span className="flex items-center gap-1 font-mono">
                <span className="material-symbols-outlined text-xs text-emerald-600">bolt</span>
                [rag_buscar_precos] ativo
              </span>
              <span className="font-bold text-[10px] text-emerald-700 dark:text-emerald-400">
                Sandbox 100% isolado
              </span>
            </div>

            {/* Chat Simulation Messages */}
            <div className="p-4 bg-slate-50/60 dark:bg-slate-950/50 flex flex-col gap-3 min-h-[380px] max-h-[460px] overflow-y-auto text-xs">
              <div className="flex justify-center">
                <span className="px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-800 text-slate-400 text-[10px] font-bold border border-slate-200 dark:border-slate-700">
                  Simulação de Lead Inbound
                </span>
              </div>

              {testMessages.map((msg, idx) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={idx}
                    className={`flex flex-col max-w-[85%] ${
                      isUser ? 'items-start mr-auto' : 'items-end ml-auto'
                    }`}
                  >
                    <div
                      className={`p-3 rounded-2xl shadow-xs leading-relaxed ${
                        isUser
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-tl-none border border-slate-200 dark:border-slate-700'
                          : 'bg-indigo-600 text-white rounded-tr-none'
                      }`}
                    >
                      {!isUser && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-200 mb-1">
                          <span className="material-symbols-outlined text-xs">smart_toy</span>
                          <span>{selectedAgent.name.split('—')[0].trim()}</span>
                        </div>
                      )}
                      <p className="whitespace-pre-line">{msg.text}</p>
                    </div>

                    {!isUser && (msg.tokens || msg.latency) && (
                      <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                        tokens: {msg.tokens} • {msg.latency}ms
                      </span>
                    )}
                  </div>
                );
              })}

              {isLoadingAi && (
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-semibold p-2">
                  <span className="material-symbols-outlined text-base animate-spin">sync</span>
                  <span>{selectedAgent.name.split('—')[0].trim()} está digitando...</span>
                </div>
              )}
            </div>

            {/* Quick simulation buttons */}
            <div className="p-2.5 bg-slate-100/60 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto text-[11px]">
              <span className="text-slate-400 text-[10px] font-bold uppercase shrink-0">Testes:</span>
              <button
                type="button"
                onClick={() => handleSendMessageToPlayground('Sim, quero agendar hoje às 16h!')}
                className="px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 shrink-0 border border-slate-200 dark:border-slate-700 shadow-xs"
              >
                "Sim, quero agendar hoje às 16h"
              </button>
              <button
                type="button"
                onClick={() => handleSendMessageToPlayground('Quanto custa para uma equipe de 15 pessoas?')}
                className="px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 shrink-0 border border-slate-200 dark:border-slate-700 shadow-xs"
              >
                "Quanto custa para 15 pessoas?"
              </button>
            </div>

            {/* Chat Input */}
            <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <input
                type="text"
                value={playgroundInput}
                onChange={e => setPlaygroundInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleSendMessageToPlayground();
                  }
                }}
                disabled={isLoadingAi}
                placeholder={`Mensagem de teste para ${selectedAgent.name.split('—')[0].trim()}...`}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={() => handleSendMessageToPlayground()}
                disabled={isLoadingAi || !playgroundInput.trim()}
                className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white flex items-center justify-center shadow-xs transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-base">send</span>
              </button>
            </div>
          </div>

          {/* JSON Memory Inspector */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-indigo-600 text-base">data_object</span>
                Variáveis em Memória (Lead Teste)
              </span>
              <span className="font-mono text-[10px] text-slate-400">JSON State</span>
            </div>
            <pre className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 font-mono text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed overflow-x-auto border border-slate-100 dark:border-slate-800">
{`{
  "nome_contato": "Lead Simulado",
  "empresa": "Matriz Brasil Ltda",
  "tamanho_equipe": "12 corretores",
  "etapa_funil": "Qualificação Avançada",
  "handoff_necessario": false
}`}
            </pre>
          </div>
        </div>
      </div>

      {/* Modal: Novo Agente */}
      {isNewAgentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
                Criar Novo Agente de IA
              </h3>
              <button
                onClick={() => setIsNewAgentModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateAgent} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Agente
                </label>
                <input
                  type="text"
                  required
                  value={newAgentName}
                  onChange={e => setNewAgentName(e.target.value)}
                  placeholder="Ex: Beatriz — Especialista em Varejo"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Função (Role)
                </label>
                <select
                  value={newAgentRole}
                  onChange={e => setNewAgentRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold"
                >
                  <option value="Vendedor">Vendedor (Qualificação &amp; Demo)</option>
                  <option value="Atendente">Atendente (Triagem &amp; SAC)</option>
                  <option value="Agendador">Agendador (Calendar &amp; Reuniões)</option>
                  <option value="Suporte">Suporte Técnico</option>
                  <option value="Personalizado">Personalizado</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewAgentModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/20"
                >
                  Criar Agente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
