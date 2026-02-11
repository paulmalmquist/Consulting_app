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
    { key: "accounts", label: "Accounts", description: "Manage account records and segmentation.", category: "Data" },
    { key: "contacts", label: "Contacts", description: "Track stakeholders and relationship history.", category: "Data" },
    { key: "leads", label: "Leads", description: "Triage inbound opportunities and qualification.", category: "Workflows" },
    { key: "opportunities", label: "Opportunities", description: "Pipeline tracking and conversion stages.", category: "Workflows" },
    { key: "activities", label: "Activities", description: "Calls, meetings, and task timelines.", category: "Workflows" },
    { key: "tasks", label: "Tasks", description: "Follow-ups and owner assignments.", category: "Workflows" },
    { key: "reports", label: "Reports", description: "Performance and conversion dashboards.", category: "Reports" },
  ],
  accounting: [
    { key: "chart_of_accounts", label: "Chart of Accounts", description: "Account structure and mappings.", category: "Data" },
    { key: "journal_entries", label: "Journal Entries", description: "Post and review accounting entries.", category: "Workflows" },
    { key: "ledger", label: "Ledger", description: "General ledger activity and balances.", category: "Data" },
    { key: "ap", label: "AP", description: "Accounts payable workflows and approvals.", category: "Workflows" },
    { key: "ar", label: "AR", description: "Accounts receivable aging and collections.", category: "Workflows" },
    { key: "reconciliations", label: "Reconciliations", description: "Bank and account reconciliation tasks.", category: "Workflows" },
    { key: "statements", label: "Statements", description: "Financial statements and period closes.", category: "Reports" },
    { key: "controls", label: "Controls", description: "Internal controls and policy checks.", category: "Admin" },
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
    { key: "obligations", label: "Obligations", description: "Deliverables and legal commitments.", category: "Workflows" },
    { key: "renewals", label: "Renewals", description: "Upcoming renewals and notice windows.", category: "Workflows" },
    { key: "policies", label: "Policies", description: "Policy source-of-truth and reviews.", category: "Data" },
    { key: "risk_register", label: "Risk Register", description: "Legal risk inventory and owners.", category: "Reports" },
    { key: "evidence_requests", label: "Evidence Requests", description: "Audit evidence requests and status.", category: "Workflows" },
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
