// Capital Projects OS TypeScript types — mirrors backend/app/schemas/capital_projects.py

export interface CpProjectHealth {
  budget_health: "green" | "yellow" | "red";
  schedule_health: "green" | "yellow" | "red";
  overall_health: "on_track" | "at_risk" | "critical";
  risk_score: string;
}

export interface CpProjectRow {
  project_id: string;
  name: string;
  project_code: string | null;
  sector: string | null;
  stage: string;
  region: string | null;
  market: string | null;
  gc_name: string | null;
  approved_budget: string;
  committed_amount: string;
  spent_amount: string;
  forecast_at_completion: string;
  contingency_remaining: string;
  health: CpProjectHealth;
  open_rfis: number;
  open_submittals: number;
  open_punch_items: number;
  pending_change_orders: number;
}

export interface CpPortfolioKpis {
  total_approved_budget: string;
  total_committed: string;
  total_spent: string;
  total_forecast: string;
  total_budget_variance: string;
  total_contingency_remaining: string;
  projects_on_track: number;
  projects_at_risk: number;
  projects_critical: number;
  total_open_rfis: number;
  total_overdue_submittals: number;
  total_open_punch_items: number;
}

export interface CpPortfolioSummary {
  kpis: CpPortfolioKpis;
  projects: CpProjectRow[];
}

export interface CpMilestone {
  milestone_id: string;
  milestone_name: string;
  baseline_date: string | null;
  current_date: string | null;
  actual_date: string | null;
  is_critical: boolean;
  is_on_critical_path: boolean;
}

export interface CpRecentActivity {
  type: string;
  label: string;
  status: string;
  created_at: string | null;
}

export interface CpProjectDashboard {
  project_id: string;
  name: string;
  project_code: string | null;
  description: string | null;
  sector: string | null;
  project_type: string | null;
  stage: string;
  status: string;
  region: string | null;
  market: string | null;
  address: string | null;
  gc_name: string | null;
  architect_name: string | null;
  owner_rep: string | null;
  project_manager: string | null;
  start_date: string | null;
  target_end_date: string | null;
  approved_budget: string;
  original_budget: string;
  committed_amount: string;
  spent_amount: string;
  forecast_at_completion: string;
  contingency_budget: string;
  contingency_remaining: string;
  management_reserve: string;
  pending_change_order_amount: string;
  budget_variance: string;
  risk_score: string;
  health: CpProjectHealth;
  open_rfis: number;
  open_submittals: number;
  overdue_submittals: number;
  open_punch_items: number;
  pending_change_orders: number;
  open_risks: number;
  open_action_items: number;
  milestones: CpMilestone[];
  recent_activity: CpRecentActivity[];
}

export interface CpDailyLog {
  daily_log_id: string;
  project_id: string;
  log_date: string;
  weather_high: number | null;
  weather_low: number | null;
  weather_conditions: string | null;
  manpower_count: number;
  superintendent: string | null;
  work_completed: string | null;
  visitors: string | null;
  incidents: string | null;
  deliveries: string | null;
  equipment: string | null;
  safety_observations: string | null;
  notes: string | null;
  photo_urls: string[];
  created_at: string;
}

export interface CpMeetingItem {
  meeting_item_id: string;
  item_number: number;
  topic: string;
  discussion: string | null;
  action_required: string | null;
  responsible_party: string | null;
  due_date: string | null;
  status: "open" | "in_progress" | "closed";
}

export interface CpMeeting {
  meeting_id: string;
  project_id: string;
  meeting_type: string;
  meeting_date: string;
  location: string | null;
  called_by: string | null;
  attendees: string[];
  agenda: string | null;
  minutes: string | null;
  next_meeting_date: string | null;
  status: "scheduled" | "completed" | "cancelled";
  items: CpMeetingItem[];
  created_at: string;
}

export interface CpDrawing {
  drawing_id: string;
  project_id: string;
  discipline: string;
  sheet_number: string;
  title: string;
  revision: string;
  issue_date: string | null;
  received_date: string | null;
  status: "current" | "superseded" | "for_review" | "void";
  notes: string | null;
  created_at: string;
}

export interface CpPayApp {
  pay_app_id: string;
  project_id: string;
  contract_id: string | null;
  vendor_id: string | null;
  vendor_name?: string | null;
  contract_number?: string | null;
  pay_app_number: number;
  billing_period_start: string | null;
  billing_period_end: string | null;
  scheduled_value: string;
  work_completed_previous: string;
  work_completed_this_period: string;
  stored_materials_previous: string;
  stored_materials_current: string;
  total_completed_stored: string;
  retainage_pct: string;
  retainage_amount: string;
  total_earned_less_retainage: string;
  previous_payments: string;
  current_payment_due: string;
  balance_to_finish: string;
  status: "draft" | "submitted" | "under_review" | "approved" | "paid" | "rejected";
  submitted_date: string | null;
  approved_date: string | null;
  paid_date: string | null;
  created_at: string;
}

// PDS passthrough types (simplified for CP context)
export interface CpBudgetLine {
  budget_line_id: string;
  cost_code: string;
  line_label: string;
  approved_amount: string;
  committed_amount: string;
  invoiced_amount: string;
  paid_amount: string;
}

export interface CpBudgetSummary {
  totals: {
    approved_budget: string;
    committed_amount: string;
    spent_amount: string;
    variance: string;
  };
  lines: CpBudgetLine[];
}

export interface CpChangeOrder {
  change_order_id: string;
  change_order_ref: string;
  status: string;
  amount_impact: string;
  schedule_impact_days: number;
  approval_required: boolean;
  approved_at: string | null;
  created_at: string;
}

export interface CpContract {
  contract_id: string;
  contract_number: string;
  vendor_name: string | null;
  contract_value: string;
  status: string;
  created_at: string;
}

export interface CpRisk {
  risk_id: string;
  risk_title: string;
  probability: string;
  impact_amount: string;
  impact_days: number;
  mitigation_owner: string | null;
  status: string;
  created_at: string;
}

export interface CpRfi {
  rfi_id: string;
  rfi_number: string;
  subject: string;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  priority: string;
  response_text: string | null;
  responded_at: string | null;
  status: string;
  discipline: string | null;
  reference_drawing: string | null;
  cost_impact: string | null;
  schedule_impact_days: number | null;
  created_at: string;
}

export interface CpSubmittal {
  submittal_id: string;
  submittal_number: string;
  description: string | null;
  spec_section: string | null;
  required_date: string | null;
  submitted_date: string | null;
  reviewed_date: string | null;
  review_notes: string | null;
  status: string;
  revision: string | null;
  review_round: number | null;
  reviewer_name: string | null;
  review_action: string | null;
  created_at: string;
}

export interface CpPunchItem {
  punch_item_id: string;
  title: string;
  description: string | null;
  location: string | null;
  floor: string | null;
  room: string | null;
  trade: string | null;
  severity: string | null;
  assignee: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
}

export interface CpScheduleSnapshot {
  milestone_id: string;
  milestone_name: string;
  baseline_date: string | null;
  current_date: string | null;
  actual_date: string | null;
  is_critical: boolean;
  is_on_critical_path: boolean;
}
