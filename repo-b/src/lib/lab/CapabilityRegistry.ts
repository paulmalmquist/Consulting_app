import type { LabDepartmentKey } from "./DepartmentRegistry";
import { getIndustryTemplate } from "./IndustryTemplateRegistry";

export type LabCapabilityCategory = "Data" | "Workflows" | "Reports" | "Admin";

export type LabCapabilityMeta = {
  key: string;
  label: string;
  description: string;
  category: LabCapabilityCategory;
};

const BASE_CAPABILITIES_BY_DEPARTMENT: Record<LabDepartmentKey, LabCapabilityMeta[]> = {
  crm: [
    { key: "companies", label: "Companies", description: "Manage company records, firmographics, and outreach cadence.", category: "Data" },
    { key: "contacts", label: "Contacts", description: "Track people, roles, emails, and relationship history.", category: "Data" },
    { key: "interactions", label: "Interactions", description: "Log calls, emails, meetings, and outreach history.", category: "Workflows" },
    { key: "notes", label: "Notes", description: "Free-form notes linked to companies and contacts.", category: "Data" },
    { key: "tasks", label: "Tasks", description: "Follow-ups, reminders, and owner assignments.", category: "Workflows" },
    { key: "segments", label: "Segments", description: "Tags and segmentation for targeting and filtering.", category: "Data" },
  ],
  accounting: [
    { key: "general-ledger", label: "General Ledger", description: "General ledger activity and balances.", category: "Data" },
    { key: "journal-entries", label: "Journal Entries", description: "Post and review accounting entries.", category: "Workflows" },
    { key: "accounts-payable", label: "Accounts Payable", description: "Bills, approvals, and outbound payments.", category: "Workflows" },
    { key: "accounts-receivable", label: "Accounts Receivable", description: "Invoices, collections, and aging.", category: "Workflows" },
    { key: "vendor-management", label: "Vendor Management", description: "Vendor records, controls, and onboarding.", category: "Data" },
    { key: "reporting", label: "Reporting", description: "P&L, balance sheet, and period-close views.", category: "Reports" },
    { key: "audit-log", label: "Audit Log", description: "Accounting change history and attestations.", category: "Admin" },
  ],
  operations: [
    { key: "workflows", label: "Workflows", description: "Core operational pipelines.", category: "Workflows" },
    { key: "sop_library", label: "SOP Library", description: "Standard operating procedures and playbooks.", category: "Data" },
    { key: "kpis", label: "KPIs", description: "Operational KPI tracking.", category: "Reports" },
    { key: "vendors", label: "Vendors", description: "Vendor records and obligations.", category: "Data" },
    { key: "inventory", label: "Inventory", description: "Stock, reorder points, and cycle counts.", category: "Data" },
    { key: "automation", label: "Automation", description: "Automations and manual override controls.", category: "Admin" },
  ],
  projects: [
    { key: "active_projects", label: "Active Projects", description: "Project portfolio and owners.", category: "Data" },
    { key: "milestones", label: "Milestones", description: "Timeline and milestone progress.", category: "Workflows" },
    { key: "gantt", label: "Gantt", description: "Schedule view and dependencies.", category: "Reports" },
    { key: "budget", label: "Budget", description: "Project budget and burn tracking.", category: "Reports" },
    { key: "issues", label: "Issues", description: "Risks and blockers.", category: "Workflows" },
    { key: "reports", label: "Reports", description: "Project reporting and health summaries.", category: "Reports" },
  ],
  it: [
    { key: "tickets", label: "Tickets", description: "Support ticket queue and triage.", category: "Workflows" },
    { key: "queue", label: "Queue", description: "Human-in-the-loop approvals queue.", category: "Workflows" },
    { key: "sla", label: "SLA", description: "SLA windows and breach monitoring.", category: "Reports" },
    { key: "knowledge_base", label: "Knowledge Base", description: "Support guides and runbooks.", category: "Data" },
    { key: "assets", label: "Assets", description: "Hardware and software asset inventory.", category: "Data" },
    { key: "changes", label: "Changes", description: "Change requests and approvals.", category: "Admin" },
  ],
  legal: [
    { key: "contracts", label: "Contracts", description: "Contract lifecycle and obligations.", category: "Workflows" },
    { key: "matters", label: "Matters", description: "Legal matters, cases, and proceedings.", category: "Workflows" },
    { key: "compliance", label: "Compliance", description: "Regulatory compliance tracking and assessments.", category: "Reports" },
    { key: "entities", label: "Entities", description: "Corporate entities, registrations, and governance.", category: "Data" },
    { key: "policy-library", label: "Policy Library", description: "Policy source-of-truth, reviews, and acknowledgements.", category: "Data" },
  ],
  hr: [
    { key: "headcount", label: "Headcount", description: "Org structure and hiring plan.", category: "Reports" },
    { key: "recruiting", label: "Recruiting", description: "Candidate pipeline and stages.", category: "Workflows" },
    { key: "onboarding", label: "Onboarding", description: "Onboarding process tracking.", category: "Workflows" },
    { key: "policies", label: "Policies", description: "People policy acknowledgements.", category: "Data" },
    { key: "performance", label: "Performance", description: "Reviews and development plans.", category: "Reports" },
    { key: "time_off", label: "Time Off", description: "Leave balances and approvals.", category: "Workflows" },
  ],
  executive: [
    { key: "overview", label: "Overview", description: "Executive summary and operational pulse.", category: "Reports" },
    { key: "metrics", label: "Metrics", description: "KPI dashboard and throughput metrics.", category: "Reports" },
    { key: "revenue", label: "Revenue", description: "Revenue trend and funnel health.", category: "Reports" },
    { key: "cash", label: "Cash", description: "Cash flow and runway indicators.", category: "Reports" },
    { key: "risk", label: "Risk", description: "Cross-functional risk landscape.", category: "Reports" },
    { key: "compliance", label: "Compliance", description: "Compliance posture and controls.", category: "Admin" },
    { key: "project_health", label: "Project Health", description: "Portfolio status and delivery confidence.", category: "Reports" },
  ],
  documents: [
    { key: "library", label: "Library", description: "Document library and search.", category: "Data" },
    { key: "uploads", label: "Uploads", description: "New uploads and processing status.", category: "Workflows" },
    { key: "versions", label: "Versions", description: "Version history and rollbacks.", category: "Data" },
    { key: "permissions", label: "Permissions", description: "Document access and policies.", category: "Admin" },
  ],
  admin: [
    { key: "users", label: "Users", description: "User management and invitations.", category: "Admin" },
    { key: "roles", label: "Roles", description: "Role-based access controls.", category: "Admin" },
    { key: "settings", label: "Settings", description: "Global configuration knobs.", category: "Admin" },
    { key: "audit_logs", label: "Audit Logs", description: "Administrative audit events.", category: "Reports" },
  ],
};

function ensureOverview(deptKey: LabDepartmentKey, capabilities: LabCapabilityMeta[]): LabCapabilityMeta[] {
  if (capabilities.some((cap) => cap.key === "overview")) return capabilities;

  return [
    {
      key: "overview",
      label: "Overview",
      description: `Summary view for ${deptKey} operations and status.`,
      category: "Reports",
    },
    ...capabilities,
  ];
}

export function getCapabilitiesForDepartment(
  deptKey: LabDepartmentKey,
  options?: { industry?: string | null }
): LabCapabilityMeta[] {
  const base = BASE_CAPABILITIES_BY_DEPARTMENT[deptKey] || [];
  const withOverview = ensureOverview(deptKey, base);

  if (!options?.industry) return withOverview;

  const template = getIndustryTemplate(options.industry);
  const hidden = template.hiddenCapabilities?.[deptKey] || [];
  if (!hidden.length) return withOverview;

  return withOverview.filter((cap) => !hidden.includes(cap.key));
}

export function getCapabilityByKey(
  deptKey: LabDepartmentKey,
  capKey: string,
  options?: { industry?: string | null }
) {
  return getCapabilitiesForDepartment(deptKey, options).find((cap) => cap.key === capKey) || null;
}

export function groupCapabilities(capabilities: LabCapabilityMeta[]) {
  const groups: Record<LabCapabilityCategory, LabCapabilityMeta[]> = {
    Data: [],
    Workflows: [],
    Reports: [],
    Admin: [],
  };

  for (const capability of capabilities) {
    groups[capability.category].push(capability);
  }

  return groups;
}
