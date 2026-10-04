export type BusinessPresetType = 'imobiliaria' | 'ecommerce' | 'clinica' | 'agencia';

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'currency';

export interface CustomFieldDefinition {
  id: string;
  key: string;
  name: string;
  type: CustomFieldType;
  options?: string[]; // For select type
  required?: boolean;
  placeholder?: string;
}

export type ChannelType = 'whatsapp' | 'instagram' | 'messenger' | 'web' | 'email' | 'telefone';

export interface Contact {
  id: string;
  name: string;
  role: string;
  company: string;
  phone: string;
  email: string;
  cnpj?: string;
  address?: string;
  city?: string;
  state?: string;
  avatar?: string;
  channel: ChannelType;
  tags: string[];
  opportunityValue: number;
  stageId: string;
  assignedTo: string;
  assignedToAvatar?: string;
  lastInteraction: string;
  lastInteractionTime: string;
  createdAt: string;
  verified?: boolean;
  customFields: Record<string, any>;
}

export interface Opportunity {
  id: string;
  contactId: string;
  contactName: string;
  company: string;
  value: number;
  stageId: string;
  channel: ChannelType;
  priority: 'alta' | 'media' | 'baixa';
  priorityLabel?: string;
  probability: number;
  expectedCloseDate: string;
  nextAction: string;
  assignedTo: string;
  assignedToAvatar?: string;
  lastActivity: string;
  notes?: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
  targetConversionRate?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: 'contact' | 'agent' | 'human';
  senderName: string;
  text: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
  mediaUrl?: string;
  isAiGenerated?: boolean;
  aiSuggestion?: boolean;
}

export interface InternalNote {
  id: string;
  author: string;
  authorAvatar?: string;
  text: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  contactCompany: string;
  contactRole?: string;
  contactPhone: string;
  contactEmail: string;
  contactCity?: string;
  contactAvatar?: string;
  channel: ChannelType;
  status: 'aberta' | 'resolvida' | 'pendente';
  isBotActive: boolean;
  botName: string;
  assignedTo: string;
  assignedToAvatar?: string;
  tags: string[];
  opportunityValue: number;
  opportunityStageId: string;
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: string;
  messages: Message[];
  internalNotes: InternalNote[];
  nextAppointment?: {
    title: string;
    date: string;
    time: string;
    meetLink?: string;
  };
}

export interface VisitAppointment {
  id: string;
  contactId: string;
  contactName: string;
  company: string;
  title: string;
  date: string; // YYYY-MM-DD
  dayOfWeek?: number; // 0 to 6
  time: string; // HH:mm
  durationMinutes: number;
  type: 'demo' | 'presencial' | 'followup' | 'onboarding' | 'fechamento';
  channel: 'meet' | 'whatsapp' | 'presencial' | 'phone';
  meetLink?: string;
  location?: string;
  status: 'confirmada' | 'pendente' | 'cancelada';
  value?: number;
  assignedTo: string;
  assignedToAvatar?: string;
  notes?: string;
}

export interface ReminderSettings {
  whatsapp24h: boolean;
  meet1h: boolean;
  smsPush10min: boolean;
  enabled24h?: boolean;
  enabled2h?: boolean;
  enabledNoShowFollowup?: boolean;
}

export interface AIAgent {
  id: string;
  name: string;
  role: 'Vendedor' | 'Atendente' | 'Suporte' | 'Agendador' | 'Personalizado';
  roleTag: string;
  toneOfVoice: string[];
  systemPrompt: string;
  channels: ('whatsapp' | 'instagram' | 'messenger')[];
  tools: {
    searchKnowledge: boolean;
    scheduleVisit: boolean;
    handoffToHuman: boolean;
  };
  promptVersion: 'publicada' | 'rascunho';
  publishedPrompt?: string;
  draftPrompt?: string;
  active: boolean;
  conversationsCount: number;
  resolvedRate: number;
  avatarIcon?: string;
  color?: string;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  category: 'UTILIDADE' | 'MARKETING' | 'AUTENTICACAO';
  language: string;
  headerType: 'none' | 'text' | 'image' | 'document';
  headerText?: string;
  headerMediaUrl?: string;
  body: string;
  footer?: string;
  buttons: {
    type: 'quick_reply' | 'url' | 'phone';
    text: string;
    value?: string;
  }[];
  status: 'APROVADO' | 'PENDENTE' | 'REJEITADO';
  rejectionReason?: string;
  metrics: {
    sent: number;
    readRate: number;
  };
  updatedAt: string;
}

export interface AgentPerformance {
  id: string;
  name: string;
  role: string;
  isAi: boolean;
  avatar?: string;
  conversationsHandled: number;
  avgResponseTime: string;
  convertedLeads: number;
  conversionRate: number;
  revenueGenerated: number;
  badge?: string;
}

export interface BusinessPresetConfig {
  id: BusinessPresetType;
  name: string;
  description: string;
  icon: string;
  defaultCustomFields: CustomFieldDefinition[];
  defaultPipelineStages: PipelineStage[];
  defaultTags: string[];
  starterPrompts: Record<string, string>;
}
