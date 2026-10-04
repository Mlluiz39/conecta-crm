import React, { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { useCrm } from '../context/CrmContext';
import { Opportunity, PipelineStage, Contact, ChannelType } from '../types/crm';
import { ChannelBadge } from '../components/common/ChannelBadge';
import {
  Kanban,
  List,
  Plus,
  Search,
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle2,
  GripVertical,
  PlusCircle,
  Sparkles,
  ArrowRight,
  Inbox,
  Filter,
} from 'lucide-react';

// Draggable Opportunity Card Component
interface DraggableCardProps {
  opportunity: Opportunity;
  contact?: Contact;
  onOpenContact: (contact: Contact) => void;
  isOverlay?: boolean;
}

const DraggableOpportunityCard: React.FC<DraggableCardProps> = ({
  opportunity,
  contact,
  onOpenContact,
  isOverlay = false,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: opportunity.id,
    data: {
      type: 'Opportunity',
      opportunity,
    },
    disabled: isOverlay,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-slate-800 p-4 rounded-xl transition-all border group relative select-none ${
        isDragging
          ? 'opacity-30 border-indigo-400 ring-2 ring-indigo-400 shadow-none'
          : isOverlay
          ? 'shadow-2xl ring-2 ring-indigo-500 border-indigo-400 rotate-1 scale-102 cursor-grabbing'
          : 'shadow-xs hover:shadow-md border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      {/* Top Handle, Channel & Time */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 text-slate-300 hover:text-slate-600 dark:text-slate-600 dark:hover:text-slate-300 transition-colors rounded-sm"
            title="Arraste para mover de etapa"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <ChannelBadge channel={opportunity.channel} size="sm" />
        </div>
        <span className="text-[11px] text-slate-400 font-medium">
          {opportunity.lastActivity}
        </span>
      </div>

      {/* Contact Name & Company */}
      <div
        className="mb-2.5 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          if (contact && !isDragging) onOpenContact(contact);
        }}
      >
        <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
          {opportunity.contactName}
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{opportunity.company}</p>
      </div>

      {/* Value & Priority */}
      <div className="flex items-center justify-between pt-1 mb-2.5">
        <span className="font-heading font-extrabold text-base text-slate-900 dark:text-white">
          R$ {opportunity.value.toLocaleString('pt-BR')}
        </span>
        {opportunity.priority === 'alta' && (
          <span className="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 text-[10px] font-bold">
            Alta Prioridade
          </span>
        )}
      </div>

      {/* Next Action Box */}
      {opportunity.nextAction && (
        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 text-[11px] text-slate-600 dark:text-slate-300 mb-2.5 flex items-center gap-1.5 border border-slate-100 dark:border-slate-700/50">
          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="truncate">{opportunity.nextAction}</span>
        </div>
      )}

      {/* Card Footer: Probability & Owner */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60 text-[11px] text-slate-400">
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          {opportunity.probability}% prob.
        </span>
        <div className="flex items-center gap-1">
          <img
            src={opportunity.assignedToAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80"}
            alt={opportunity.assignedTo}
            className="w-5 h-5 rounded-full object-cover"
          />
          <span className="text-[10px] text-slate-600 dark:text-slate-400">{opportunity.assignedTo.split(' ')[0]}</span>
        </div>
      </div>
    </div>
  );
};

// Droppable Column Component
interface DroppableColumnProps {
  stage: PipelineStage;
  opportunities: Opportunity[];
  contacts: Contact[];
  onOpenContact: (contact: Contact) => void;
  onAddCard: () => void;
}

const DroppableKanbanColumn: React.FC<DroppableColumnProps> = ({
  stage,
  opportunities,
  contacts,
  onOpenContact,
  onAddCard,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: {
      type: 'Column',
      stage,
    },
  });

  const totalValue = opportunities.reduce((acc, o) => acc + o.value, 0);

  return (
    <div
      ref={setNodeRef}
      className={`w-80 shrink-0 flex flex-col rounded-2xl p-3 border transition-all min-h-[580px] ${
        isOver
          ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-400 ring-2 ring-indigo-400/30'
          : 'bg-slate-100/70 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between pb-2 mb-2 px-1 border-b border-slate-200/60 dark:border-slate-700/60">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: stage.color || '#4f46e5' }}
          />
          <span className="font-heading font-bold text-sm text-slate-900 dark:text-white">
            {stage.name}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs">
            {opportunities.length}
          </span>
        </div>

        <button
          onClick={onAddCard}
          className="w-7 h-7 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
          title="Adicionar Card Nesta Etapa"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Stage Subtotal */}
      <div className="flex items-center justify-between px-2 pb-2 text-xs text-slate-400 mb-1">
        <span>Soma provável</span>
        <span className="font-bold text-slate-800 dark:text-slate-200 font-heading">
          R$ {totalValue.toLocaleString('pt-BR')}
        </span>
      </div>

      {/* Cards Container */}
      <div className="flex flex-col gap-2.5 flex-1 min-h-[160px]">
        {opportunities.map((op) => {
          const contact = contacts.find((c) => c.id === op.contactId);
          return (
            <DraggableOpportunityCard
              key={op.id}
              opportunity={op}
              contact={contact}
              onOpenContact={onOpenContact}
            />
          );
        })}

        {opportunities.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700/60 rounded-xl p-6 text-center text-xs text-slate-400">
            <Inbox className="w-6 h-6 text-slate-300 dark:text-slate-600 mb-1.5" />
            <span>Arraste um card para cá</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const PipelinePage: React.FC = () => {
  const {
    stages,
    opportunities,
    updateOpportunityStage,
    addStage,
    setIsNewLeadModalOpen,
    setSelectedContact,
    contacts,
    setActivePage,
    addToast,
  } = useCrm();

  const [activeOpportunity, setActiveOpportunity] = useState<Opportunity | null>(null);
  const [channelFilter, setChannelFilter] = useState<'all' | ChannelType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  // Custom stage creation state
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#4f46e5');
  const [newStageTarget, setNewStageTarget] = useState('30');

  // Dnd-kit sensors configured with activation distance constraint so regular clicks open details
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const op = opportunities.find((o) => o.id === active.id);
    if (op) {
      setActiveOpportunity(op);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveOpportunity(null);

    if (!over) return;

    const opId = String(active.id);
    const overId = String(over.id);

    // If dropped directly onto a stage column
    const targetStage = stages.find((s) => s.id === overId);
    if (targetStage) {
      updateOpportunityStage(opId, targetStage.id);
      return;
    }

    // If dropped onto another card in a stage
    const overOp = opportunities.find((o) => o.id === overId);
    if (overOp && overOp.stageId) {
      updateOpportunityStage(opId, overOp.stageId);
    }
  };

  // Filtered opportunities
  const filteredOps = opportunities.filter((op) => {
    if (channelFilter !== 'all' && op.channel !== channelFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      if (!op.contactName.toLowerCase().includes(q) && !op.company.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  // Calculate summary metrics
  const totalInNegotiation = filteredOps.reduce((acc, o) => acc + o.value, 0);
  const avgTicket = filteredOps.length > 0 ? totalInNegotiation / filteredOps.length : 32850;

  const handleCreateStage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStageName.trim()) return;
    addStage(newStageName.trim(), newStageColor, Number(newStageTarget) || 30);
    setNewStageName('');
    addToast({
      type: 'success',
      title: 'Etapa Criada',
      message: `A etapa "${newStageName.trim()}" foi adicionada com sucesso ao funil.`,
    });
  };

  const handleOpenContact = (contact: Contact) => {
    setSelectedContact(contact);
    setActivePage('contatos');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Operational Filters */}
      <div className="flex flex-col gap-4">
        {/* Title Bar */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
              <Kanban className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tracking-tight">
                  Pipeline de Vendas Multicanal
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-xs">
                  Drag & Drop Ativo
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Arraste os cards entre as colunas para avançar as oportunidades de venda em tempo real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* View Mode Toggle */}
            <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center text-xs font-semibold">
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'kanban'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                <Kanban className="w-3.5 h-3.5" />
                <span>Kanban</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Lista</span>
              </button>
            </div>

            {/* New Lead Button */}
            <button
              onClick={() => setIsNewLeadModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Oportunidade</span>
            </button>
          </div>
        </div>

        {/* Operational Filter Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por lead, empresa ou negócio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
            />
          </div>

          {/* Channel Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 mr-1">
              <Filter className="w-3.5 h-3.5" /> Canal:
            </span>
            <button
              onClick={() => setChannelFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                channelFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              Todos ({opportunities.length})
            </button>
            <button
              onClick={() => setChannelFilter('whatsapp')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                channelFilter === 'whatsapp'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
              }`}
            >
              WhatsApp
            </button>
            <button
              onClick={() => setChannelFilter('instagram')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                channelFilter === 'instagram'
                  ? 'bg-pink-600 text-white shadow-xs'
                  : 'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 hover:bg-pink-100'
              }`}
            >
              Instagram
            </button>
            <button
              onClick={() => setChannelFilter('messenger')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                channelFilter === 'messenger'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100'
              }`}
            >
              Messenger
            </button>
          </div>
        </div>

        {/* Pipeline Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Valor Total em Funil
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">
                  R$ {totalInNegotiation.toLocaleString('pt-BR')}
                </span>
                <span className="text-xs font-bold text-indigo-600">{filteredOps.length} negócios</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Ticket Médio Geral
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">
                  R$ {Math.round(avgTicket).toLocaleString('pt-BR')}
                </span>
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
                  <TrendingUp className="w-3.5 h-3.5" /> +8.4%
                </span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Ciclo Médio de Venda
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">
                  18 dias
                </span>
                <span className="text-xs font-semibold text-emerald-600 flex items-center">
                  -2 dias
                </span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Taxa de Conversão
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">
                  22.4%
                </span>
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> +3.1%
                </span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* VIEW: KANBAN BOARD WITH DND-KIT */}
      {viewMode === 'kanban' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="w-full overflow-x-auto pb-6 pt-1 select-none">
            <div className="inline-flex gap-4 min-h-[580px] items-start pr-8">
              {stages.map((stage) => {
                const stageOps = filteredOps.filter((o) => o.stageId === stage.id);
                return (
                  <DroppableKanbanColumn
                    key={stage.id}
                    stage={stage}
                    opportunities={stageOps}
                    contacts={contacts}
                    onOpenContact={handleOpenContact}
                    onAddCard={() => setIsNewLeadModalOpen(true)}
                  />
                );
              })}

              {/* + Nova Etapa do Funil (Custom Stage Creator) */}
              <div className="w-80 shrink-0 flex flex-col rounded-2xl p-4 bg-slate-50 dark:bg-slate-800/30 border-2 border-dashed border-slate-300 dark:border-slate-700 justify-between min-h-[420px]">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
                      <PlusCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-white">
                        Nova Etapa
                      </h3>
                      <p className="text-xs text-slate-400">Personalize o funil de vendas</p>
                    </div>
                  </div>

                  <form onSubmit={handleCreateStage} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Nome da Fase
                      </label>
                      <input
                        type="text"
                        required
                        value={newStageName}
                        onChange={(e) => setNewStageName(e.target.value)}
                        placeholder="Ex: Onboarding Inicial"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Cor do Indicador
                      </label>
                      <div className="flex items-center gap-2">
                        {['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#64748b'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setNewStageColor(c)}
                            style={{ backgroundColor: c }}
                            className={`w-6 h-6 rounded-full transition-transform ${
                              newStageColor === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : 'hover:scale-105'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Meta de Conversão (%)
                      </label>
                      <input
                        type="number"
                        value={newStageTarget}
                        onChange={(e) => setNewStageTarget(e.target.value)}
                        placeholder="35"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Adicionar Etapa</span>
                    </button>
                  </form>
                </div>

                <div className="text-[11px] text-slate-400 bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700 mt-4">
                  💡 Dica: Arraste os cards entre colunas para atualizar automaticamente a fase e a probabilidade de fechamento.
                </div>
              </div>
            </div>
          </div>

          {/* Drag Overlay during active dragging */}
          <DragOverlay dropAnimation={null}>
            {activeOpportunity ? (
              <DraggableOpportunityCard
                opportunity={activeOpportunity}
                contact={contacts.find((c) => c.id === activeOpportunity.contactId)}
                onOpenContact={() => {}}
                isOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        /* VIEW: LIST MODE */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200/80 dark:border-slate-800 font-semibold">
                <tr>
                  <th className="py-3 px-4">Oportunidade / Lead</th>
                  <th className="py-3 px-4">Canal</th>
                  <th className="py-3 px-4">Etapa Atual</th>
                  <th className="py-3 px-4">Valor Estimado</th>
                  <th className="py-3 px-4">Probabilidade</th>
                  <th className="py-3 px-4">Próxima Ação</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOps.map((op) => {
                  const stage = stages.find((s) => s.id === op.stageId);
                  const contact = contacts.find((c) => c.id === op.contactId);
                  return (
                    <tr key={op.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{op.contactName}</div>
                        <div className="text-[11px] text-slate-400">{op.company}</div>
                      </td>
                      <td className="py-3 px-4">
                        <ChannelBadge channel={op.channel} size="sm" />
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-white inline-block"
                          style={{ backgroundColor: stage?.color || '#4f46e5' }}
                        >
                          {stage?.name || 'Etapa'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-heading font-bold text-slate-900 dark:text-white">
                        R$ {op.value.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 font-semibold text-emerald-600">
                        {op.probability}%
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                        {op.nextAction || '-'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            if (contact) handleOpenContact(contact);
                          }}
                          className="px-2.5 py-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg font-semibold inline-flex items-center gap-1"
                        >
                          <span>Ver Lead</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
