import type { LabDepartmentKey } from "./DepartmentRegistry";

export type LabCapabilityMeta = {
  key: string;
  label: string;
  description: string;
};

export const LAB_CAPABILITIES_BY_DEPARTMENT: Record<LabDepartmentKey, LabCapabilityMeta[]> = {
  crm: [
    { key: "accounts", label: "Accounts", description: "Manage account records and segmentation." },
    { key: "contacts", label: "Contacts", description: "Track stakeholders and relationship history." },
    { key: "leads", label: "Leads", description: "Triage inbound opportunities and qualification." },
    { key: "opportunities", label: "Opportunities", description: "Pipeline tracking and conversion stages." },
    { key: "activities", label: "Activities", description: "Calls, meetings, and task timelines." },
    { key: "tasks", label: "Tasks", description: "Follow-ups and owner assignments." },
    { key: "reports", label: "Reports", description: "Performance and conversion dashboards." },
  ],
  accounting: [
    { key: "chart_of_accounts", label: "Chart of Accounts", description: "Account structure and mappings." },
    { key: "journal_entries", label: "Journal Entries", description: "Post and review accounting entries." },
    { key: "ledger", label: "Ledger", description: "General ledger activity and balances." },
    { key: "ap", label: "AP", description: "Accounts payable workflows and approvals." },
    { key: "ar", label: "AR", description: "Accounts receivable aging and collections." },
    { key: "reconciliations", label: "Reconciliations", description: "Bank and account reconciliation tasks." },
    { key: "statements", label: "Statements", description: "Financial statements and period closes." },
    { key: "controls", label: "Controls", description: "Internal controls and policy checks." },
  ],
  operations: [
    { key: "workflows", label: "Workflows", description: "Core operational pipelines." },
    { key: "sop_library", label: "SOP Library", description: "Standard operating procedures and playbooks." },
    { key: "kpis", label: "KPIs", description: "Operational KPI tracking." },
    { key: "vendors", label: "Vendors", description: "Vendor records and obligations." },
    { key: "inventory", label: "Inventory", description: "Stock, reorder points, and cycle counts." },
    { key: "automation", label: "Automation", description: "Automations and manual override controls." },
  ],
  projects: [
    { key: "active_projects", label: "Active Projects", description: "Project portfolio and owners." },
    { key: "milestones", label: "Milestones", description: "Timeline and milestone progress." },
    { key: "gantt", label: "Gantt", description: "Schedule view and dependencies." },
    { key: "budget", label: "Budget", description: "Project budget and burn tracking." },
    { key: "issues", label: "Issues", description: "Risks and blockers." },
    { key: "reports", label: "Reports", description: "Project reporting and health summaries." },
  ],
  it: [
    { key: "tickets", label: "Tickets", description: "Support ticket queue and triage." },
    { key: "queue", label: "Queue", description: "Human-in-the-loop approvals queue." },
    { key: "sla", label: "SLA", description: "SLA windows and breach monitoring." },
    { key: "knowledge_base", label: "Knowledge Base", description: "Support guides and runbooks." },
    { key: "assets", label: "Assets", description: "Hardware and software asset inventory." },
    { key: "changes", label: "Changes", description: "Change requests and approvals." },
  ],
  legal: [
    { key: "contracts", label: "Contracts", description: "Contract lifecycle and obligations." },
    { key: "obligations", label: "Obligations", description: "Deliverables and legal commitments." },
    { key: "renewals", label: "Renewals", description: "Upcoming renewals and notice windows." },
    { key: "policies", label: "Policies", description: "Policy source-of-truth and reviews." },
    { key: "risk_register", label: "Risk Register", description: "Legal risk inventory and owners." },
    { key: "evidence_requests", label: "Evidence Requests", description: "Audit evidence requests and status." },
  ],
  hr: [
    { key: "headcount", label: "Headcount", description: "Org structure and hiring plan." },
    { key: "recruiting", label: "Recruiting", description: "Candidate pipeline and stages." },
    { key: "onboarding", label: "Onboarding", description: "Onboarding process tracking." },
    { key: "policies", label: "Policies", description: "People policy acknowledgements." },
    { key: "performance", label: "Performance", description: "Reviews and development plans." },
    { key: "time_off", label: "Time Off", description: "Leave balances and approvals." },
  ],
  executive: [
    { key: "overview", label: "Overview", description: "Executive summary and operational pulse." },
    { key: "metrics", label: "Metrics", description: "KPI dashboard and throughput metrics." },
    { key: "revenue", label: "Revenue", description: "Revenue trend and funnel health." },
    { key: "cash", label: "Cash", description: "Cash flow and runway indicators." },
    { key: "risk", label: "Risk", description: "Cross-functional risk landscape." },
    { key: "compliance", label: "Compliance", description: "Compliance posture and controls." },
    { key: "project_health", label: "Project Health", description: "Portfolio status and delivery confidence." },
  ],
  documents: [
    { key: "library", label: "Library", description: "Document library and search." },
    { key: "uploads", label: "Uploads", description: "New uploads and processing status." },
    { key: "versions", label: "Versions", description: "Version history and rollbacks." },
    { key: "permissions", label: "Permissions", description: "Document access and policies." },
  ],
  admin: [
    { key: "users", label: "Users", description: "User management and invitations." },
    { key: "roles", label: "Roles", description: "Role-based access controls." },
    { key: "settings", label: "Settings", description: "Global configuration knobs." },
    { key: "audit_logs", label: "Audit Logs", description: "Administrative audit events." },
  ],
};

export function getCapabilitiesForDepartment(deptKey: LabDepartmentKey): LabCapabilityMeta[] {
  return LAB_CAPABILITIES_BY_DEPARTMENT[deptKey] || [];
}

export function getCapabilityByKey(deptKey: LabDepartmentKey, capKey: string) {
  return getCapabilitiesForDepartment(deptKey).find((cap) => cap.key === capKey) || null;
}
