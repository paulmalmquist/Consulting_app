export interface PdsProjectListItem {
  project_id: string;
  env_id: string;
  business_id: string;
  program_id: string | null;
  name: string;
  project_code: string | null;
  description: string | null;
  sector: string | null;
  project_type: string | null;
  stage: string;
  status: string;
  project_manager: string | null;
  start_date: string | null;
  target_end_date: string | null;
  approved_budget: string;
  committed_amount: string;
  spent_amount: string;
  forecast_at_completion: string;
  contingency_budget: string;
  contingency_remaining: string;
  pending_change_order_amount: string;
  next_milestone_date: string | null;
  risk_score: string;
  currency_code: string;
  created_at: string;
  updated_at: string;
}

export type PdsProject = PdsProjectListItem;

export interface PdsBudgetLine {
  budget_line_id: string;
  budget_version_id: string;
  cost_code: string;
  line_label: string;
  approved_amount: string;
  committed_amount?: string;
  invoiced_amount?: string;
  paid_amount?: string;
}

export interface PdsBudgetSummary {
  approved_budget: string;
  committed_amount: string;
  spent_amount: string;
  forecast_at_completion: string;
  contingency_budget: string;
  contingency_remaining: string;
  pending_change_order_amount: string;
  variance: string;
  budget_used_ratio: string | number;
}

export interface PdsScheduleItem {
  milestone_id: string;
  milestone_name: string;
  baseline_date: string | null;
  current_date: string | null;
  actual_date: string | null;
  slip_reason: string | null;
  is_critical: boolean;
  created_at: string;
}

export interface PdsChangeOrder {
  change_order_id: string;
  project_id: string;
  change_order_ref: string;
  status: string;
  amount_impact: string;
  schedule_impact_days: number;
  approval_required: boolean;
  approved_at: string | null;
  created_at: string;
}

export interface PdsRfi {
  rfi_id: string;
  project_id: string;
  rfi_number: string;
  subject: string;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  priority: string;
  response_text: string | null;
  responded_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PdsSubmittal {
  submittal_id: string;
  project_id: string;
  vendor_id: string | null;
  vendor_name?: string | null;
  submittal_number: string;
  description: string | null;
  spec_section: string | null;
  required_date: string | null;
  submitted_date: string | null;
  reviewed_date: string | null;
  review_notes: string | null;
  status: string;
  created_at: string;
}

export interface PdsSiteReport {
  site_report_id: string;
  project_id: string;
  report_date: string;
  summary: string | null;
  blockers: string | null;
  weather: string | null;
  temperature_high: number | null;
  temperature_low: number | null;
  workers_on_site: number;
  work_performed: string | null;
  delays: string | null;
  safety_incidents: string | null;
  created_at: string;
}

export interface PdsPunchItem {
  punch_item_id: string;
  project_id: string;
  title: string;
  status: string;
  assignee: string | null;
  due_date: string | null;
  created_at: string;
}

export interface PdsDocument {
  pds_document_id: string;
  project_id: string;
  rfi_id: string | null;
  submittal_id: string | null;
  title: string;
  document_type: string;
  version_label: string | null;
  storage_key: string | null;
  status: string;
  created_at: string;
}

export interface PdsVendor {
  vendor_id: string;
  env_id: string;
  business_id: string;
  vendor_name: string;
  trade: string | null;
  license_number: string | null;
  insurance_expiry: string | null;
  contact_name: string | null;
  contact_email: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PdsProjectOverview {
  project: PdsProjectListItem;
  budget: PdsBudgetSummary;
  schedule: {
    schedule_health: string;
    total_slip_days: number;
    critical_flags: number;
    next_milestone_date: string | null;
    items: PdsScheduleItem[];
  };
  counts: {
    open_risks: number;
    high_risks: number;
    open_change_orders: number;
    pending_change_orders: number;
    open_rfis: number;
    overdue_rfis: number;
    site_report_count: number;
    team_size: number;
  };
  recent_activity: Array<{
    type: string;
    label: string | null;
    status: string | null;
    created_at: string | null;
  }>;
}

export interface PdsProjectDetail extends PdsProjectOverview {
  budget_detail?: {
    versions: Array<Record<string, unknown>>;
    lines: PdsBudgetLine[];
    revisions: Array<Record<string, unknown>>;
    commitments: Array<Record<string, unknown>>;
    invoices: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
    forecasts: Array<Record<string, unknown>>;
    change_orders: PdsChangeOrder[];
  };
}

export interface PdsPortfolioKpis {
  env_id: string;
  business_id: string;
  period: string;
  approved_budget: string;
  committed: string;
  spent: string;
  eac: string;
  variance: string;
  contingency_remaining: string;
  open_change_order_count: number;
  pending_approval_count: number;
  top_risk_count: number;
}

export interface PdsPortfolioDashboard {
  period: string;
  kpis: PdsPortfolioKpis & {
    active_project_count: number;
    project_count: number;
    projects_on_budget_pct: string | number;
    projects_on_schedule_pct: string | number;
    budget_used_ratio: string | number;
  };
  projects: Array<{
    project_id: string;
    name: string;
    project_code: string | null;
    sector: string | null;
    stage: string;
    status: string;
    project_manager: string | null;
    schedule_health: string;
    total_slip_days: number;
    budget_variance: string;
    budget_used_ratio: string | number;
    open_rfis: number;
    open_risks: number;
    pending_change_orders: number;
    next_milestone_date: string | null;
  }>;
  alerts: Array<{
    project_id: string;
    type: string;
    severity: string;
    message: string;
  }>;
  recent_activity: Array<{
    project_id: string;
    project_name: string;
    type: string;
    label: string | null;
    status: string | null;
    created_at: string | null;
  }>;
}

export interface PdsSnapshotRun {
  run_id: string;
  env_id: string;
  business_id: string;
  period: string;
  project_id: string | null;
  snapshot_hash: string;
  portfolio_snapshot_id: string;
  schedule_snapshot_id: string;
  risk_snapshot_id: string;
  vendor_snapshot_ids: string[];
}

export interface PdsReportPackRun {
  report_run_id: string;
  env_id: string;
  business_id: string;
  period: string;
  run_id: string;
  snapshot_hash: string | null;
  narrative_text: string | null;
  artifact_refs_json: Array<Record<string, unknown>>;
  deterministic_deltas_json: Record<string, unknown>;
  created_at: string;
}
