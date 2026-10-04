import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Contact,
  Opportunity,
  Conversation,
  VisitAppointment,
  AIAgent,
  WhatsAppTemplate,
  PipelineStage,
  CustomFieldDefinition,
  BusinessPresetType,
  ReminderSettings,
  Message
} from '../types/crm';
import { CrmService } from '../services/crmStorage';
import { BUSINESS_PRESETS } from '../mocks/businessPresets';

export type PageId =
  | 'dashboard'
  | 'conversas'
  | 'contatos'
  | 'pipeline'
  | 'calendario'
  | 'relatorios'
  | 'agentes-de-ia'
  | 'agentes'
  | 'templates'
  | 'configuracoes';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message?: string;
}

export type ToastInput = {
  type?: ToastMessage['type'];
  title: string;
  message?: string;
};

interface CrmContextType {
  activePage: PageId;
  setActivePage: (page: PageId) => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // Preset
  businessPreset: BusinessPresetType;
  setBusinessPreset: (preset: BusinessPresetType) => void;

  // Data
  contacts: Contact[];
  addContact: (contact: Omit<Contact, 'id' | 'createdAt'>) => Contact;
  updateContact: (contact: Contact) => void;
  deleteContact: (id: string) => void;
  selectedContact: Contact | null;
  setSelectedContact: (contact: Contact | null) => void;

  opportunities: Opportunity[];
  addOpportunity: (op: Omit<Opportunity, 'id' | 'lastActivity'>) => Opportunity;
  updateOpportunityStage: (opId: string, stageId: string) => void;
  deleteOpportunity: (id: string) => void;

  stages: PipelineStage[];
  pipelineStages: PipelineStage[];
  updateStages: (stages: PipelineStage[]) => void;
  updatePipelineStage: (id: string, updates: Partial<PipelineStage>) => void;
  addStage: (name: string, color: string, targetConversionRate?: number) => void;

  customFields: CustomFieldDefinition[];
  addCustomField: (field: Omit<CustomFieldDefinition, 'id'>) => void;
  removeCustomField: (id: string) => void;

  conversations: Conversation[];
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  sendMessage: (convId: string, text: string, sender?: 'agent' | 'human', isAi?: boolean) => void;
  addInternalNote: (convId: string, text: string) => void;
  toggleBotForConversation: (convId: string, active: boolean) => void;

  appointments: VisitAppointment[];
  addAppointment: (apt: Omit<VisitAppointment, 'id'>) => VisitAppointment;
  updateAppointment: (apt: VisitAppointment) => void;

  reminders: ReminderSettings;
  reminderSettings: ReminderSettings;
  updateReminders: (reminders: ReminderSettings) => void;
  updateReminderSettings: (settings: Partial<ReminderSettings>) => void;

  agents: AIAgent[];
  selectedAgentId: string;
  setSelectedAgentId: (id: string) => void;
  updateAgent: (agent: AIAgent) => void;
  addAgent: (agent: Omit<AIAgent, 'id' | 'conversationsCount' | 'resolvedRate'>) => AIAgent;

  templates: WhatsAppTemplate[];
  updateTemplate: (template: WhatsAppTemplate) => void;
  addTemplate: (template: Omit<WhatsAppTemplate, 'id' | 'metrics' | 'updatedAt'>) => WhatsAppTemplate;

  // Quick modals
  isNewLeadModalOpen: boolean;
  setIsNewLeadModalOpen: (open: boolean) => void;

  // Toast
  toasts: ToastMessage[];
  addToast: (titleOrObj: string | ToastInput, message?: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;
}

const CrmContext = createContext<CrmContextType | undefined>(undefined);

export const CrmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('conectacrm_theme') as 'light' | 'dark') || 'light';
  });

  const [businessPreset, setBusinessPresetState] = useState<BusinessPresetType>(() => CrmService.getBusinessPreset());
  const [contacts, setContacts] = useState<Contact[]>(() => CrmService.getContacts());
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>(() => CrmService.getOpportunities());
  const [stages, setStages] = useState<PipelineStage[]>(() => CrmService.getStages());
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>(() => CrmService.getCustomFields());
  const [conversations, setConversations] = useState<Conversation[]>(() => CrmService.getConversations());
  const [activeConversationId, setActiveConversationId] = useState<string | null>('conv_1');
  const [appointments, setAppointments] = useState<VisitAppointment[]>(() => CrmService.getAppointments());
  const [reminders, setReminders] = useState<ReminderSettings>(() => CrmService.getReminders());
  const [agents, setAgents] = useState<AIAgent[]>(() => CrmService.getAgents());
  const [selectedAgentId, setSelectedAgentId] = useState<string>('ag_1');
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>(() => CrmService.getTemplates());

  const [isNewLeadModalOpen, setIsNewLeadModalOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Apply dark mode class to html
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('conectacrm_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => !prev);
  };

  const addToast = (titleOrObj: string | ToastInput, message?: string, type: ToastMessage['type'] = 'info') => {
    const id = `t_${Date.now()}_${Math.random()}`;
    let title = '';
    let msg = message;
    let toastType = type;

    if (typeof titleOrObj === 'object' && titleOrObj !== null) {
      title = titleOrObj.title;
      msg = titleOrObj.message;
      toastType = titleOrObj.type || 'info';
    } else {
      title = titleOrObj;
    }

    setToasts(prev => [...prev, { id, title, message: msg, type: toastType }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const setBusinessPreset = (preset: BusinessPresetType) => {
    CrmService.setBusinessPreset(preset);
    setBusinessPresetState(preset);
    const config = BUSINESS_PRESETS[preset];
    if (config) {
      setStages(config.defaultPipelineStages);
      setCustomFields(config.defaultCustomFields);
      addToast(
        `Tipo de Negócio alterado para ${config.name}`,
        'Campos customizados, etapas de funil e prompts iniciais foram atualizados.',
        'success'
      );
    }
  };

  // Contacts
  const addContact = (data: Omit<Contact, 'id' | 'createdAt'>): Contact => {
    const newContact: Contact = {
      ...data,
      id: `c_${Date.now()}`,
      createdAt: 'Agora',
    };
    const updated = [newContact, ...contacts];
    setContacts(updated);
    CrmService.saveContacts(updated);

    // Also auto-create opportunity if value > 0
    if (newContact.opportunityValue > 0) {
      addOpportunity({
        contactId: newContact.id,
        contactName: newContact.name,
        company: newContact.company,
        value: newContact.opportunityValue,
        stageId: newContact.stageId || stages[0]?.id || 'st_1',
        channel: newContact.channel,
        priority: 'alta',
        probability: 60,
        expectedCloseDate: 'Em 30 dias',
        nextAction: 'Qualificação inicial do lead',
        assignedTo: newContact.assignedTo || 'Marcelo Luiz',
      });
    }

    addToast('Lead cadastrado com sucesso!', `${newContact.name} adicionado à base.`, 'success');
    return newContact;
  };

  const updateContact = (updatedContact: Contact) => {
    const updated = contacts.map(c => (c.id === updatedContact.id ? updatedContact : c));
    setContacts(updated);
    CrmService.saveContacts(updated);
    if (selectedContact?.id === updatedContact.id) {
      setSelectedContact(updatedContact);
    }
    addToast('Contato atualizado', 'As alterações foram salvas com sucesso.', 'success');
  };

  const deleteContact = (id: string) => {
    const updated = contacts.filter(c => c.id !== id);
    setContacts(updated);
    CrmService.saveContacts(updated);
    if (selectedContact?.id === id) {
      setSelectedContact(null);
    }
    addToast('Contato removido', '', 'info');
  };

  // Opportunities
  const addOpportunity = (data: Omit<Opportunity, 'id' | 'lastActivity'>): Opportunity => {
    const newOp: Opportunity = {
      ...data,
      id: `op_${Date.now()}`,
      lastActivity: 'Criado agora',
    };
    const updated = [newOp, ...opportunities];
    setOpportunities(updated);
    CrmService.saveOpportunities(updated);
    return newOp;
  };

  const updateOpportunityStage = (opId: string, stageId: string) => {
    const target = opportunities.find(o => o.id === opId);
    if (!target) return;
    const stage = stages.find(s => s.id === stageId);
    const updated = opportunities.map(o => (o.id === opId ? { ...o, stageId, lastActivity: 'Agora' } : o));
    setOpportunities(updated);
    CrmService.saveOpportunities(updated);
    addToast('Oportunidade movida', `${target.contactName} avançou para "${stage?.name || 'nova etapa'}".`, 'info');
  };

  const deleteOpportunity = (id: string) => {
    const updated = opportunities.filter(o => o.id !== id);
    setOpportunities(updated);
    CrmService.saveOpportunities(updated);
  };

  // Stages
  const updateStages = (newStages: PipelineStage[]) => {
    setStages(newStages);
    CrmService.saveStages(newStages);
  };

  const updatePipelineStage = (id: string, updates: Partial<PipelineStage>) => {
    const updated = stages.map(s => (s.id === id ? { ...s, ...updates } : s));
    setStages(updated);
    CrmService.saveStages(updated);
  };

  const addStage = (name: string, color: string, targetConversionRate = 30) => {
    const newStage: PipelineStage = {
      id: `st_${Date.now()}`,
      name,
      color,
      order: stages.length,
      targetConversionRate,
    };
    const updated = [...stages, newStage];
    setStages(updated);
    CrmService.saveStages(updated);
    addToast('Nova etapa adicionada', `A fase "${name}" já está disponível no Pipeline.`, 'success');
  };

  // Custom Fields
  const addCustomField = (field: Omit<CustomFieldDefinition, 'id'>) => {
    const newField = CrmService.addCustomField(field);
    setCustomFields(prev => [...prev, newField]);
    addToast('Campo customizado criado', `O campo "${field.name}" foi adicionado aos contatos.`, 'success');
  };

  const removeCustomField = (id: string) => {
    const updated = customFields.filter(f => f.id !== id);
    setCustomFields(updated);
    CrmService.saveCustomFields(updated);
  };

  // Conversations
  const sendMessage = (convId: string, text: string, sender: 'agent' | 'human' = 'human', isAi = false) => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newMsg: Message = {
      id: `m_${Date.now()}`,
      conversationId: convId,
      sender,
      senderName: sender === 'human' ? 'Marcelo Luiz' : 'Sofia (Agente IA)',
      text,
      timestamp: timeStr,
      status: 'read',
      isAiGenerated: isAi,
    };

    const updated = conversations.map(c => {
      if (c.id === convId) {
        return {
          ...c,
          lastMessage: text,
          lastMessageTime: timeStr,
          messages: [...c.messages, newMsg],
          unreadCount: 0,
        };
      }
      return c;
    });

    setConversations(updated);
    CrmService.saveConversations(updated);
  };

  const addInternalNote = (convId: string, text: string) => {
    const note = {
      id: `n_${Date.now()}`,
      author: 'Marcelo Luiz',
      text,
      timestamp: 'Agora',
    };
    const updated = conversations.map(c => {
      if (c.id === convId) {
        return {
          ...c,
          internalNotes: [note, ...c.internalNotes],
        };
      }
      return c;
    });
    setConversations(updated);
    CrmService.saveConversations(updated);
    addToast('Nota interna registrada', 'Visível apenas para sua equipe.', 'info');
  };

  const toggleBotForConversation = (convId: string, active: boolean) => {
    const updated = conversations.map(c => {
      if (c.id === convId) {
        return {
          ...c,
          isBotActive: active,
          assignedTo: active ? 'Sofia (IA)' : 'Marcelo Luiz',
        };
      }
      return c;
    });
    setConversations(updated);
    CrmService.saveConversations(updated);
    addToast(
      active ? 'Agente de IA reativado' : 'Conversa assumida por Humano',
      active ? 'O bot voltará a responder automaticamente às dúvidas do lead.' : 'O bot foi desativado nesta conversa e transferido para Marcelo Luiz.',
      active ? 'info' : 'warning'
    );
  };

  // Appointments
  const addAppointment = (aptData: Omit<VisitAppointment, 'id'>): VisitAppointment => {
    const newApt: VisitAppointment = {
      ...aptData,
      id: `ap_${Date.now()}`,
    };
    const updated = [...appointments, newApt];
    setAppointments(updated);
    CrmService.saveAppointments(updated);
    addToast('Compromisso agendado!', `${newApt.title} marcado para ${newApt.time}.`, 'success');
    return newApt;
  };

  const updateAppointment = (apt: VisitAppointment) => {
    const updated = appointments.map(a => (a.id === apt.id ? apt : a));
    setAppointments(updated);
    CrmService.saveAppointments(updated);
    addToast('Compromisso atualizado', '', 'info');
  };

  // Reminders
  const updateReminders = (newSettings: ReminderSettings) => {
    setReminders(newSettings);
    CrmService.saveReminders(newSettings);
    addToast('Automação de lembretes atualizada', 'Configurações de disparos sincronizadas.', 'success');
  };

  const updateReminderSettings = (newSettings: Partial<ReminderSettings>) => {
    const updated = { ...reminders, ...newSettings };
    setReminders(updated);
    CrmService.saveReminders(updated);
  };

  // Agents
  const updateAgent = (agent: AIAgent) => {
    const updated = agents.map(a => (a.id === agent.id ? agent : a));
    setAgents(updated);
    CrmService.saveAgents(updated);
    addToast('Agente de IA atualizado', `As diretrizes de "${agent.name}" foram salvas.`, 'success');
  };

  const addAgent = (data: Omit<AIAgent, 'id' | 'conversationsCount' | 'resolvedRate'>): AIAgent => {
    const newAgent: AIAgent = {
      ...data,
      id: `ag_${Date.now()}`,
      conversationsCount: 0,
      resolvedRate: 100,
    };
    const updated = [...agents, newAgent];
    setAgents(updated);
    CrmService.saveAgents(updated);
    setSelectedAgentId(newAgent.id);
    addToast('Novo Agente de IA criado', `"${newAgent.name}" pronto para ser configurado.`, 'success');
    return newAgent;
  };

  // Templates
  const updateTemplate = (template: WhatsAppTemplate) => {
    const updated = templates.map(t => (t.id === template.id ? template : t));
    setTemplates(updated);
    CrmService.saveTemplates(updated);
    addToast('Template WhatsApp salvo', `Modelo "${template.name}" atualizado.`, 'success');
  };

  const addTemplate = (data: Omit<WhatsAppTemplate, 'id' | 'metrics' | 'updatedAt'>): WhatsAppTemplate => {
    const newTpl: WhatsAppTemplate = {
      ...data,
      id: `tpl_${Date.now()}`,
      metrics: { sent: 0, readRate: 0 },
      updatedAt: 'Agora',
    };
    const updated = [newTpl, ...templates];
    setTemplates(updated);
    CrmService.saveTemplates(updated);
    addToast('Template enviado à Meta', 'Status: PENDENTE de validação.', 'success');
    return newTpl;
  };

  return (
    <CrmContext.Provider
      value={{
        activePage,
        setActivePage,
        isSidebarCollapsed,
        toggleSidebar,
        theme,
        toggleTheme,
        businessPreset,
        setBusinessPreset,
        contacts,
        addContact,
        updateContact,
        deleteContact,
        selectedContact,
        setSelectedContact,
        opportunities,
        addOpportunity,
        updateOpportunityStage,
        deleteOpportunity,
        stages,
        pipelineStages: stages,
        updateStages,
        updatePipelineStage,
        addStage,
        customFields,
        addCustomField,
        removeCustomField,
        conversations,
        activeConversationId,
        setActiveConversationId,
        sendMessage,
        addInternalNote,
        toggleBotForConversation,
        appointments,
        addAppointment,
        updateAppointment,
        reminders,
        reminderSettings: reminders,
        updateReminders,
        updateReminderSettings,
        agents,
        selectedAgentId,
        setSelectedAgentId,
        updateAgent,
        addAgent,
        templates,
        updateTemplate,
        addTemplate,
        isNewLeadModalOpen,
        setIsNewLeadModalOpen,
        toasts,
        addToast,
        removeToast,
      }}
    >
      {children}
    </CrmContext.Provider>
  );
};

export const useCrm = () => {
  const context = useContext(CrmContext);
  if (!context) {
    throw new Error('useCrm must be used within a CrmProvider');
  }
  return context;
};
