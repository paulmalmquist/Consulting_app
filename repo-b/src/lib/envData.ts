/**
 * envData.ts
 * Environment-scoped data persistence layer.
 * Stores data in localStorage keyed by envId with a version field
 * so it can be migrated to a backend later with minimal refactor.
 */

const STORAGE_PREFIX = "lab_env_data_";
const CURRENT_VERSION = 1;

export type EnvDataStore = {
  version: number;
  departments: string[];
  capabilities: Record<string, string[]>;
  crm: CrmDataStore;
};

export type CrmDataStore = {
  companies: Company[];
  contacts: Contact[];
  interactions: Interaction[];
};

export type Company = {
  id: string;
  name: string;
  website?: string;
  industry?: string;
  size?: string;
  location?: string;
  owner?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastTouchAt?: string;
  touchCadenceDays?: number;
  nextTouchDueAt?: string;
};

export type Contact = {
  id: string;
  companyId?: string;
  firstName: string;
  lastName: string;
  title?: string;
  email?: string;
  phone?: string;
  owner?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastTouchAt?: string;
  touchCadenceDays?: number;
  nextTouchDueAt?: string;
};

export type Interaction = {
  id: string;
  companyId?: string;
  contactId?: string;
  type: "call" | "email" | "meeting" | "text" | "other";
  occurredAt: string;
  summary: string;
  outcome?: string;
  nextActionAt?: string;
  createdAt: string;
};

function storageKey(envId: string): string {
  return `${STORAGE_PREFIX}${envId}`;
}

function defaultStore(): EnvDataStore {
  return {
    version: CURRENT_VERSION,
    departments: [],
    capabilities: {},
    crm: { companies: [], contacts: [], interactions: [] },
  };
}

export function getEnvData(envId: string): EnvDataStore {
  if (typeof window === "undefined") return defaultStore();
  try {
    const raw = localStorage.getItem(storageKey(envId));
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw) as EnvDataStore;
    if (!parsed.version) parsed.version = CURRENT_VERSION;
    if (!parsed.departments) parsed.departments = [];
    if (!parsed.capabilities) parsed.capabilities = {};
    if (!parsed.crm) parsed.crm = { companies: [], contacts: [], interactions: [] };
    return parsed;
  } catch {
    return defaultStore();
  }
}

export function setEnvData(envId: string, data: EnvDataStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(envId), JSON.stringify(data));
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function computeNextTouchDue(lastTouchAt: string | undefined, touchCadenceDays: number | undefined): string | undefined {
  if (!touchCadenceDays || touchCadenceDays <= 0) return undefined;
  if (!lastTouchAt) return new Date().toISOString();
  const last = new Date(lastTouchAt);
  const next = new Date(last.getTime() + touchCadenceDays * 86400000);
  return next.toISOString();
}

export function isTouchOverdue(nextTouchDueAt: string | undefined): boolean {
  if (!nextTouchDueAt) return false;
  return new Date(nextTouchDueAt) < new Date();
}

// --- Department helpers ---

export function getAddedDepartments(envId: string): string[] {
  return getEnvData(envId).departments;
}

export function addDepartment(envId: string, deptKey: string): void {
  const data = getEnvData(envId);
  if (data.departments.includes(deptKey)) return;
  data.departments.push(deptKey);
  setEnvData(envId, data);
}

// --- Capability helpers ---

export function getEnabledCapabilities(envId: string, deptKey: string): string[] {
  return getEnvData(envId).capabilities[deptKey] || [];
}

export function addCapability(envId: string, deptKey: string, capKey: string): void {
  const data = getEnvData(envId);
  if (!data.capabilities[deptKey]) data.capabilities[deptKey] = [];
  if (data.capabilities[deptKey].includes(capKey)) return;
  data.capabilities[deptKey].push(capKey);
  setEnvData(envId, data);
}

// --- CRM helpers ---

export function getCompanies(envId: string): Company[] {
  return getEnvData(envId).crm.companies;
}

export function addCompany(envId: string, company: Omit<Company, "id" | "createdAt" | "updatedAt" | "nextTouchDueAt">): Company {
  const data = getEnvData(envId);
  const now = new Date().toISOString();
  const newCompany: Company = {
    ...company,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    nextTouchDueAt: computeNextTouchDue(company.lastTouchAt, company.touchCadenceDays),
  };
  data.crm.companies.push(newCompany);
  setEnvData(envId, data);
  return newCompany;
}

export function updateCompany(envId: string, id: string, updates: Partial<Company>): Company | null {
  const data = getEnvData(envId);
  const idx = data.crm.companies.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const company = { ...data.crm.companies[idx], ...updates, updatedAt: new Date().toISOString() };
  company.nextTouchDueAt = computeNextTouchDue(company.lastTouchAt, company.touchCadenceDays);
  data.crm.companies[idx] = company;
  setEnvData(envId, data);
  return company;
}

export function getContacts(envId: string): Contact[] {
  return getEnvData(envId).crm.contacts;
}

export function addContact(envId: string, contact: Omit<Contact, "id" | "createdAt" | "updatedAt" | "nextTouchDueAt">): Contact {
  const data = getEnvData(envId);
  const now = new Date().toISOString();
  const newContact: Contact = {
    ...contact,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    nextTouchDueAt: computeNextTouchDue(contact.lastTouchAt, contact.touchCadenceDays),
  };
  data.crm.contacts.push(newContact);
  setEnvData(envId, data);
  return newContact;
}

export function updateContact(envId: string, id: string, updates: Partial<Contact>): Contact | null {
  const data = getEnvData(envId);
  const idx = data.crm.contacts.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const contact = { ...data.crm.contacts[idx], ...updates, updatedAt: new Date().toISOString() };
  contact.nextTouchDueAt = computeNextTouchDue(contact.lastTouchAt, contact.touchCadenceDays);
  data.crm.contacts[idx] = contact;
  setEnvData(envId, data);
  return contact;
}

export function getInteractions(envId: string): Interaction[] {
  return getEnvData(envId).crm.interactions;
}

export function addInteraction(
  envId: string,
  interaction: Omit<Interaction, "id" | "createdAt">
): Interaction {
  const data = getEnvData(envId);
  const now = new Date().toISOString();
  const newInteraction: Interaction = {
    ...interaction,
    id: generateId(),
    createdAt: now,
  };
  data.crm.interactions.push(newInteraction);

  // Auto-update lastTouchAt for related company
  if (interaction.companyId) {
    const compIdx = data.crm.companies.findIndex((c) => c.id === interaction.companyId);
    if (compIdx !== -1) {
      const company = data.crm.companies[compIdx];
      if (!company.lastTouchAt || new Date(interaction.occurredAt) > new Date(company.lastTouchAt)) {
        company.lastTouchAt = interaction.occurredAt;
        company.updatedAt = now;
        company.nextTouchDueAt = computeNextTouchDue(company.lastTouchAt, company.touchCadenceDays);
        data.crm.companies[compIdx] = company;
      }
    }
  }

  // Auto-update lastTouchAt for related contact
  if (interaction.contactId) {
    const conIdx = data.crm.contacts.findIndex((c) => c.id === interaction.contactId);
    if (conIdx !== -1) {
      const contact = data.crm.contacts[conIdx];
      if (!contact.lastTouchAt || new Date(interaction.occurredAt) > new Date(contact.lastTouchAt)) {
        contact.lastTouchAt = interaction.occurredAt;
        contact.updatedAt = now;
        contact.nextTouchDueAt = computeNextTouchDue(contact.lastTouchAt, contact.touchCadenceDays);
        data.crm.contacts[conIdx] = contact;
      }
    }
  }

  setEnvData(envId, data);
  return newInteraction;
}
