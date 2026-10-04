import React, { useState } from 'react';
import { useCrm } from '../context/CrmContext';
import { ChannelType, Conversation } from '../types/crm';
import { ChannelBadge } from '../components/common/ChannelBadge';

export const ConversasPage: React.FC = () => {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    sendMessage,
    addInternalNote,
    toggleBotForConversation,
    contacts,
    setSelectedContact,
    setActivePage,
    addToast
  } = useCrm();

  const [channelFilter, setChannelFilter] = useState<'all' | ChannelType>('all');
  const [statusFilter, setStatusFilter] = useState<'abertas' | 'com_ia' | 'humano' | 'resolvidas'>('abertas');
  const [searchTerm, setSearchTerm] = useState('');

  const [messageInput, setMessageInput] = useState('');
  const [mode, setMode] = useState<'message' | 'internal_note'>('message');
  const [newTagInput, setNewTagInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);

  // Active conversation
  const activeConv = conversations.find(c => c.id === activeConversationId) || conversations[0];
  const linkedContact = activeConv ? contacts.find(c => c.id === activeConv.contactId) : null;

  // Filter conversations
  const filteredConversations = conversations.filter(c => {
    // Channel filter
    if (channelFilter !== 'all' && c.channel !== channelFilter) return false;

    // Status filter
    if (statusFilter === 'abertas' && c.status === 'resolvida') return false;
    if (statusFilter === 'com_ia' && (!c.isBotActive || c.status === 'resolvida')) return false;
    if (statusFilter === 'humano' && (c.isBotActive || c.status === 'resolvida')) return false;
    if (statusFilter === 'resolvidas' && c.status !== 'resolvida') return false;

    // Search term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = c.contactName.toLowerCase().includes(q);
      const matchCompany = c.contactCompany.toLowerCase().includes(q);
      const matchPhone = c.contactPhone.includes(q);
      const matchMsg = c.lastMessage.toLowerCase().includes(q);
      if (!matchName && !matchCompany && !matchPhone && !matchMsg) return false;
    }

    return true;
  });

  const handleSend = () => {
    if (!messageInput.trim() || !activeConv) return;
    if (mode === 'internal_note') {
      addInternalNote(activeConv.id, messageInput.trim());
    } else {
      sendMessage(activeConv.id, messageInput.trim(), 'human', false);
    }
    setMessageInput('');
  };

  const handleApplyAiSuggestion = (suggestionText: string) => {
    if (!activeConv) return;
    sendMessage(activeConv.id, suggestionText, 'agent', true);
    addToast('Sugestão da IA Enviada!', 'A mensagem foi enviada ao lead no canal oficial.', 'success');
  };

  const channelCounts = {
    all: conversations.length,
    whatsapp: conversations.filter(c => c.channel === 'whatsapp').length,
    instagram: conversations.filter(c => c.channel === 'instagram').length,
    web: conversations.filter(c => c.channel === 'web').length,
  };

  return (
    <div className="h-[calc(100vh-6.5rem)] flex gap-4 min-w-0">
      {/* ================= COLUNA 1: Lista de Conversas Multicanal ================= */}
      <div className="w-80 md:w-96 flex-shrink-0 flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        {/* Top Search & Actions */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">
                Conversas
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                {conversations.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => addToast('Sincronizado', 'Todas as conversas da Meta Cloud API estão atualizadas.', 'info')}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Sincronizar Mensagens"
              >
                <span className="material-symbols-outlined text-base">refresh</span>
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none">
              search
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, telefone, mensagem..."
              className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {/* Filter Chips: Channels */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            <button
              onClick={() => setChannelFilter('all')}
              className={`px-3 py-1 rounded-full font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                channelFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Todos</span>
              <span className="opacity-80 text-[10px]">{channelCounts.all}</span>
            </button>
            <button
              onClick={() => setChannelFilter('whatsapp')}
              className={`px-3 py-1 rounded-full font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                channelFilter === 'whatsapp'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>WhatsApp</span>
              <span className="opacity-80 text-[10px]">{channelCounts.whatsapp}</span>
            </button>
            <button
              onClick={() => setChannelFilter('instagram')}
              className={`px-3 py-1 rounded-full font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                channelFilter === 'instagram'
                  ? 'bg-pink-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-pink-500" />
              <span>Instagram</span>
              <span className="opacity-80 text-[10px]">{channelCounts.instagram}</span>
            </button>
            <button
              onClick={() => setChannelFilter('web')}
              className={`px-3 py-1 rounded-full font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                channelFilter === 'web'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span>Web</span>
              <span className="opacity-80 text-[10px]">{channelCounts.web}</span>
            </button>
          </div>

          {/* Status Tabs */}
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pt-1">
            <button
              onClick={() => setStatusFilter('abertas')}
              className={`pb-2 border-b-2 transition-colors flex items-center gap-1 ${
                statusFilter === 'abertas'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Abertas</span>
            </button>
            <button
              onClick={() => setStatusFilter('com_ia')}
              className={`pb-2 border-b-2 transition-colors flex items-center gap-1 ${
                statusFilter === 'com_ia'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>🤖 Com IA</span>
            </button>
            <button
              onClick={() => setStatusFilter('humano')}
              className={`pb-2 border-b-2 transition-colors flex items-center gap-1 ${
                statusFilter === 'humano'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>👤 Humano</span>
            </button>
            <button
              onClick={() => setStatusFilter('resolvidas')}
              className={`pb-2 border-b-2 transition-colors flex items-center gap-1 ${
                statusFilter === 'resolvidas'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Resolvidas</span>
            </button>
          </div>
        </div>

        {/* Conversation Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 p-2 space-y-1">
          {filteredConversations.map(conv => {
            const isSelected = activeConv?.id === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`p-3 rounded-xl transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 shadow-xs'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                {isSelected && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 bg-indigo-600 rounded-r-full" />
                )}
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-sm shadow-xs">
                      {conv.contactName.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5">
                      <ChannelBadge channel={conv.channel} showLabel={false} size="sm" />
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {conv.contactName}
                      </h4>
                      <span className="text-[11px] text-slate-400 font-semibold shrink-0">
                        {conv.lastMessageTime}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 truncate mb-1">
                      {conv.contactCompany}
                    </p>

                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-1 font-medium">
                      {conv.lastMessage}
                    </p>

                    <div className="flex items-center justify-between mt-2 pt-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {conv.isBotActive ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
                            🤖 {conv.botName}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px]">
                            👤 Marcelo L.
                          </span>
                        )}

                        {conv.tags[0] && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px]">
                            {conv.tags[0]}
                          </span>
                        )}
                      </div>

                      {conv.unreadCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================= COLUNA 2: Fio de Conversa Central (Chat Thread) ================= */}
      {activeConv ? (
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 overflow-hidden min-w-0">
          {/* Active Chat Header */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-sm">
                    {activeConv.contactName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white truncate">
                      {activeConv.contactName}
                    </h3>
                    <ChannelBadge channel={activeConv.channel} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    <span>{activeConv.contactCompany}</span>
                    <span>•</span>
                    <span>{activeConv.contactPhone}</span>
                    <span>•</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">Online agora</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => addToast('Discando...', `Ligando para ${activeConv.contactPhone}`, 'info')}
                  className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors"
                  title="Ligar para cliente"
                >
                  <span className="material-symbols-outlined text-lg">call</span>
                </button>
                <button
                  onClick={() => {
                    if (linkedContact) {
                      setSelectedContact(linkedContact);
                      setActivePage('contatos');
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors"
                  title="Ver no Pipeline"
                >
                  <span className="material-symbols-outlined text-base text-indigo-600">view_kanban</span>
                  <span>R$ {activeConv.opportunityValue.toLocaleString('pt-BR')}</span>
                </button>
              </div>
            </div>

            {/* AI Agent Status Bar & Human Takeover Button */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-2.5 w-2.5 relative shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600" />
                </span>
                <span className="font-semibold text-slate-900 dark:text-white truncate">
                  {activeConv.isBotActive
                    ? `🤖 Agente IA '${activeConv.botName}' respondendo automaticamente`
                    : '👤 Atendimento humano ativo (Marcelo Luiz no comando)'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleBotForConversation(activeConv.id, !activeConv.isBotActive)}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1 shadow-sm ${
                    activeConv.isBotActive
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">
                    {activeConv.isBotActive ? 'bolt' : 'smart_toy'}
                  </span>
                  <span>{activeConv.isBotActive ? 'Assumir Conversa' : 'Reativar Bot (IA)'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/70 dark:bg-slate-950/40">
            <div className="flex justify-center">
              <span className="px-3 py-1 rounded-full bg-white dark:bg-slate-800 text-slate-400 text-[11px] font-semibold shadow-xs border border-slate-200/60 dark:border-slate-700">
                Hoje, Mensagens Criptografadas
              </span>
            </div>

            {activeConv.messages.map(msg => {
              const isContact = msg.sender === 'contact';
              const isAi = msg.sender === 'agent' || msg.isAiGenerated;

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 max-w-xl ${
                    isContact ? 'mr-auto' : 'ml-auto flex-row-reverse'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      isContact
                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                        : isAi
                        ? 'bg-indigo-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {isContact ? 'RC' : isAi ? '🤖' : 'ML'}
                  </div>

                  <div className={`flex flex-col gap-1 ${isContact ? 'items-start' : 'items-end'}`}>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        {msg.senderName}
                      </span>
                      <span>•</span>
                      <span>{msg.timestamp}</span>
                    </div>

                    <div
                      className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm ${
                        isContact
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-tl-sm border border-slate-200/60 dark:border-slate-700'
                          : isAi
                          ? 'bg-indigo-600 text-white rounded-tr-sm'
                          : 'bg-emerald-600 text-white rounded-tr-sm'
                      }`}
                    >
                      {msg.text}
                    </div>

                    {!isContact && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-400">
                        <span>Entregue e lido</span>
                        <span className="material-symbols-outlined text-xs text-indigo-500">done_all</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* AI Copilot Suggestion Box */}
            <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                  <span className="material-symbols-outlined text-base">auto_awesome</span>
                  <span>Sugestão de Resposta Gerada pela IA</span>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Confiança: 98%</span>
              </div>
              <p className="text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200/60 dark:border-slate-700">
                "Excelente, {activeConv.contactName}! Agendei seu horário com Marcelo Luiz para hoje às 16:00 (enviei o convite do Google Meet por e-mail). Estou anexando agora o Deck Institucional em PDF com casos de sucesso de clientes parceiros. Até já!"
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() =>
                    handleApplyAiSuggestion(
                      `Excelente, ${activeConv.contactName}! Agendei seu horário com Marcelo Luiz para hoje às 16:00 (enviei o convite do Google Meet por e-mail). Estou anexando agora o Deck Institucional em PDF.`
                    )
                  }
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all"
                >
                  <span className="material-symbols-outlined text-sm">send</span>
                  <span>Aprovar e Enviar com Deck (PDF)</span>
                </button>
                <button
                  onClick={() =>
                    setMessageInput(
                      `Olá ${activeConv.contactName}, sobre o agendamento de hoje às 16:00...`
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  Editar Sugestão
                </button>
              </div>
            </div>
          </div>

          {/* Composer Box */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col gap-2">
            {/* Mode Selector Tabs */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  onClick={() => setMode('message')}
                  className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                    mode === 'message'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm text-emerald-600">chat</span>
                  <span>Mensagem {activeConv.channel === 'whatsapp' ? 'WhatsApp' : 'Cliente'}</span>
                </button>
                <button
                  onClick={() => setMode('internal_note')}
                  className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                    mode === 'internal_note'
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm text-amber-600">sticky_note_2</span>
                  <span>Nota Interna (Privada)</span>
                </button>
              </div>

              <button
                onClick={() =>
                  setMessageInput(
                    `Olá ${activeConv.contactName}! Segue a confirmação da demonstração para hoje às 16h via Google Meet: https://meet.google.com/xyz-crm-demo`
                  )
                }
                className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">bolt</span>
                <span>Usar Template Rápido</span>
              </button>
            </div>

            {/* Input Box */}
            <div
              className={`rounded-xl p-2.5 transition-all border ${
                mode === 'internal_note'
                  ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                  : 'bg-slate-100 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700 focus-within:ring-2 focus-within:ring-indigo-500/20'
              }`}
            >
              <textarea
                value={messageInput}
                onChange={e => setMessageInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={2}
                placeholder={
                  mode === 'internal_note'
                    ? 'Escreva uma anotação visível apenas para sua equipe interna...'
                    : `Digite uma mensagem para ${activeConv.contactName} (Pressione Enter para enviar)...`
                }
                className="w-full bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 text-xs sm:text-sm resize-none focus:outline-none"
              />

              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <div className="flex items-center gap-1 text-slate-400">
                  <button
                    onClick={() => setMessageInput(prev => `${prev} **negrito** `)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
                    title="Negrito"
                  >
                    <span className="material-symbols-outlined text-base">format_bold</span>
                  </button>
                  <button
                    onClick={() => addToast('Anexo', 'Módulo de upload de PDFs e propostas disponível.', 'info')}
                    className="w-8 h-8 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
                    title="Anexar arquivo (PDF, imagens)"
                  >
                    <span className="material-symbols-outlined text-base">attach_file</span>
                  </button>
                  <button
                    onClick={() => setMessageInput(prev => `${prev} 👍 `)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
                    title="Emojis"
                  >
                    <span className="material-symbols-outlined text-base">sentiment_satisfied</span>
                  </button>
                  <button
                    onClick={() => addToast('Áudio', 'Gravação de áudio em formato Opus para WhatsApp.', 'info')}
                    className="w-8 h-8 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
                    title="Gravar áudio"
                  >
                    <span className="material-symbols-outlined text-base">mic</span>
                  </button>
                </div>

                <button
                  onClick={handleSend}
                  className={`flex items-center gap-1 px-4 py-2 rounded-xl text-white font-bold text-xs shadow-sm transition-all ${
                    mode === 'internal_note'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  <span>{mode === 'internal_note' ? 'Salvar Nota' : 'Enviar'}</span>
                  <span className="material-symbols-outlined text-base">send</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
          Selecione uma conversa para iniciar o atendimento
        </div>
      )}

      {/* ================= COLUNA 3: Painel Lateral de Contexto do Lead & CRM (Dossiê) ================= */}
      {activeConv && (
        <div className="w-80 flex-shrink-0 hidden xl:flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="font-heading font-bold text-sm text-slate-900 dark:text-white">
              Dossiê do Lead
            </span>
            <button
              onClick={() => {
                if (linkedContact) {
                  setSelectedContact(linkedContact);
                  setActivePage('contatos');
                }
              }}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              <span>Ver Completo</span>
              <span className="material-symbols-outlined text-xs">open_in_new</span>
            </button>
          </div>

          {/* Profile Card */}
          <div className="flex flex-col items-center text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <div className="relative mb-2">
              <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-heading font-extrabold text-xl shadow-sm">
                {activeConv.contactName.slice(0, 2).toUpperCase()}
              </div>
              <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            </div>
            <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white">
              {activeConv.contactName}
            </h3>
            <p className="text-xs text-slate-500">{activeConv.contactRole || 'Diretor Comercial'}</p>
            <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
              {activeConv.contactCompany}
            </p>

            {/* Metadata */}
            <div className="w-full mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700 text-left space-y-2 text-xs">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <span className="material-symbols-outlined text-sm text-emerald-600">phone_iphone</span>
                <span className="font-mono font-medium">{activeConv.contactPhone}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 truncate">
                <span className="material-symbols-outlined text-sm text-slate-400">mail</span>
                <span className="truncate">{activeConv.contactEmail}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <span className="material-symbols-outlined text-sm text-slate-400">location_on</span>
                <span>{activeConv.contactCity || 'São Paulo, SP'}</span>
              </div>
            </div>
          </div>

          {/* Opportunity Card */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-400">Oportunidade</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[10px]">
                Pipeline Ativo
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">
                R$ {activeConv.opportunityValue.toLocaleString('pt-BR')}
              </span>
              <span className="text-xs font-bold text-emerald-600">75% prob.</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div className="bg-indigo-600 h-full rounded-full w-2/5" />
            </div>
            <button
              onClick={() => setActivePage('pipeline')}
              className="w-full mt-1 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1 transition-colors"
            >
              <span>Avançar no Pipeline</span>
              <span className="material-symbols-outlined text-xs">arrow_forward</span>
            </button>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-400">Etiquetas</span>
              <button
                onClick={() => setIsAddingTag(!isAddingTag)}
                className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
              >
                + Tag
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeConv.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold"
                >
                  {tag}
                </span>
              ))}
            </div>

            {isAddingTag && (
              <div className="flex items-center gap-1 pt-1">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={e => setNewTagInput(e.target.value)}
                  placeholder="Nova tag..."
                  className="w-full px-2 py-1 bg-slate-100 dark:bg-slate-800 text-xs rounded-lg focus:outline-none"
                />
                <button
                  onClick={() => {
                    if (newTagInput.trim()) {
                      activeConv.tags.push(newTagInput.trim());
                      setNewTagInput('');
                      setIsAddingTag(false);
                      addToast('Tag adicionada', '', 'success');
                    }
                  }}
                  className="px-2 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold"
                >
                  OK
                </button>
              </div>
            )}
          </div>

          {/* Next Appointment Card */}
          {activeConv.nextAppointment && (
            <div className="p-3 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">event</span>
                  Próximo Compromisso
                </span>
                <span className="font-bold text-rose-600">
                  {activeConv.nextAppointment.date}, {activeConv.nextAppointment.time}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                {activeConv.nextAppointment.title}
              </p>
              {activeConv.nextAppointment.meetLink && (
                <a
                  href={activeConv.nextAppointment.meetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 font-bold hover:underline pt-0.5"
                >
                  <span className="material-symbols-outlined text-xs">video_call</span>
                  <span>Entrar no Google Meet</span>
                </a>
              )}
            </div>
          )}

          {/* Internal Notes Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-400">Notas Internas</span>
              <button
                onClick={() => setMode('internal_note')}
                className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
              >
                + Nova
              </button>
            </div>
            {activeConv.internalNotes.length > 0 ? (
              activeConv.internalNotes.map(note => (
                <div
                  key={note.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs space-y-1 border border-slate-100 dark:border-slate-700"
                >
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-300">{note.author}</span>
                    <span>{note.timestamp}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{note.text}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic">Nenhuma anotação interna registrada.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
