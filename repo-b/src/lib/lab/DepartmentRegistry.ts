export type LabDepartmentKey =
  | "finance"
  | "crm"
  | "accounting"
  | "operations"
  | "projects"
  | "it"
  | "legal"
  | "hr"
  | "executive"
  | "documents"
  | "admin"
  | "waterfall"
  | "underwriting"
  | "reporting"
  | "compliance"
  | "content"
  | "rankings"
  | "analytics"
  | "pipeline"
  | "outreach"
  | "proposals"
  | "clients"
  | "authority"
  | "revenue";

export type LabDepartmentMeta = {
  key: LabDepartmentKey;
  label: string;
  description: string;
};

export const LAB_DEPARTMENTS: LabDepartmentMeta[] = [
  { key: "finance", label: "Finance", description: "Underwriting, REPE, and scenario analysis" },
  { key: "crm", label: "CRM", description: "Pipeline, contacts, and client activity" },
  { key: "accounting", label: "Accounting", description: "Books, AP/AR, and controls" },
  { key: "operations", label: "Operations", description: "Workflows, SOPs, and daily execution" },
  { key: "projects", label: "Projects", description: "Milestones, budget, and delivery" },
  { key: "it", label: "IT Tickets", description: "Requests, queue, and SLA" },
  { key: "legal", label: "Legal", description: "Contracts, obligations, and policy" },
  { key: "hr", label: "HR", description: "People operations and staffing" },
  { key: "executive", label: "Executive", description: "Company-level KPIs and risk" },
  { key: "documents", label: "Documents", description: "Files, versions, and access" },
  { key: "admin", label: "Admin", description: "Users, settings, and audit controls" },
  { key: "waterfall", label: "Waterfall", description: "Distribution waterfall modeling" },
  { key: "underwriting", label: "Underwriting", description: "Deal underwriting and analysis" },
  { key: "reporting", label: "Reporting", description: "Performance and BI reports" },
  { key: "compliance", label: "Compliance", description: "Regulatory compliance tracking" },
  { key: "content", label: "Content", description: "Content creation and publishing" },
  { key: "rankings", label: "Rankings", description: "Local and area rankings" },
  { key: "analytics", label: "Analytics", description: "Traffic and performance analytics" },
  { key: "pipeline", label: "Pipeline", description: "Deal pipeline and opportunity tracking" },
  { key: "outreach", label: "Outreach", description: "Lead generation and outreach management" },
  { key: "proposals", label: "Proposals", description: "Proposal creation and tracking" },
  { key: "clients", label: "Clients", description: "Client lifecycle and engagement tracking" },
  { key: "authority", label: "Authority", description: "Thought leadership and brand content" },
  { key: "revenue", label: "Revenue", description: "Revenue intelligence and forecasting" },
];

export const LAB_DEPARTMENT_BY_KEY: Record<LabDepartmentKey, LabDepartmentMeta> =
  LAB_DEPARTMENTS.reduce((acc, dept) => {
    acc[dept.key] = dept;
    return acc;
  }, {} as Record<LabDepartmentKey, LabDepartmentMeta>);

const INDUSTRY_DEPARTMENT_MAP: Record<string, LabDepartmentKey[]> = {
  ecc: ["executive", "accounting", "operations", "legal", "documents"],
  pds_command: ["projects", "operations", "accounting", "reporting", "legal", "documents", "crm", "compliance"],
  credit_risk_hub: ["finance", "crm", "compliance", "reporting", "legal", "documents"],
  legal_ops_command: ["legal", "documents", "compliance", "crm", "accounting", "reporting"],
  medical_office_backoffice: ["operations", "accounting", "crm", "projects", "legal", "documents", "compliance", "hr"],
  repe: ["finance", "underwriting", "waterfall", "accounting", "crm", "reporting", "compliance", "documents"],
  real_estate_pe: ["finance", "underwriting", "waterfall", "accounting", "crm", "reporting", "compliance", "documents"],
  floyorker: ["projects", "content", "rankings", "analytics", "crm", "accounting", "reporting", "documents"],
  digital_media: ["projects", "content", "rankings", "analytics", "crm", "accounting", "reporting", "documents"],
  legal: ["legal", "documents", "admin"],
  healthcare: ["operations", "documents", "hr", "accounting", "it", "executive"],
  dental: ["operations", "documents", "hr", "accounting", "it", "executive"],
  med_spa: ["operations", "documents", "crm", "accounting", "it", "executive"],
  real_estate: ["finance", "crm", "operations", "projects", "accounting", "legal", "documents"],
  construction: ["projects", "operations", "accounting", "legal", "documents"],
  accounting_firm: ["accounting", "documents", "admin", "crm"],
  insurance: ["crm", "operations", "legal", "documents"],
  logistics: ["operations", "projects", "accounting", "it"],
  manufacturing: ["operations", "projects", "accounting", "it"],
  retail: ["crm", "operations", "accounting", "projects"],
  restaurant: ["operations", "hr", "accounting", "documents"],
  saas: ["crm", "it", "projects", "executive", "accounting"],
  marketing_agency: ["crm", "projects", "executive", "accounting"],
  nonprofit: ["operations", "hr", "documents", "executive"],
  education: ["operations", "hr", "documents", "crm"],
  financial_services: ["accounting", "legal", "executive", "crm"],
  wealth_management: ["crm", "legal", "executive", "documents"],
  home_services: ["operations", "accounting", "crm", "projects"],
  it_msp: ["it", "operations", "executive", "crm"],
  recruiting: ["crm", "hr", "operations", "documents"],
  media: ["projects", "crm", "executive", "documents"],
  website: ["projects", "content", "rankings", "analytics", "crm", "accounting", "reporting", "documents"],
  consulting: ["pipeline", "outreach", "proposals", "clients", "authority", "revenue", "crm", "documents"],
};

const DEFAULT_DEPARTMENT_BY_INDUSTRY: Record<string, LabDepartmentKey> = {
  ecc: "executive",
  pds_command: "projects",
  credit_risk_hub: "finance",
  legal_ops_command: "legal",
  medical_office_backoffice: "operations",
  repe: "finance",
  real_estate_pe: "finance",
  floyorker: "content",
  digital_media: "content",
  legal: "legal",
  healthcare: "operations",
  dental: "operations",
  med_spa: "operations",
  real_estate: "finance",
  construction: "projects",
  accounting_firm: "accounting",
  insurance: "crm",
  logistics: "operations",
  manufacturing: "operations",
  retail: "crm",
  restaurant: "operations",
  saas: "executive",
  marketing_agency: "crm",
  nonprofit: "operations",
  education: "operations",
  financial_services: "executive",
  wealth_management: "executive",
  home_services: "operations",
  it_msp: "it",
  recruiting: "hr",
  media: "projects",
  website: "content",
  consulting: "pipeline",
};

const GENERAL_DEPARTMENTS: LabDepartmentKey[] = [
  "executive",
  "operations",
  "crm",
  "documents",
  "admin",
];

export function getEnabledDepartmentsForIndustry(industry?: string | null): LabDepartmentMeta[] {
  const keys = industry ? INDUSTRY_DEPARTMENT_MAP[industry] : undefined;
  const enabled = keys?.length ? keys : GENERAL_DEPARTMENTS;
  return enabled.map((key) => LAB_DEPARTMENT_BY_KEY[key]).filter(Boolean);
}

export function getDefaultDepartmentForIndustry(industry?: string | null): LabDepartmentKey {
  return (industry && DEFAULT_DEPARTMENT_BY_INDUSTRY[industry]) || "executive";
}
