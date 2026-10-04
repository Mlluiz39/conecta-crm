import React, { useState } from 'react';
import { useCrm } from '../context/CrmContext';
import { Contact, ChannelType } from '../types/crm';
import { ChannelBadge } from '../components/common/ChannelBadge';
import { exportContactsToCSV } from '../services/exportService';

export const ContatosPage: React.FC = () => {
  const {
    contacts,
    selectedContact,
    setSelectedContact,
    updateContact,
    deleteContact,
    setIsNewLeadModalOpen,
    stages,
    customFields,
    addToast
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | ChannelType>('all');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [activeModalTab, setActiveModalTab] = useState<'dados' | 'conversas' | 'oportunidades' | 'agendamentos' | 'historico'>('dados');

  // Contact editing within modal
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editFormData, setEditFormData] = useState<Contact | null>(null);

  // Filter contacts
  const filteredContacts = contacts.filter(contact => {
    if (channelFilter !== 'all' && contact.channel !== channelFilter) return false;
    if (selectedTag !== 'all' && !contact.tags.some(t => t.toLowerCase().includes(selectedTag.toLowerCase()))) {
      return false;
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = contact.name.toLowerCase().includes(q);
      const matchCompany = contact.company.toLowerCase().includes(q);
      const matchPhone = contact.phone.includes(q);
      const matchEmail = contact.email.toLowerCase().includes(q);
      const matchCnpj = contact.cnpj?.includes(q);
      if (!matchName && !matchCompany && !matchPhone && !matchEmail && !matchCnpj) return false;
    }
    return true;
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedContactIds(filteredContacts.map(c => c.id));
    } else {
      setSelectedContactIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    if (selectedContactIds.includes(id)) {
      setSelectedContactIds(selectedContactIds.filter(item => item !== id));
    } else {
      setSelectedContactIds([...selectedContactIds, id]);
    }
  };

  const openContactModal = (contact: Contact) => {
    setSelectedContact(contact);
    setEditFormData({ ...contact });
    setIsEditingContact(false);
    setActiveModalTab('dados');
  };

  const handleSaveContactModal = () => {
    if (!editFormData) return;
    updateContact(editFormData);
    setIsEditingContact(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tracking-tight">
              Gestão de Contatos &amp; Clientes
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              {contacts.length} total
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Base unificada de contatos multicanal com histórico completo de conversas, campos customizados e negócios.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => exportContactsToCSV(contacts)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 shadow-xs transition-colors"
          >
            <span className="material-symbols-outlined text-base">download</span>
            <span>Exportar CSV</span>
          </button>
          <button
            onClick={() => addToast('Importação', 'Arraste uma planilha .xlsx ou .csv com as colunas Nome, Telefone e Empresa.', 'info')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 shadow-xs transition-colors"
          >
            <span className="material-symbols-outlined text-base">upload_file</span>
            <span>Importar Planilha</span>
          </button>
          <button
            onClick={() => setIsNewLeadModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
          >
            <span className="material-symbols-outlined text-base">person_add</span>
            <span>Novo Contato</span>
          </button>
        </div>
      </div>

      {/* 4 Bento KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Total de Contatos
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">group</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
              {contacts.length.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
              +14% novos neste mês
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Contatos Ativos
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">chat</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
              {Math.round(contacts.length * 0.72)}
            </div>
            <p className="text-xs text-slate-500 mt-1">65% engajados WhatsApp/Insta</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Oportunidades em Aberto
            </span>
            <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">payments</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">
              R$ {contacts.reduce((acc, c) => acc + c.opportunityValue, 0).toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-slate-500 mt-1">Em negociação ativa</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Leads Prioritários
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">local_fire_department</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="font-heading font-extrabold text-2xl text-rose-600 dark:text-rose-400">
              {contacts.filter(c => c.tags.some(t => t.includes('Quente'))).length}
            </div>
            <p className="text-xs text-slate-500 mt-1">Atenção e follow-up imediato</p>
          </div>
        </div>
      </div>

      {/* Filters, Search & Smart Segment Chips */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-4">
        {/* Search Row */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
          <div className="relative w-full lg:w-96">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, e-mail, telefone, empresa ou CNPJ..."
              className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto justify-end">
            {/* Canal filter */}
            <select
              value={channelFilter}
              onChange={e => setChannelFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl focus:outline-none"
            >
              <option value="all">Canal: Todos</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="web">Webchat</option>
              <option value="email">E-mail</option>
              <option value="telefone">Telefone</option>
            </select>

            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedTag('all');
                setChannelFilter('all');
              }}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-colors"
            >
              Limpar Filtros
            </button>
          </div>
        </div>

        {/* Segment Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-none">
          <button
            onClick={() => setSelectedTag('all')}
            className={`px-3 py-1.5 rounded-full font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              selectedTag === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <span>Todos os contatos</span>
            <span className="opacity-80 text-[11px]">{contacts.length}</span>
          </button>
          <button
            onClick={() => setSelectedTag('Quente')}
            className={`px-3 py-1.5 rounded-full font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              selectedTag === 'Quente'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <span>🔥 Leads Quentes</span>
          </button>
          <button
            onClick={() => setSelectedTag('Construtora')}
            className={`px-3 py-1.5 rounded-full font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              selectedTag === 'Construtora'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <span>🏢 Construtoras / B2B</span>
          </button>
          <button
            onClick={() => setSelectedTag('WhatsApp')}
            className={`px-3 py-1.5 rounded-full font-bold transition-all shrink-0 flex items-center gap-1.5 ${
              selectedTag === 'WhatsApp'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <span>💬 WhatsApp Aberto</span>
          </button>
        </div>
      </div>

      {/* Bulk Actions Ribbon (When items selected) */}
      {selectedContactIds.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl border border-indigo-200 dark:border-indigo-800 text-xs animate-in fade-in duration-150">
          <span className="font-bold text-indigo-900 dark:text-indigo-200">
            {selectedContactIds.length} contato(s) selecionado(s)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => addToast('Disparo em Massa', 'Mensagem enviada para os contatos selecionados via WhatsApp Cloud API.', 'success')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm"
            >
              Mensagem em Massa
            </button>
            <button
              onClick={() => {
                selectedContactIds.forEach(id => deleteContact(id));
                setSelectedContactIds([]);
              }}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-sm"
            >
              Excluir Selecionados
            </button>
          </div>
        </div>
      )}

      {/* Contacts Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <th className="py-3.5 pl-4 pr-2 w-10">
                  <input
                    type="checkbox"
                    checked={selectedContactIds.length === filteredContacts.length && filteredContacts.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="py-3.5 px-3">Contato &amp; Empresa</th>
                <th className="py-3.5 px-3">Canal &amp; Contato</th>
                <th className="py-3.5 px-3">E-mail / Cidade</th>
                <th className="py-3.5 px-3">Etiquetas</th>
                <th className="py-3.5 px-3">Oportunidade</th>
                <th className="py-3.5 px-3">Responsável</th>
                <th className="py-3.5 px-3">Última Interação</th>
                <th className="py-3.5 pr-4 pl-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-800 dark:text-slate-200">
              {filteredContacts.map(contact => {
                const isSelected = selectedContactIds.includes(contact.id);
                return (
                  <tr
                    key={contact.id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                      isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                    }`}
                  >
                    <td className="py-3.5 pl-4 pr-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(contact.id)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>

                    {/* Contato & Empresa */}
                    <td className="py-3.5 px-3">
                      <div
                        onClick={() => openContactModal(contact)}
                        className="flex items-center gap-3 cursor-pointer group"
                      >
                        <div className="relative shrink-0">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-sm shadow-xs">
                            {contact.name.slice(0, 2).toUpperCase()}
                          </div>
                          {contact.verified && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-white dark:ring-slate-900" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors text-sm">
                              {contact.name}
                            </span>
                            {contact.verified && (
                              <span className="material-symbols-outlined text-indigo-600 text-xs" title="Verificado">
                                verified
                              </span>
                            )}
                          </div>
                          <p className="text-slate-400 text-[11px] truncate max-w-[180px]">
                            {contact.role} • {contact.company}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Canal & Telefone */}
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col gap-1">
                        <ChannelBadge channel={contact.channel} />
                        <span className="font-mono text-slate-600 dark:text-slate-300 font-medium">
                          {contact.phone}
                        </span>
                      </div>
                    </td>

                    {/* E-mail / Cidade */}
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col">
                        <span className="truncate max-w-[170px] text-slate-700 dark:text-slate-300 font-medium">
                          {contact.email}
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          {contact.city}, {contact.state}
                        </span>
                      </div>
                    </td>

                    {/* Etiquetas */}
                    <td className="py-3.5 px-3">
                      <div className="flex flex-wrap gap-1 max-w-[190px]">
                        {contact.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Oportunidade */}
                    <td className="py-3.5 px-3">
                      <div className="font-heading font-extrabold text-sm text-indigo-600 dark:text-indigo-400">
                        R$ {contact.opportunityValue.toLocaleString('pt-BR')}
                      </div>
                    </td>

                    {/* Responsável */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold flex items-center justify-center text-slate-700 dark:text-slate-200">
                          ML
                        </div>
                        <span className="text-slate-700 dark:text-slate-300">{contact.assignedTo}</span>
                      </div>
                    </td>

                    {/* Última Interação */}
                    <td className="py-3.5 px-3">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {contact.lastInteractionTime}
                      </span>
                    </td>

                    {/* Ações */}
                    <td className="py-3.5 pr-4 pl-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openContactModal(contact)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Abrir Dossiê Completo"
                        >
                          <span className="material-symbols-outlined text-base">visibility</span>
                        </button>
                        <button
                          onClick={() => addToast('Chamada', `Iniciando contato via WhatsApp com ${contact.name}`, 'success')}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Conversar no WhatsApp"
                        >
                          <span className="material-symbols-outlined text-base">chat</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CONTACT DOSSIER MODAL WITH TABS (matching Image 16) */}
      {selectedContact && editFormData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col my-auto max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-heading font-extrabold text-xl flex items-center justify-center shadow-sm">
                  {editFormData.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-heading font-extrabold text-xl text-slate-900 dark:text-white">
                      {editFormData.name}
                    </h2>
                    <ChannelBadge channel={editFormData.channel} />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {editFormData.role} • <strong className="text-slate-800 dark:text-slate-200">{editFormData.company}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => setIsEditingContact(!isEditingContact)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    isEditingContact
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {isEditingContact ? 'Cancelar Edição' : 'Editar Dados'}
                </button>
                <button
                  onClick={() => setSelectedContact(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>
            </div>

            {/* Modal Tabs Header */}
            <div className="flex items-center px-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto gap-4 text-xs font-bold">
              <button
                onClick={() => setActiveModalTab('dados')}
                className={`py-3 border-b-2 transition-colors ${
                  activeModalTab === 'dados'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Dados Principais
              </button>
              <button
                onClick={() => setActiveModalTab('conversas')}
                className={`py-3 border-b-2 transition-colors ${
                  activeModalTab === 'conversas'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Conversas Multicanal
              </button>
              <button
                onClick={() => setActiveModalTab('oportunidades')}
                className={`py-3 border-b-2 transition-colors ${
                  activeModalTab === 'oportunidades'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Oportunidades
              </button>
              <button
                onClick={() => setActiveModalTab('agendamentos')}
                className={`py-3 border-b-2 transition-colors ${
                  activeModalTab === 'agendamentos'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Agendamentos
              </button>
              <button
                onClick={() => setActiveModalTab('historico')}
                className={`py-3 border-b-2 transition-colors ${
                  activeModalTab === 'historico'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Histórico &amp; Notas
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {activeModalTab === 'dados' && (
                <div className="space-y-6">
                  {/* Informações Cadastrais */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Informações de Contato &amp; Empresa
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                      <div>
                        <span className="text-slate-400 font-semibold block mb-0.5">Telefone / WhatsApp</span>
                        {isEditingContact ? (
                          <input
                            type="text"
                            value={editFormData.phone}
                            onChange={e => setEditFormData({ ...editFormData, phone: e.target.value })}
                            className="w-full px-2 py-1 rounded bg-white dark:bg-slate-700 border border-slate-300"
                          />
                        ) : (
                          <span className="font-bold text-slate-900 dark:text-white font-mono">{editFormData.phone}</span>
                        )}
                      </div>

                      <div>
                        <span className="text-slate-400 font-semibold block mb-0.5">E-mail Corporativo</span>
                        {isEditingContact ? (
                          <input
                            type="text"
                            value={editFormData.email}
                            onChange={e => setEditFormData({ ...editFormData, email: e.target.value })}
                            className="w-full px-2 py-1 rounded bg-white dark:bg-slate-700 border border-slate-300"
                          />
                        ) : (
                          <span className="font-semibold text-slate-900 dark:text-white">{editFormData.email}</span>
                        )}
                      </div>

                      <div>
                        <span className="text-slate-400 font-semibold block mb-0.5">CNPJ / Razão Social</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">{editFormData.cnpj || '34.819.012/0001-90'}</span>
                      </div>

                      <div className="md:col-span-2">
                        <span className="text-slate-400 font-semibold block mb-0.5">Endereço Comercial</span>
                        <span className="text-slate-700 dark:text-slate-300">{editFormData.address || 'Av. Paulista, 1842 - São Paulo, SP'}</span>
                      </div>

                      <div>
                        <span className="text-slate-400 font-semibold block mb-0.5">Valor da Oportunidade</span>
                        {isEditingContact ? (
                          <input
                            type="number"
                            value={editFormData.opportunityValue}
                            onChange={e => setEditFormData({ ...editFormData, opportunityValue: Number(e.target.value) })}
                            className="w-full px-2 py-1 rounded bg-white dark:bg-slate-700 border border-slate-300"
                          />
                        ) : (
                          <span className="font-heading font-extrabold text-indigo-600 dark:text-indigo-400 text-sm">
                            R$ {editFormData.opportunityValue.toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Campos Customizados */}
                  {customFields.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                        Campos Customizados do Negócio
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                        {customFields.map(f => (
                          <div key={f.id}>
                            <span className="text-slate-400 font-semibold block mb-0.5">{f.name}</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {editFormData.customFields?.[f.key] || '15 licenças ativas'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Etiquetas */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Etiquetas &amp; Segmentação
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {editFormData.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeModalTab === 'conversas' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">Histórico de conversas nos canais integrados:</p>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-emerald-600">WhatsApp Oficial • Hoje 10:42</span>
                      <span className="text-slate-400">5 mensagens trocadas</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      "Sim, seria ótimo hoje às 16h se possível. Consegue me mandar o PDF?"
                    </p>
                  </div>
                </div>
              )}

              {activeModalTab === 'oportunidades' && (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase">
                        Plano Anual Corporativo
                      </span>
                      <div className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">
                        R$ {editFormData.opportunityValue.toLocaleString('pt-BR')}
                      </div>
                      <p className="text-xs text-slate-500">Probabilidade estimada: 75%</p>
                    </div>
                    <button
                      onClick={() => addToast('Status', 'Oportunidade avançada no funil.', 'success')}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl"
                    >
                      Avançar Estágio
                    </button>
                  </div>
                </div>
              )}

              {activeModalTab === 'agendamentos' && (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-indigo-600">Hoje às 16:00</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                        Confirmado
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      Demonstração Online - Google Meet
                    </p>
                    <p className="text-xs text-slate-500">Com Marcelo Luiz e time técnico.</p>
                  </div>
                </div>
              )}

              {activeModalTab === 'historico' && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 space-y-1">
                    <span className="text-slate-400">Hoje às 11:24</span>
                    <p className="text-slate-700 dark:text-slate-300">
                      Atualização cadastral realizada por <strong>Marcelo Luiz</strong>.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 space-y-1">
                    <span className="text-slate-400">Hoje às 10:36</span>
                    <p className="text-slate-700 dark:text-slate-300">
                      Sofia (Agente IA) qualificou o lead e sugeriu demonstração às 16:00.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Última atualização por <strong>Marcelo Luiz</strong> hoje
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedContact(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Fechar
                </button>
                {isEditingContact && (
                  <button
                    onClick={handleSaveContactModal}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                  >
                    Salvar Alterações
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
