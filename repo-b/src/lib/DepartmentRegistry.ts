/**
 * DepartmentRegistry.ts
 * Single source of truth for department presentation metadata.
 * Supplements database-stored department records with UI-specific data.
 */

export interface DepartmentMeta {
  key: string;
  displayName: string;
  icon: string;
  description: string;
  accentColor: string;
  category: "core" | "operations" | "support" | "system";
  defaultCapKey: string;
  sortOrder: number;
}

export const DEPARTMENT_REGISTRY: Record<string, DepartmentMeta> = {
  crm: {
    key: "crm",
    displayName: "CRM",
    icon: "users",
    description: "Customer relationships, pipeline, and revenue tracking",
    accentColor: "blue",
    category: "core",
    defaultCapKey: "accounts",
    sortOrder: 10,
  },
  accounting: {
    key: "accounting",
    displayName: "Accounting",
    icon: "dollar-sign",
    description: "General ledger, payables, receivables, and financial reporting",
    accentColor: "green",
    category: "core",
    defaultCapKey: "chart_of_accounts",
    sortOrder: 20,
  },
  operations: {
    key: "operations",
    displayName: "Operations",
    icon: "settings",
    description: "Workflows, SOPs, KPIs, and operational excellence",
    accentColor: "orange",
    category: "operations",
    defaultCapKey: "workflows",
    sortOrder: 30,
  },
  projects: {
    key: "projects",
    displayName: "Projects",
    icon: "clipboard",
    description: "Project tracking, Gantt, milestones, and resource allocation",
    accentColor: "purple",
    category: "operations",
    defaultCapKey: "active_projects",
    sortOrder: 40,
  },
  it: {
    key: "it",
    displayName: "IT",
    icon: "cpu",
    description: "Service desk, assets, change management, and automation",
    accentColor: "cyan",
    category: "support",
    defaultCapKey: "ticket_queue",
    sortOrder: 50,
  },
  legal: {
    key: "legal",
    displayName: "Legal",
    icon: "shield",
    description: "Contracts, compliance, regulatory requirements, and risk",
    accentColor: "red",
    category: "support",
    defaultCapKey: "contracts",
    sortOrder: 60,
  },
  hr: {
    key: "hr",
    displayName: "HR",
    icon: "heart",
    description: "People, recruiting, performance, compensation, and org structure",
    accentColor: "pink",
    category: "support",
    defaultCapKey: "employees",
    sortOrder: 70,
  },
  executive: {
    key: "executive",
    displayName: "Executive",
    icon: "bar-chart",
    description: "Cross-functional dashboards, AI insights, and strategic overview",
    accentColor: "gold",
    category: "system",
    defaultCapKey: "revenue_summary",
    sortOrder: 80,
  },
  documents: {
    key: "documents",
    displayName: "Documents",
    icon: "folder",
    description: "Central document library, versioning, and access control",
    accentColor: "slate",
    category: "system",
    defaultCapKey: "document_library",
    sortOrder: 90,
  },
  admin: {
    key: "admin",
    displayName: "Admin",
    icon: "lock",
    description: "Users, roles, department config, and audit",
    accentColor: "gray",
    category: "system",
    defaultCapKey: "user_management",
    sortOrder: 100,
  },
};

export const DEPARTMENT_KEYS = Object.keys(DEPARTMENT_REGISTRY) as readonly string[];

export function getDepartmentMeta(key: string): DepartmentMeta | undefined {
  return DEPARTMENT_REGISTRY[key];
}
