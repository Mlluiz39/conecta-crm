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
  ReminderSettings
} from '../types/crm';
import {
  INITIAL_CONTACTS,
  INITIAL_OPPORTUNITIES,
  INITIAL_CONVERSATIONS,
  INITIAL_APPOINTMENTS,
  INITIAL_AGENTS,
  INITIAL_TEMPLATES,
  INITIAL_STAGES,
  INITIAL_CUSTOM_FIELDS,
  INITIAL_USER
} from '../mocks/initialData';
import { BUSINESS_PRESETS } from '../mocks/businessPresets';

const STORAGE_KEYS = {
  PRESET: 'conectacrm_business_preset',
  CONTACTS: 'conectacrm_contacts',
  OPPORTUNITIES: 'conectacrm_opportunities',
  CONVERSATIONS: 'conectacrm_conversations',
  APPOINTMENTS: 'conectacrm_appointments',
  AGENTS: 'conectacrm_agents',
  TEMPLATES: 'conectacrm_templates',
  STAGES: 'conectacrm_stages',
  CUSTOM_FIELDS: 'conectacrm_custom_fields',
  REMINDERS: 'conectacrm_reminders',
  THEME: 'conectacrm_theme',
};

// Safe LocalStorage helpers
function load<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    return JSON.parse(item);
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Falha ao salvar ${key}:`, e);
  }
}

/**
 * CRM Data Service (Architecture designed to swap with Supabase Client / RPCs)
 */
export const CrmService = {
  getUser() {
    return INITIAL_USER;
  },

  getBusinessPreset(): BusinessPresetType {
    return load<BusinessPresetType>(STORAGE_KEYS.PRESET, 'imobiliaria');
  },

  setBusinessPreset(presetId: BusinessPresetType) {
    save(STORAGE_KEYS.PRESET, presetId);
    const preset = BUSINESS_PRESETS[presetId];
    if (preset) {
      this.saveStages(preset.defaultPipelineStages);
      this.saveCustomFields(preset.defaultCustomFields);
    }
  },

  // Stages
  getStages(): PipelineStage[] {
    return load<PipelineStage[]>(STORAGE_KEYS.STAGES, INITIAL_STAGES);
  },

  saveStages(stages: PipelineStage[]) {
    save(STORAGE_KEYS.STAGES, stages);
  },

  // Custom Fields
  getCustomFields(): CustomFieldDefinition[] {
    return load<CustomFieldDefinition[]>(STORAGE_KEYS.CUSTOM_FIELDS, INITIAL_CUSTOM_FIELDS);
  },

  saveCustomFields(fields: CustomFieldDefinition[]) {
    save(STORAGE_KEYS.CUSTOM_FIELDS, fields);
  },

  addCustomField(field: Omit<CustomFieldDefinition, 'id'>): CustomFieldDefinition {
    const fields = this.getCustomFields();
    const newField: CustomFieldDefinition = {
      ...field,
      id: `f_custom_${Date.now()}`,
    };
    fields.push(newField);
    this.saveCustomFields(fields);
    return newField;
  },

  // Contacts
  getContacts(): Contact[] {
    return load<Contact[]>(STORAGE_KEYS.CONTACTS, INITIAL_CONTACTS);
  },

  saveContacts(contacts: Contact[]) {
    save(STORAGE_KEYS.CONTACTS, contacts);
  },

  saveContact(contact: Contact) {
    const contacts = this.getContacts();
    const idx = contacts.findIndex(c => c.id === contact.id);
    if (idx >= 0) {
      contacts[idx] = contact;
    } else {
      contacts.unshift(contact);
    }
    this.saveContacts(contacts);
  },

  // Opportunities
  getOpportunities(): Opportunity[] {
    return load<Opportunity[]>(STORAGE_KEYS.OPPORTUNITIES, INITIAL_OPPORTUNITIES);
  },

  saveOpportunities(ops: Opportunity[]) {
    save(STORAGE_KEYS.OPPORTUNITIES, ops);
  },

  updateOpportunityStage(opportunityId: string, newStageId: string) {
    const ops = this.getOpportunities();
    const target = ops.find(o => o.id === opportunityId);
    if (target) {
      target.stageId = newStageId;
      target.lastActivity = 'Agora';
      this.saveOpportunities(ops);
    }
  },

  // Conversations
  getConversations(): Conversation[] {
    return load<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, INITIAL_CONVERSATIONS);
  },

  saveConversations(convs: Conversation[]) {
    save(STORAGE_KEYS.CONVERSATIONS, convs);
  },

  saveConversation(conv: Conversation) {
    const convs = this.getConversations();
    const idx = convs.findIndex(c => c.id === conv.id);
    if (idx >= 0) {
      convs[idx] = conv;
    } else {
      convs.unshift(conv);
    }
    this.saveConversations(convs);
  },

  // Appointments / Calendar Visits
  getAppointments(): VisitAppointment[] {
    return load<VisitAppointment[]>(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
  },

  saveAppointments(apts: VisitAppointment[]) {
    save(STORAGE_KEYS.APPOINTMENTS, apts);
  },

  saveAppointment(apt: VisitAppointment) {
    const apts = this.getAppointments();
    const idx = apts.findIndex(a => a.id === apt.id);
    if (idx >= 0) {
      apts[idx] = apt;
    } else {
      apts.push(apt);
    }
    this.saveAppointments(apts);
  },

  // AI Reminders
  getReminders(): ReminderSettings {
    return load<ReminderSettings>(STORAGE_KEYS.REMINDERS, {
      whatsapp24h: true,
      meet1h: true,
      smsPush10min: true,
    });
  },

  saveReminders(settings: ReminderSettings) {
    save(STORAGE_KEYS.REMINDERS, settings);
  },

  // AI Agents
  getAgents(): AIAgent[] {
    return load<AIAgent[]>(STORAGE_KEYS.AGENTS, INITIAL_AGENTS);
  },

  saveAgents(agents: AIAgent[]) {
    save(STORAGE_KEYS.AGENTS, agents);
  },

  saveAgent(agent: AIAgent) {
    const agents = this.getAgents();
    const idx = agents.findIndex(a => a.id === agent.id);
    if (idx >= 0) {
      agents[idx] = agent;
    } else {
      agents.push(agent);
    }
    this.saveAgents(agents);
  },

  // WhatsApp Templates (HSM)
  getTemplates(): WhatsAppTemplate[] {
    return load<WhatsAppTemplate[]>(STORAGE_KEYS.TEMPLATES, INITIAL_TEMPLATES);
  },

  saveTemplates(templates: WhatsAppTemplate[]) {
    save(STORAGE_KEYS.TEMPLATES, templates);
  },

  saveTemplate(tpl: WhatsAppTemplate) {
    const tpls = this.getTemplates();
    const idx = tpls.findIndex(t => t.id === tpl.id);
    if (idx >= 0) {
      tpls[idx] = tpl;
    } else {
      tpls.unshift(tpl);
    }
    this.saveTemplates(tpls);
  },

  // Reset to initial demo state
  resetAll() {
    localStorage.clear();
    save(STORAGE_KEYS.PRESET, 'imobiliaria');
    save(STORAGE_KEYS.CONTACTS, INITIAL_CONTACTS);
    save(STORAGE_KEYS.OPPORTUNITIES, INITIAL_OPPORTUNITIES);
    save(STORAGE_KEYS.CONVERSATIONS, INITIAL_CONVERSATIONS);
    save(STORAGE_KEYS.APPOINTMENTS, INITIAL_APPOINTMENTS);
    save(STORAGE_KEYS.AGENTS, INITIAL_AGENTS);
    save(STORAGE_KEYS.TEMPLATES, INITIAL_TEMPLATES);
    save(STORAGE_KEYS.STAGES, INITIAL_STAGES);
    save(STORAGE_KEYS.CUSTOM_FIELDS, INITIAL_CUSTOM_FIELDS);
  }
};
