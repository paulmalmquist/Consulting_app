/**
 * CapabilityRegistry.ts
 * Defines all capabilities per department with UI metadata.
 * The `sidebarGroup` field determines how capabilities are grouped in the sidebar.
 * The `kind` field determines which stub component renders the capability page.
 */

export type CapabilityKind =
  | "data_grid"
  | "dashboard"
  | "kanban"
  | "timeline"
  | "form"
  | "tree"
  | "document_view"
  | "history"
  | "action";

export interface CapabilityMeta {
  key: string;
  label: string;
  kind: CapabilityKind;
  icon: string;
  sidebarGroup: string;
  sortOrder: number;
  description?: string;
}

export const CAPABILITY_REGISTRY: Record<string, CapabilityMeta[]> = {
  // ── CRM ──────────────────────────────────────────────────────────────
  crm: [
    { key: "accounts", label: "Accounts", kind: "data_grid", icon: "building", sidebarGroup: "Pipeline", sortOrder: 10, description: "Manage customer accounts" },
    { key: "contacts", label: "Contacts", kind: "data_grid", icon: "user", sidebarGroup: "Pipeline", sortOrder: 20, description: "Track contacts and stakeholders" },
    { key: "leads", label: "Leads", kind: "kanban", icon: "target", sidebarGroup: "Pipeline", sortOrder: 30, description: "Lead capture and qualification" },
    { key: "opportunities", label: "Opportunities", kind: "kanban", icon: "trending-up", sidebarGroup: "Pipeline", sortOrder: 40, description: "Revenue pipeline tracking" },
    { key: "activities", label: "Activities", kind: "data_grid", icon: "activity", sidebarGroup: "Engagement", sortOrder: 50, description: "Calls, meetings, and emails" },
    { key: "tasks", label: "Tasks", kind: "kanban", icon: "check-square", sidebarGroup: "Engagement", sortOrder: 60, description: "Follow-ups and action items" },
    { key: "campaigns", label: "Campaigns", kind: "data_grid", icon: "megaphone", sidebarGroup: "Marketing", sortOrder: 70, description: "Campaign management and tracking" },
    { key: "products", label: "Products", kind: "data_grid", icon: "box", sidebarGroup: "Catalog", sortOrder: 80, description: "Product and pricing catalog" },
    { key: "forecast", label: "Forecast", kind: "dashboard", icon: "bar-chart", sidebarGroup: "Analytics", sortOrder: 90, description: "Revenue forecasting" },
    { key: "reports", label: "Reports", kind: "dashboard", icon: "pie-chart", sidebarGroup: "Analytics", sortOrder: 100, description: "CRM analytics and reports" },
  ],

  // ── Accounting ───────────────────────────────────────────────────────
  accounting: [
    { key: "chart_of_accounts", label: "Chart of Accounts", kind: "tree", icon: "list", sidebarGroup: "Ledger", sortOrder: 10, description: "Account hierarchy and structure" },
    { key: "journal_entries", label: "Journal Entries", kind: "data_grid", icon: "edit", sidebarGroup: "Ledger", sortOrder: 20, description: "Manual and automated journal entries" },
    { key: "ledger", label: "General Ledger", kind: "data_grid", icon: "book", sidebarGroup: "Ledger", sortOrder: 30, description: "Full general ledger view" },
    { key: "ar", label: "Accounts Receivable", kind: "data_grid", icon: "arrow-down-left", sidebarGroup: "Receivables & Payables", sortOrder: 40, description: "Customer invoices and collections" },
    { key: "ap", label: "Accounts Payable", kind: "data_grid", icon: "arrow-up-right", sidebarGroup: "Receivables & Payables", sortOrder: 50, description: "Vendor bills and payments" },
    { key: "vendors", label: "Vendors", kind: "data_grid", icon: "truck", sidebarGroup: "Receivables & Payables", sortOrder: 55, description: "Vendor master list" },
    { key: "invoices", label: "Invoices", kind: "data_grid", icon: "file-text", sidebarGroup: "Receivables & Payables", sortOrder: 60, description: "Invoice management" },
    { key: "payments", label: "Payments", kind: "data_grid", icon: "credit-card", sidebarGroup: "Receivables & Payables", sortOrder: 70, description: "Payment processing and tracking" },
    { key: "reconciliations", label: "Reconciliations", kind: "data_grid", icon: "check-circle", sidebarGroup: "Close", sortOrder: 80, description: "Bank and account reconciliations" },
    { key: "budgets", label: "Budgets", kind: "dashboard", icon: "target", sidebarGroup: "Planning", sortOrder: 85, description: "Budget creation and variance analysis" },
    { key: "financial_statements", label: "Financial Statements", kind: "dashboard", icon: "bar-chart", sidebarGroup: "Reports", sortOrder: 90, description: "Income statement, balance sheet, cash flow" },
    { key: "controls", label: "Controls", kind: "data_grid", icon: "shield", sidebarGroup: "Compliance", sortOrder: 95, description: "Internal controls and SOX compliance" },
    { key: "audit_log", label: "Audit Log", kind: "history", icon: "clock", sidebarGroup: "Compliance", sortOrder: 100, description: "Financial audit trail" },
  ],

  // ── Operations ───────────────────────────────────────────────────────
  operations: [
    { key: "workflows", label: "Workflows", kind: "kanban", icon: "git-branch", sidebarGroup: "Process", sortOrder: 10, description: "Operational workflow management" },
    { key: "sop_library", label: "SOP Library", kind: "data_grid", icon: "book-open", sidebarGroup: "Process", sortOrder: 20, description: "Standard operating procedures" },
    { key: "task_boards", label: "Task Boards", kind: "kanban", icon: "layout", sidebarGroup: "Execution", sortOrder: 30, description: "Operational task tracking" },
    { key: "kpi_dashboard", label: "KPI Dashboard", kind: "dashboard", icon: "activity", sidebarGroup: "Metrics", sortOrder: 40, description: "Key performance indicators" },
    { key: "vendor_tracker", label: "Vendor Tracker", kind: "data_grid", icon: "truck", sidebarGroup: "Supply Chain", sortOrder: 50, description: "Vendor performance and compliance" },
    { key: "inventory", label: "Inventory", kind: "data_grid", icon: "package", sidebarGroup: "Supply Chain", sortOrder: 60, description: "Inventory levels and management" },
    { key: "milestones", label: "Milestones", kind: "timeline", icon: "flag", sidebarGroup: "Tracking", sortOrder: 70, description: "Operational milestones" },
    { key: "automation_engine", label: "Automation Engine", kind: "data_grid", icon: "zap", sidebarGroup: "Automation", sortOrder: 80, description: "Rules and automated workflows" },
  ],

  // ── Projects ─────────────────────────────────────────────────────────
  projects: [
    { key: "active_projects", label: "Active Projects", kind: "data_grid", icon: "folder", sidebarGroup: "Portfolio", sortOrder: 10, description: "All active project list" },
    { key: "gantt", label: "Gantt", kind: "timeline", icon: "calendar", sidebarGroup: "Planning", sortOrder: 20, description: "Project Gantt chart" },
    { key: "milestones", label: "Milestones", kind: "timeline", icon: "flag", sidebarGroup: "Planning", sortOrder: 30, description: "Key project milestones" },
    { key: "budget_tracking", label: "Budget Tracking", kind: "dashboard", icon: "dollar-sign", sidebarGroup: "Financials", sortOrder: 40, description: "Project budget vs actuals" },
    { key: "issues", label: "Issues", kind: "kanban", icon: "alert-circle", sidebarGroup: "Execution", sortOrder: 50, description: "Issue tracking and resolution" },
    { key: "resource_allocation", label: "Resource Allocation", kind: "dashboard", icon: "users", sidebarGroup: "Resources", sortOrder: 60, description: "Team and resource assignment" },
    { key: "change_orders", label: "Change Orders", kind: "data_grid", icon: "edit-3", sidebarGroup: "Controls", sortOrder: 70, description: "Scope and change management" },
    { key: "reports", label: "Reports", kind: "dashboard", icon: "pie-chart", sidebarGroup: "Analytics", sortOrder: 80, description: "Project analytics and status" },
  ],

  // ── IT ───────────────────────────────────────────────────────────────
  it: [
    { key: "ticket_queue", label: "Ticket Queue", kind: "kanban", icon: "inbox", sidebarGroup: "Service Desk", sortOrder: 10, description: "Support ticket management" },
    { key: "create_ticket", label: "Create Ticket", kind: "form", icon: "plus-circle", sidebarGroup: "Service Desk", sortOrder: 20, description: "Submit a new support request" },
    { key: "sla_dashboard", label: "SLA Dashboard", kind: "dashboard", icon: "clock", sidebarGroup: "Service Desk", sortOrder: 30, description: "SLA compliance and metrics" },
    { key: "knowledge_base", label: "Knowledge Base", kind: "data_grid", icon: "book", sidebarGroup: "Resources", sortOrder: 40, description: "Technical articles and guides" },
    { key: "assets", label: "Assets", kind: "data_grid", icon: "monitor", sidebarGroup: "Resources", sortOrder: 50, description: "IT asset inventory" },
    { key: "change_requests", label: "Change Requests", kind: "data_grid", icon: "git-pull-request", sidebarGroup: "Change Management", sortOrder: 60, description: "Change advisory board queue" },
    { key: "incidents", label: "Incidents", kind: "kanban", icon: "alert-triangle", sidebarGroup: "Change Management", sortOrder: 70, description: "Incident response and tracking" },
    { key: "automation_rules", label: "Automation Rules", kind: "data_grid", icon: "zap", sidebarGroup: "Automation", sortOrder: 80, description: "Automated ticket routing and escalation" },
    { key: "metrics", label: "Metrics", kind: "dashboard", icon: "bar-chart-2", sidebarGroup: "Analytics", sortOrder: 90, description: "IT performance metrics" },
  ],

  // ── Legal ────────────────────────────────────────────────────────────
  legal: [
    { key: "contracts", label: "Contracts", kind: "data_grid", icon: "file-text", sidebarGroup: "Contract Management", sortOrder: 10, description: "Active contracts and agreements" },
    { key: "obligations", label: "Obligations", kind: "data_grid", icon: "check-square", sidebarGroup: "Contract Management", sortOrder: 20, description: "Contractual obligation tracking" },
    { key: "renewals", label: "Renewals", kind: "data_grid", icon: "refresh-cw", sidebarGroup: "Contract Management", sortOrder: 30, description: "Upcoming contract renewals" },
    { key: "regulatory_requirements", label: "Regulatory Requirements", kind: "data_grid", icon: "book-open", sidebarGroup: "Compliance", sortOrder: 40, description: "Regulatory framework tracking" },
    { key: "policies", label: "Policies", kind: "data_grid", icon: "file", sidebarGroup: "Compliance", sortOrder: 50, description: "Corporate policies and procedures" },
    { key: "risk_register", label: "Risk Register", kind: "data_grid", icon: "alert-triangle", sidebarGroup: "Risk", sortOrder: 60, description: "Enterprise risk registry" },
    { key: "evidence_requests", label: "Evidence Requests", kind: "kanban", icon: "search", sidebarGroup: "Audit", sortOrder: 70, description: "Audit evidence collection" },
    { key: "compliance_tests", label: "Compliance Tests", kind: "data_grid", icon: "check-circle", sidebarGroup: "Audit", sortOrder: 80, description: "Compliance test results" },
    { key: "attestations", label: "Attestations", kind: "data_grid", icon: "award", sidebarGroup: "Audit", sortOrder: 90, description: "Compliance attestation records" },
  ],

  // ── HR ───────────────────────────────────────────────────────────────
  hr: [
    { key: "employees", label: "Employees", kind: "data_grid", icon: "users", sidebarGroup: "People", sortOrder: 10, description: "Employee directory and records" },
    { key: "roles", label: "Roles", kind: "data_grid", icon: "briefcase", sidebarGroup: "People", sortOrder: 20, description: "Job roles and descriptions" },
    { key: "compensation", label: "Compensation", kind: "data_grid", icon: "dollar-sign", sidebarGroup: "People", sortOrder: 30, description: "Salary and compensation management" },
    { key: "performance_reviews", label: "Performance Reviews", kind: "data_grid", icon: "star", sidebarGroup: "Development", sortOrder: 40, description: "Performance review cycles" },
    { key: "time_off", label: "Time Off", kind: "data_grid", icon: "calendar", sidebarGroup: "Development", sortOrder: 50, description: "PTO, leave, and attendance" },
    { key: "recruiting", label: "Recruiting", kind: "kanban", icon: "user-plus", sidebarGroup: "Talent", sortOrder: 60, description: "Applicant tracking and hiring" },
    { key: "onboarding", label: "Onboarding", kind: "kanban", icon: "log-in", sidebarGroup: "Talent", sortOrder: 70, description: "New hire onboarding workflows" },
    { key: "training", label: "Training", kind: "data_grid", icon: "book", sidebarGroup: "Learning", sortOrder: 80, description: "Training programs and certifications" },
    { key: "org_chart", label: "Org Chart", kind: "tree", icon: "git-merge", sidebarGroup: "Structure", sortOrder: 90, description: "Organizational hierarchy" },
  ],

  // ── Executive ────────────────────────────────────────────────────────
  executive: [
    { key: "revenue_summary", label: "Revenue Summary", kind: "dashboard", icon: "trending-up", sidebarGroup: "Financial", sortOrder: 10, description: "Revenue trends and breakdown" },
    { key: "cash_position", label: "Cash Position", kind: "dashboard", icon: "dollar-sign", sidebarGroup: "Financial", sortOrder: 20, description: "Cash flow and liquidity" },
    { key: "risk_heatmap", label: "Risk Heatmap", kind: "dashboard", icon: "alert-triangle", sidebarGroup: "Risk & Compliance", sortOrder: 30, description: "Enterprise risk visualization" },
    { key: "compliance_status", label: "Compliance Status", kind: "dashboard", icon: "shield", sidebarGroup: "Risk & Compliance", sortOrder: 40, description: "Cross-department compliance posture" },
    { key: "sla_performance", label: "SLA Performance", kind: "dashboard", icon: "clock", sidebarGroup: "Operations", sortOrder: 50, description: "Service-level agreement tracking" },
    { key: "project_health", label: "Project Health", kind: "dashboard", icon: "heart", sidebarGroup: "Operations", sortOrder: 60, description: "Portfolio health summary" },
    { key: "ai_insights", label: "AI Insights", kind: "dashboard", icon: "cpu", sidebarGroup: "Intelligence", sortOrder: 70, description: "AI-generated business insights" },
  ],

  // ── Documents ────────────────────────────────────────────────────────
  documents: [
    { key: "document_library", label: "Document Library", kind: "data_grid", icon: "folder", sidebarGroup: "Library", sortOrder: 10, description: "All documents across departments" },
    { key: "uploads", label: "Uploads", kind: "form", icon: "upload", sidebarGroup: "Library", sortOrder: 20, description: "Upload new documents" },
    { key: "versions", label: "Versions", kind: "data_grid", icon: "git-commit", sidebarGroup: "Management", sortOrder: 30, description: "Document version history" },
    { key: "categories", label: "Categories", kind: "tree", icon: "tag", sidebarGroup: "Management", sortOrder: 40, description: "Document categorization" },
    { key: "permissions", label: "Permissions", kind: "data_grid", icon: "lock", sidebarGroup: "Access", sortOrder: 50, description: "Document access control" },
  ],

  // ── Admin ────────────────────────────────────────────────────────────
  admin: [
    { key: "user_management", label: "User Management", kind: "data_grid", icon: "users", sidebarGroup: "Identity", sortOrder: 10, description: "Manage user accounts" },
    { key: "role_management", label: "Role Management", kind: "data_grid", icon: "shield", sidebarGroup: "Identity", sortOrder: 20, description: "Define roles and permissions" },
    { key: "department_config", label: "Department Config", kind: "data_grid", icon: "settings", sidebarGroup: "Configuration", sortOrder: 30, description: "Enable and configure departments" },
    { key: "capability_config", label: "Capability Config", kind: "data_grid", icon: "sliders", sidebarGroup: "Configuration", sortOrder: 40, description: "Configure department capabilities" },
    { key: "audit_logs", label: "Audit Logs", kind: "history", icon: "clock", sidebarGroup: "Monitoring", sortOrder: 50, description: "System-wide audit trail" },
    { key: "environment_settings", label: "Environment Settings", kind: "form", icon: "server", sidebarGroup: "System", sortOrder: 60, description: "Environment configuration" },
  ],
};

/** Flatten all department/capability pairs for Next.js generateStaticParams */
export function getCapabilityParams() {
  return Object.entries(CAPABILITY_REGISTRY).flatMap(([deptKey, caps]) =>
    caps.map((cap) => ({ deptKey, capKey: cap.key }))
  );
}

/** Get all capabilities for a department */
export function getCapabilitiesForDept(deptKey: string): CapabilityMeta[] {
  return CAPABILITY_REGISTRY[deptKey] || [];
}

/** Get a single capability's metadata */
export function getCapabilityMeta(deptKey: string, capKey: string): CapabilityMeta | undefined {
  return (CAPABILITY_REGISTRY[deptKey] || []).find((c) => c.key === capKey);
}

/** Group capabilities by sidebarGroup for sidebar rendering */
export function getGroupedCapabilities(deptKey: string): Record<string, CapabilityMeta[]> {
  const caps = CAPABILITY_REGISTRY[deptKey] || [];
  const groups: Record<string, CapabilityMeta[]> = {};
  for (const cap of caps) {
    if (!groups[cap.sidebarGroup]) groups[cap.sidebarGroup] = [];
    groups[cap.sidebarGroup].push(cap);
  }
  return groups;
}
