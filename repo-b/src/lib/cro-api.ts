/**
 * Consulting Revenue OS – Frontend API client.
 *
 * Uses apiFetch from @/lib/api with /bos/api/consulting/* paths,
 * which routes through the same-origin /bos proxy in production.
 */
import { apiFetch } from "@/lib/api";

const CRO_BASE = "/bos/api/consulting";

// ── Types ────────────────────────────────────────────────────────────────────

export type PipelineStage = {
  crm_pipeline_stage_id: string;
  key: string;
  label: string;
  stage_order: number;
  win_probability: number;
  is_closed: boolean;
  is_won: boolean;
  created_at: string;
};

export type PipelineKanbanCard = {
  crm_opportunity_id: string;
  name: string;
  amount: number;
  account_name: string | null;
  stage_key: string;
  stage_label: string;
  expected_close_date: string | null;
  created_at: string;
  contact_name: string | null;
  last_activity_at: string | null;
  next_action_description: string | null;
  next_action_due: string | null;
  next_action_type: string | null;
};

export type PipelineKanbanColumn = {
  stage_key: string;
  stage_label: string;
  stage_order: number;
  win_probability: number;
  cards: PipelineKanbanCard[];
  total_value: number;
  weighted_value: number;
};

export type PipelineKanbanResult = {
  columns: PipelineKanbanColumn[];
  total_pipeline: number;
  weighted_pipeline: number;
};

export type ExecutionRankedAction = {
  action_key: string;
  label: string;
  description: string;
  impact: string;
  urgency: string;
  reasoning: string;
};

export type ExecutionStageSuggestion = {
  suggested_execution_column: string;
  underlying_stage_key: string;
  reasoning: string;
  confidence: number;
  trigger_source: string;
};

export type ExecutionDraft = {
  kind: string;
  angle_key: string;
  framing: string;
  tone: string;
  cta: string;
  subject: string;
  body: string;
};

export type MeetingPrep = {
  company_summary: string;
  likely_pain_points: string[];
  tailored_demo_path: string;
  key_questions: string[];
  risks_to_watch: string[];
};

export type ExecutionCard = {
  crm_opportunity_id: string;
  crm_account_id?: string | null;
  name: string;
  amount: number;
  status: string;
  account_name: string | null;
  industry: string | null;
  stage_key: string | null;
  stage_label: string | null;
  win_probability: number | null;
  contact_name: string | null;
  expected_close_date: string | null;
  created_at: string;
  last_activity_at: string | null;
  next_action_description: string | null;
  next_action_due: string | null;
  next_action_type: string | null;
  execution_column_key: string;
  execution_column_label: string;
  personas: string[];
  pain_hypothesis: string | null;
  value_prop: string | null;
  demo_angle: string | null;
  priority_score: number;
  engagement_summary: string | null;
  execution_pressure: "low" | "medium" | "high" | "critical";
  momentum_status: "increasing" | "flat" | "declining";
  risk_flags: string[];
  deal_drift_status: "stable" | "drifting" | "at_risk";
  latest_angle_used: string | null;
  latest_objection: string | null;
  ranked_next_actions: ExecutionRankedAction[];
  stage_suggestions: ExecutionStageSuggestion[];
  auto_draft_stack: Record<string, unknown>;
  execution_state: Record<string, unknown>;
  narrative_memory: Record<string, unknown>;
};

export type ExecutionBoardColumn = {
  execution_column_key: string;
  execution_column_label: string;
  cards: ExecutionCard[];
  total_value: number;
  weighted_value: number;
};

export type ExecutionAlert = {
  level: string;
  deal_id: string;
  message: string;
};

export type ExecutionBoard = {
  columns: ExecutionBoardColumn[];
  total_pipeline: number;
  weighted_pipeline: number;
  today_queue: ExecutionCard[];
  critical_deals: ExecutionCard[];
  alerts: ExecutionAlert[];
};

export type ExecutionDetail = {
  card: ExecutionCard;
  ranked_next_actions: ExecutionRankedAction[];
  stage_suggestions: ExecutionStageSuggestion[];
  auto_draft_stack: Record<string, unknown>;
};

export type DailyExecutionBrief = {
  generated_at: string;
  top_deals: ExecutionCard[];
  actions: Array<{
    deal_id: string;
    company_name: string | null;
    execution_pressure: string;
    next_actions: ExecutionRankedAction[];
    drafts: Record<string, unknown>;
  }>;
  critical_count: number;
};

export type ExecutionCommandResult = {
  intent: string;
  requires_confirmation: boolean;
  audit_id: string | null;
  result: Record<string, unknown> | Array<Record<string, unknown>>;
};

export type MetricsSnapshot = {
  weighted_pipeline: number;
  unweighted_pipeline: number;
  open_opportunities: number;
  close_rate_90d: number | null;
  won_count_90d: number;
  lost_count_90d: number;
  outreach_count_30d: number;
  response_rate_30d: number | null;
  meetings_30d: number;
  revenue_mtd: number;
  revenue_qtd: number;
  forecast_90d: number;
  avg_deal_size: number | null;
  active_engagements: number;
  active_clients: number;
};

export type Lead = {
  crm_account_id: string;
  lead_profile_id: string;
  company_name: string;
  industry: string | null;
  website: string | null;
  account_type: string;
  ai_maturity: string | null;
  pain_category: string | null;
  lead_score: number;
  lead_source: string | null;
  company_size: string | null;
  revenue_band: string | null;
  erp_system: string | null;
  estimated_budget: number | null;
  qualified_at: string | null;
  disqualified_at: string | null;
  stage_key: string | null;
  stage_label: string | null;
  created_at: string;
};

export type OutreachTemplate = {
  id: string;
  env_id: string;
  business_id: string;
  name: string;
  channel: string;
  category: string | null;
  subject_template: string | null;
  body_template: string;
  is_active: boolean;
  use_count: number;
  reply_count: number;
  created_at: string;
};

export type OutreachLogEntry = {
  id: string;
  env_id: string;
  business_id: string;
  crm_account_id: string | null;
  crm_contact_id: string | null;
  template_id: string | null;
  channel: string;
  direction: string;
  subject: string | null;
  body_preview: string | null;
  sent_at: string;
  replied_at: string | null;
  reply_sentiment: string | null;
  meeting_booked: boolean;
  bounce: boolean;
  sent_by: string | null;
  account_name: string | null;
  contact_name: string | null;
  created_at: string;
};

export type OutreachAnalytics = {
  total_sent_30d: number;
  total_replied_30d: number;
  response_rate_30d: number | null;
  meetings_booked_30d: number;
  by_channel: Array<{ channel: string; sent: number; replied: number; meetings: number }>;
  by_template: Array<{ template_name: string; template_id: string; sent: number; replied: number }>;
};

export type Proposal = {
  id: string;
  env_id: string;
  business_id: string;
  crm_opportunity_id: string | null;
  crm_account_id: string | null;
  title: string;
  version: number;
  status: string;
  pricing_model: string | null;
  total_value: number;
  cost_estimate: number;
  margin_pct: number | null;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  scope_summary: string | null;
  risk_notes: string | null;
  account_name: string | null;
  created_at: string;
};

export type Client = {
  id: string;
  env_id: string;
  business_id: string;
  crm_account_id: string;
  company_name: string;
  client_status: string;
  account_owner: string | null;
  start_date: string;
  lifetime_value: number;
  active_engagements: number;
  total_revenue: number;
  created_at: string;
};

export type LoopRole = {
  id: string;
  loop_id: string;
  role_name: string;
  loaded_hourly_rate: number;
  active_minutes: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type LoopMetrics = {
  role_count: number;
  loop_cost_per_run: number;
  annual_estimated_cost: number;
};

export type LoopIntervention = {
  id: string;
  loop_id: string;
  intervention_type: string;
  notes: string | null;
  before_snapshot: Record<string, unknown>;
  after_snapshot: Record<string, unknown> | null;
  observed_delta_percent: number | null;
  created_at: string;
  updated_at: string;
  loop_metrics?: LoopMetrics | null;
};

export type LoopRecord = LoopMetrics & {
  id: string;
  env_id: string;
  business_id: string;
  client_id: string | null;
  name: string;
  process_domain: string;
  description: string | null;
  trigger_type: string;
  frequency_type: string;
  frequency_per_year: number;
  status: string;
  control_maturity_stage: number;
  automation_readiness_score: number;
  avg_wait_time_minutes: number;
  rework_rate_percent: number;
  created_at: string;
  updated_at: string;
};

export type LoopDetail = LoopRecord & {
  roles: LoopRole[];
  interventions: LoopIntervention[];
};

export type LoopSummary = {
  total_annual_cost: number;
  loop_count: number;
  avg_maturity_stage: number;
  top_5_by_cost: Array<{
    id: string;
    name: string;
    annual_estimated_cost: number;
  }>;
  status_counts: Record<string, number>;
};

export type SeedResult = {
  pipeline_stages_seeded: number;
  leads_seeded: number;
  contacts_seeded: number;
  outreach_templates_seeded: number;
  outreach_logs_seeded: number;
  proposals_seeded: number;
  clients_seeded: number;
  engagements_seeded: number;
  revenue_entries_seeded: number;
  loops_seeded: number;
};

// ── Pipeline ─────────────────────────────────────────────────────────────────

export function fetchPipelineStages(businessId: string) {
  return apiFetch<PipelineStage[]>(`${CRO_BASE}/pipeline/stages?business_id=${businessId}`);
}

export function fetchPipelineKanban(envId: string, businessId: string) {
  return apiFetch<PipelineKanbanResult>(`${CRO_BASE}/pipeline/kanban?env_id=${envId}&business_id=${businessId}`);
}

export function fetchExecutionBoard(envId: string, businessId: string) {
  return apiFetch<ExecutionBoard>(`${CRO_BASE}/pipeline/execution-board?env_id=${envId}&business_id=${businessId}`);
}

export function advanceOpportunityStage(body: {
  env_id: string;
  business_id: string;
  opportunity_id: string;
  close_reason?: string;
  competitive_incumbent?: string;
  close_notes?: string;
  to_stage_key: string;
  note?: string;
}) {
  return apiFetch<{ crm_opportunity_id: string; name: string; status: string }>(
    `${CRO_BASE}/pipeline/advance`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function fetchExecutionDetail(opportunityId: string, envId: string, businessId: string) {
  return apiFetch<ExecutionDetail>(`${CRO_BASE}/pipeline/${opportunityId}/execution-detail?env_id=${envId}&business_id=${businessId}`);
}

export function fetchDailyExecutionBrief(envId: string, businessId: string) {
  return apiFetch<DailyExecutionBrief>(`${CRO_BASE}/pipeline/daily-execution-brief?env_id=${envId}&business_id=${businessId}`);
}

export function fetchStuckDeals(envId: string, businessId: string) {
  return apiFetch<ExecutionCard[]>(`${CRO_BASE}/pipeline/stuck-deals?env_id=${envId}&business_id=${businessId}`);
}

export function fetchStageSuggestions(envId: string, businessId: string) {
  return apiFetch<Array<Record<string, unknown>>>(`${CRO_BASE}/pipeline/stage-suggestions?env_id=${envId}&business_id=${businessId}`);
}

export function draftOpportunityOutreach(opportunityId: string, body: { env_id: string; business_id: string }) {
  return apiFetch<{ audit_id: string | null; draft_stack: Record<string, unknown> }>(
    `${CRO_BASE}/pipeline/${opportunityId}/draft-outreach`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function generateOpportunityFollowups(opportunityId: string, body: { env_id: string; business_id: string }) {
  return apiFetch<{ audit_id: string | null; followups: ExecutionDraft[] }>(
    `${CRO_BASE}/pipeline/${opportunityId}/generate-followups`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function generateOpportunityMeetingPrep(opportunityId: string, body: { env_id: string; business_id: string }) {
  return apiFetch<{ audit_id: string | null; meeting_prep: MeetingPrep }>(
    `${CRO_BASE}/pipeline/${opportunityId}/meeting-prep`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function simulateOpportunityAction(opportunityId: string, envId: string, businessId: string, body: { action: string }) {
  return apiFetch<{ audit_id: string | null; action: string; expected_outcome: string; reasoning: string; deal_name: string }>(
    `${CRO_BASE}/pipeline/${opportunityId}/simulate-action?env_id=${envId}&business_id=${businessId}`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function runExecutionCommand(body: { env_id: string; business_id: string; command: string; confirm?: boolean }) {
  return apiFetch<ExecutionCommandResult>(`${CRO_BASE}/pipeline/command`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Leads ────────────────────────────────────────────────────────────────────

export function fetchLeads(envId: string, businessId: string, minScore?: number) {
  let url = `${CRO_BASE}/leads?env_id=${envId}&business_id=${businessId}`;
  if (minScore !== undefined) url += `&min_score=${minScore}`;
  return apiFetch<Lead[]>(url);
}

export function createLead(body: {
  env_id: string;
  business_id: string;
  company_name: string;
  industry?: string;
  website?: string;
  ai_maturity?: string;
  pain_category?: string;
  lead_source?: string;
  company_size?: string;
  revenue_band?: string;
  erp_system?: string;
  estimated_budget?: number;
  contact_name?: string;
  contact_email?: string;
  contact_title?: string;
  contact_linkedin?: string;
}) {
  return apiFetch<Lead>(`${CRO_BASE}/leads`, { method: "POST", body: JSON.stringify(body) });
}

// ── Outreach ─────────────────────────────────────────────────────────────────

export function fetchOutreachTemplates(envId: string, businessId: string) {
  return apiFetch<OutreachTemplate[]>(
    `${CRO_BASE}/outreach/templates?env_id=${envId}&business_id=${businessId}`,
  );
}

export function createOutreachTemplate(body: {
  env_id: string;
  business_id: string;
  name: string;
  channel: string;
  category?: string;
  subject_template?: string;
  body_template: string;
}) {
  return apiFetch<OutreachTemplate>(
    `${CRO_BASE}/outreach/templates`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function fetchOutreachLog(envId: string, businessId: string, opts?: { crm_account_id?: string; channel?: string }) {
  let url = `${CRO_BASE}/outreach/log?env_id=${envId}&business_id=${businessId}`;
  if (opts?.crm_account_id) url += `&crm_account_id=${opts.crm_account_id}`;
  if (opts?.channel) url += `&channel=${opts.channel}`;
  return apiFetch<OutreachLogEntry[]>(url);
}

export function logOutreach(body: {
  env_id: string;
  business_id: string;
  crm_account_id: string;
  crm_contact_id?: string;
  template_id?: string;
  channel: string;
  direction?: string;
  subject?: string;
  body_preview?: string;
  meeting_booked?: boolean;
  sent_by?: string;
}) {
  return apiFetch<OutreachLogEntry>(
    `${CRO_BASE}/outreach/log`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function recordOutreachReply(outreachLogId: string, body: { sentiment: string; meeting_booked?: boolean }) {
  return apiFetch(`${CRO_BASE}/outreach/log/${outreachLogId}/reply`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchOutreachAnalytics(envId: string, businessId: string) {
  return apiFetch<OutreachAnalytics>(
    `${CRO_BASE}/outreach/analytics?env_id=${envId}&business_id=${businessId}`,
  );
}

// ── Proposals ────────────────────────────────────────────────────────────────

export function fetchProposals(envId: string, businessId: string, opts?: { status?: string; crm_account_id?: string }) {
  let url = `${CRO_BASE}/proposals?env_id=${envId}&business_id=${businessId}`;
  if (opts?.status) url += `&status=${opts.status}`;
  if (opts?.crm_account_id) url += `&crm_account_id=${opts.crm_account_id}`;
  return apiFetch<Proposal[]>(url);
}

export function fetchProposal(proposalId: string) {
  return apiFetch<Proposal>(`${CRO_BASE}/proposals/${proposalId}`);
}

export function createProposal(body: {
  env_id: string;
  business_id: string;
  crm_opportunity_id?: string;
  crm_account_id?: string;
  title: string;
  pricing_model?: string;
  total_value: number;
  cost_estimate?: number;
  valid_until?: string;
  scope_summary?: string;
  risk_notes?: string;
}) {
  return apiFetch<Proposal>(`${CRO_BASE}/proposals`, { method: "POST", body: JSON.stringify(body) });
}

export function updateProposalStatus(proposalId: string, body: { status: string; rejection_reason?: string }) {
  return apiFetch(`${CRO_BASE}/proposals/${proposalId}/status`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function createProposalVersion(proposalId: string) {
  return apiFetch<Proposal>(`${CRO_BASE}/proposals/${proposalId}/version`, { method: "POST" });
}

export function generateProposal(body: {
  env_id: string;
  business_id: string;
  crm_account_id: string;
}) {
  return apiFetch<Proposal>(`${CRO_BASE}/proposals/generate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Clients ──────────────────────────────────────────────────────────────────

export function fetchClients(envId: string, businessId: string, opts?: { status?: string }) {
  let url = `${CRO_BASE}/clients?env_id=${envId}&business_id=${businessId}`;
  if (opts?.status) url += `&status=${opts.status}`;
  return apiFetch<Client[]>(url);
}

export function fetchClient(clientId: string) {
  return apiFetch<Client>(`${CRO_BASE}/clients/${clientId}`);
}

export function convertToClient(body: {
  env_id: string;
  business_id: string;
  crm_account_id: string;
  crm_opportunity_id?: string;
  proposal_id?: string;
  account_owner?: string;
  start_date?: string;
}) {
  return apiFetch<Client>(`${CRO_BASE}/clients/convert`, { method: "POST", body: JSON.stringify(body) });
}

// ── Loop Intelligence ───────────────────────────────────────────────────────

export function fetchLoops(
  envId: string,
  businessId: string,
  opts?: { client_id?: string; status?: string; domain?: string; min_cost?: number },
) {
  let url = `${CRO_BASE}/loops?env_id=${envId}&business_id=${businessId}`;
  if (opts?.client_id) url += `&client_id=${opts.client_id}`;
  if (opts?.status) url += `&status=${opts.status}`;
  if (opts?.domain) url += `&domain=${encodeURIComponent(opts.domain)}`;
  if (opts?.min_cost !== undefined) url += `&min_cost=${opts.min_cost}`;
  return apiFetch<LoopRecord[]>(url);
}

export function fetchLoopSummary(
  envId: string,
  businessId: string,
  opts?: { client_id?: string; status?: string; domain?: string; min_cost?: number },
) {
  let url = `${CRO_BASE}/loops/summary?env_id=${envId}&business_id=${businessId}`;
  if (opts?.client_id) url += `&client_id=${opts.client_id}`;
  if (opts?.status) url += `&status=${opts.status}`;
  if (opts?.domain) url += `&domain=${encodeURIComponent(opts.domain)}`;
  if (opts?.min_cost !== undefined) url += `&min_cost=${opts.min_cost}`;
  return apiFetch<LoopSummary>(url);
}

export function fetchLoop(loopId: string, envId: string, businessId: string) {
  return apiFetch<LoopDetail>(
    `${CRO_BASE}/loops/${loopId}?env_id=${envId}&business_id=${businessId}`,
  );
}

export function createLoop(body: {
  env_id: string;
  business_id: string;
  client_id?: string;
  name: string;
  process_domain: string;
  description?: string;
  trigger_type: string;
  frequency_type: string;
  frequency_per_year: number;
  status: string;
  control_maturity_stage: number;
  automation_readiness_score: number;
  avg_wait_time_minutes: number;
  rework_rate_percent: number;
  roles: Array<{
    role_name: string;
    loaded_hourly_rate: number;
    active_minutes: number;
    notes?: string;
  }>;
}) {
  return apiFetch<LoopDetail>(`${CRO_BASE}/loops`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateLoop(
  loopId: string,
  envId: string,
  businessId: string,
  body: {
    client_id?: string;
    name: string;
    process_domain: string;
    description?: string;
    trigger_type: string;
    frequency_type: string;
    frequency_per_year: number;
    status: string;
    control_maturity_stage: number;
    automation_readiness_score: number;
    avg_wait_time_minutes: number;
    rework_rate_percent: number;
    roles?: Array<{
      role_name: string;
      loaded_hourly_rate: number;
      active_minutes: number;
      notes?: string;
    }>;
  },
) {
  return apiFetch<LoopDetail>(
    `${CRO_BASE}/loops/${loopId}?env_id=${envId}&business_id=${businessId}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
}

export function createLoopIntervention(
  loopId: string,
  envId: string,
  businessId: string,
  body: {
    intervention_type: string;
    notes?: string;
    after_snapshot?: Record<string, unknown>;
    observed_delta_percent?: number;
  },
) {
  return apiFetch<LoopIntervention>(
    `${CRO_BASE}/loops/${loopId}/interventions?env_id=${envId}&business_id=${businessId}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

// ── Metrics / Seed ───────────────────────────────────────────────────────────

export function fetchLatestMetrics(envId: string, businessId: string) {
  return apiFetch<MetricsSnapshot>(
    `${CRO_BASE}/metrics/latest?env_id=${envId}&business_id=${businessId}`,
  );
}

export function seedConsultingWorkspace(body: {
  env_id: string;
  business_id: string;
}) {
  return apiFetch<SeedResult>(`${CRO_BASE}/seed`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type StrategicOutreachMetrics = {
  high_priority: number;
  medium_priority: number;
  low_priority: number;
  time_in_stage_days: number | null;
  engagement_rate: number | null;
  sent_count: number;
  diagnostic_questions: string[];
};

export type StrategicOutreachLead = {
  id: string;
  lead_profile_id: string;
  crm_account_id: string;
  company_name: string;
  industry: string | null;
  employee_range: string;
  multi_entity_flag: boolean;
  pe_backed_flag: boolean;
  estimated_system_stack: string[];
  ai_pressure_score: number;
  reporting_complexity_score: number;
  governance_risk_score: number;
  vendor_fragmentation_score: number;
  composite_priority_score: number;
  status: string;
  created_at: string;
  updated_at: string;
  primary_wedge_angle: string | null;
  top_2_capabilities: string[];
};

export type TriggerSignal = {
  id: string;
  lead_profile_id: string;
  trigger_type: string;
  source_url: string;
  summary: string;
  detected_at: string;
};

export type StrategicOutreachSequence = {
  id: string;
  lead_profile_id: string;
  sequence_stage: number;
  draft_message: string;
  approved_message: string | null;
  sent_timestamp: string | null;
  response_status: string;
  followup_due_date: string | null;
  created_at: string;
};

export type StrategicDiagnosticSession = {
  id: string;
  lead_profile_id: string;
  scheduled_date: string;
  notes: string | null;
  governance_findings: string | null;
  ai_readiness_score: number | null;
  reconciliation_risk_score: number | null;
  recommended_first_intervention: string | null;
  question_responses: Record<string, string>;
  created_at: string;
};

export type StrategicDeliverable = {
  id: string;
  lead_profile_id: string;
  file_path: string;
  summary: string;
  sent_date: string;
  followup_status: string;
  content_markdown: string;
  created_at: string;
};

export type StrategicOutreachDashboard = {
  metrics: StrategicOutreachMetrics;
  status_funnel: Array<{ status: string; count: number }>;
  leads: StrategicOutreachLead[];
  trigger_signals: TriggerSignal[];
  outreach_queue: StrategicOutreachSequence[];
  diagnostics: StrategicDiagnosticSession[];
  deliverables: StrategicDeliverable[];
};

export function fetchStrategicOutreachDashboard(envId: string, businessId: string) {
  return apiFetch<StrategicOutreachDashboard>(
    `${CRO_BASE}/strategic-outreach/dashboard?env_id=${envId}&business_id=${businessId}`,
  );
}

export function runStrategicOutreachMonitor(body: {
  env_id: string;
  business_id: string;
}) {
  return apiFetch<{ status: string; reviewed_leads: number; triggered_drafts: number }>(
    `${CRO_BASE}/strategic-outreach/monitor`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function seedStrategicOutreach(body: {
  env_id: string;
  business_id: string;
}) {
  return apiFetch<{ status: string; leads_seeded: number }>(
    `${CRO_BASE}/strategic-outreach/seed`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function advanceStrategicLeadStatus(leadId: string, status: string) {
  return apiFetch<{ id: string; status: string }>(
    `${CRO_BASE}/strategic-outreach/leads/${leadId}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}

export function approveStrategicOutreach(sequenceId: string, body: { approved_message: string }) {
  return apiFetch<StrategicOutreachSequence>(
    `${CRO_BASE}/strategic-outreach/outreach/${sequenceId}/approve`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

// ─── Next Actions ───────────────────────────────────────────────────────────

export interface NextAction {
  id: string;
  env_id: string;
  business_id: string;
  entity_type: "account" | "contact" | "opportunity" | "lead";
  entity_id: string;
  entity_name?: string;
  action_type: string;
  description: string;
  due_date: string;
  owner?: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  completed_at?: string;
  priority: "low" | "normal" | "high" | "urgent";
  notes?: string;
  created_at: string;
}

export interface TodayOverdue {
  today: NextAction[];
  overdue: NextAction[];
  today_count: number;
  overdue_count: number;
}

export async function fetchTodayOverdue(envId: string, businessId: string): Promise<TodayOverdue> {
  return apiFetch<TodayOverdue>(`${CRO_BASE}/next-actions/today-overdue?env_id=${envId}&business_id=${businessId}`);
}

export async function fetchNextActions(envId: string, businessId: string, status?: string): Promise<NextAction[]> {
  const params = new URLSearchParams({ env_id: envId, business_id: businessId });
  if (status) params.set("status", status);
  return apiFetch<NextAction[]>(`${CRO_BASE}/next-actions?${params}`);
}

export async function createNextAction(body: {
  env_id: string;
  business_id: string;
  entity_type: string;
  entity_id: string;
  action_type: string;
  description: string;
  due_date: string;
  owner?: string;
  priority?: string;
}): Promise<NextAction> {
  return apiFetch<NextAction>(`${CRO_BASE}/next-actions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function completeNextAction(actionId: string, businessId: string): Promise<NextAction> {
  return apiFetch<NextAction>(`${CRO_BASE}/next-actions/${actionId}/complete`, {
    method: "POST",
    body: JSON.stringify({ business_id: businessId }),
  });
}

export async function skipNextAction(actionId: string, businessId: string, reason?: string): Promise<NextAction> {
  return apiFetch<NextAction>(`${CRO_BASE}/next-actions/${actionId}/skip`, {
    method: "POST",
    body: JSON.stringify({ business_id: businessId, reason }),
  });
}

// ─── Activity Timeline ──────────────────────────────────────────────────────

export interface Activity {
  crm_activity_id: string;
  crm_account_id?: string;
  crm_contact_id?: string;
  crm_opportunity_id?: string;
  activity_type: string;
  subject?: string;
  activity_at: string;
  payload_json?: Record<string, unknown>;
  created_at: string;
}

export async function fetchActivities(envId: string, businessId: string, params?: {
  account_id?: string;
  contact_id?: string;
  opportunity_id?: string;
  limit?: number;
}): Promise<Activity[]> {
  const qs = new URLSearchParams({ env_id: envId, business_id: businessId });
  if (params?.account_id) qs.set("account_id", params.account_id);
  if (params?.contact_id) qs.set("contact_id", params.contact_id);
  if (params?.opportunity_id) qs.set("opportunity_id", params.opportunity_id);
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<Activity[]>(`${CRO_BASE}/activities?${qs}`);
}

export async function updateLeadStage(leadId: string, envId: string, businessId: string, stage: string): Promise<unknown> {
  return apiFetch<unknown>(`${CRO_BASE}/leads/${leadId}/stage`, {
    method: "POST",
    body: JSON.stringify({ env_id: envId, business_id: businessId, stage }),
  });
}

// ─── Entity Detail Views ────────────────────────────────────────────────────

export interface AccountDetail {
  crm_account_id: string;
  company_name: string;
  industry: string | null;
  website: string | null;
  account_type: string | null;
  annual_revenue: number | null;
  employee_count: number | null;
  lead_profile_id: string | null;
  ai_maturity: string | null;
  pain_category: string | null;
  lead_score: number | null;
  score_breakdown: Record<string, { value: number; label: string }> | null;
  pipeline_stage: string | null;
  lead_source: string | null;
  company_size: string | null;
  revenue_band: string | null;
  erp_system: string | null;
  estimated_budget: number | null;
  qualified_at: string | null;
  disqualified_at: string | null;
  created_at: string;
}

export interface ContactDetail {
  crm_contact_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  crm_account_id: string | null;
  account_name: string | null;
  account_industry: string | null;
  linkedin_url: string | null;
  relationship_strength: string | null;
  decision_role: string | null;
  last_outreach_at: string | null;
  profile_notes: string | null;
  created_at: string;
}

export interface OpportunityDetail {
  crm_opportunity_id: string;
  name: string;
  amount: number | null;
  status: string;
  expected_close_date: string | null;
  crm_account_id: string | null;
  account_name: string | null;
  account_industry: string | null;
  stage_key: string | null;
  stage_label: string | null;
  win_probability: number | null;
  stage_order: number | null;
  created_at: string;
  close_reason: string | null;
  competitive_incumbent: string | null;
  close_notes: string | null;
  closed_at: string | null;
}

export interface StageHistoryEntry {
  id: string;
  changed_at: string;
  note: string | null;
  from_stage_key: string | null;
  from_stage_label: string | null;
  to_stage_key: string | null;
  to_stage_label: string | null;
}

export interface OutreachEntry {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  body_preview: string | null;
  sent_at: string;
  replied_at: string | null;
  reply_sentiment: string | null;
  meeting_booked: boolean;
  sent_by: string | null;
}

export interface AccountContact {
  crm_contact_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedin_url: string | null;
  relationship_strength: string | null;
  decision_role: string | null;
  last_outreach_at: string | null;
  created_at: string;
}

export async function fetchAccountDetail(accountId: string, envId: string, businessId: string): Promise<AccountDetail> {
  return apiFetch<AccountDetail>(`${CRO_BASE}/accounts/${accountId}?env_id=${envId}&business_id=${businessId}`);
}

export async function fetchAccountContacts(accountId: string, envId: string, businessId: string): Promise<AccountContact[]> {
  return apiFetch<AccountContact[]>(`${CRO_BASE}/accounts/${accountId}/contacts?env_id=${envId}&business_id=${businessId}`);
}

export async function fetchAccountOpportunities(accountId: string, envId: string, businessId: string): Promise<OpportunityDetail[]> {
  return apiFetch<OpportunityDetail[]>(`${CRO_BASE}/accounts/${accountId}/opportunities?env_id=${envId}&business_id=${businessId}`);
}

export async function fetchOpportunityDetail(opportunityId: string, envId: string, businessId: string): Promise<OpportunityDetail> {
  return apiFetch<OpportunityDetail>(`${CRO_BASE}/opportunities/${opportunityId}?env_id=${envId}&business_id=${businessId}`);
}

export async function createConsultingOpportunity(body: {
  business_id: string;
  name: string;
  amount: string;
  crm_account_id: string;
  expected_close_date?: string;
}): Promise<{ crm_opportunity_id: string; name: string }> {
  return apiFetch("/bos/api/crm/opportunities", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchOpportunityContacts(opportunityId: string, envId: string, businessId: string): Promise<AccountContact[]> {
  return apiFetch<AccountContact[]>(`${CRO_BASE}/opportunities/${opportunityId}/contacts?env_id=${envId}&business_id=${businessId}`);
}

export async function fetchOpportunityStageHistory(opportunityId: string, envId: string, businessId: string): Promise<StageHistoryEntry[]> {
  return apiFetch<StageHistoryEntry[]>(`${CRO_BASE}/opportunities/${opportunityId}/stage-history?env_id=${envId}&business_id=${businessId}`);
}

export async function fetchContactDetail(contactId: string, envId: string, businessId: string): Promise<ContactDetail> {
  return apiFetch<ContactDetail>(`${CRO_BASE}/contacts/${contactId}?env_id=${envId}&business_id=${businessId}`);
}

export async function fetchContactOutreach(contactId: string, envId: string, businessId: string): Promise<OutreachEntry[]> {
  return apiFetch<OutreachEntry[]>(`${CRO_BASE}/contacts/${contactId}/outreach?env_id=${envId}&business_id=${businessId}`);
}

// ── Schema Health ───────────────────────────────────────────────────────────

export type SchemaHealth = {
  schema_ready: boolean;
  tables_found: string[];
  tables_missing: string[];
  migrations_needed: string[];
  seed_status: Record<string, number>;
  has_data: boolean;
  last_activity: string | null;
  total_required: number;
  total_found: number;
};

export async function fetchSchemaHealth(): Promise<SchemaHealth> {
  return apiFetch<SchemaHealth>("/bos/api/consulting/health");
}

// ── Proof Assets ────────────────────────────────────────────────────────────

export type ProofAsset = {
  id: string;
  env_id: string;
  business_id: string;
  asset_type: string;
  title: string;
  description: string | null;
  status: string;
  linked_offer_type: string | null;
  file_path: string | null;
  content_markdown: string | null;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
  updated_at: string;
};

export type ProofAssetSummary = {
  total: number;
  ready: number;
  draft: number;
  needs_update: number;
  archived: number;
};

export async function fetchProofAssets(envId: string, businessId: string, status?: string): Promise<ProofAsset[]> {
  let url = `${CRO_BASE}/proof-assets?env_id=${envId}&business_id=${businessId}`;
  if (status) url += `&status=${status}`;
  return apiFetch<ProofAsset[]>(url);
}

export async function fetchProofAssetSummary(envId: string, businessId: string): Promise<ProofAssetSummary> {
  return apiFetch<ProofAssetSummary>(`${CRO_BASE}/proof-assets/summary?env_id=${envId}&business_id=${businessId}`);
}

export async function createProofAsset(body: {
  env_id: string;
  business_id: string;
  asset_type: string;
  title: string;
  description?: string;
  status?: string;
  content_markdown?: string;
}): Promise<ProofAsset> {
  return apiFetch<ProofAsset>(`${CRO_BASE}/proof-assets`, { method: "POST", body: JSON.stringify(body) });
}

export async function updateProofAsset(assetId: string, body: { status?: string; title?: string; description?: string; content_markdown?: string }): Promise<ProofAsset> {
  return apiFetch<ProofAsset>(`${CRO_BASE}/proof-assets/${assetId}`, { method: "PATCH", body: JSON.stringify(body) });
}

// ── Objections ──────────────────────────────────────────────────────────────

export type Objection = {
  id: string;
  env_id: string;
  business_id: string;
  crm_account_id: string | null;
  crm_opportunity_id: string | null;
  account_name: string | null;
  objection_type: string;
  summary: string;
  source_conversation: string | null;
  response_strategy: string | null;
  confidence: number | null;
  outcome: string;
  linked_feature_gap: string | null;
  linked_offer_type: string | null;
  detected_at: string;
  resolved_at: string | null;
  created_at: string;
};

export type TopObjection = {
  objection_type: string;
  freq: number;
  examples: string[];
};

export async function fetchObjections(envId: string, businessId: string, outcome?: string): Promise<Objection[]> {
  let url = `${CRO_BASE}/objections?env_id=${envId}&business_id=${businessId}`;
  if (outcome) url += `&outcome=${outcome}`;
  return apiFetch<Objection[]>(url);
}

export async function fetchTopObjections(envId: string, businessId: string): Promise<TopObjection[]> {
  return apiFetch<TopObjection[]>(`${CRO_BASE}/objections/top?env_id=${envId}&business_id=${businessId}`);
}

export async function createObjection(body: {
  env_id: string;
  business_id: string;
  objection_type: string;
  summary: string;
  response_strategy?: string;
  confidence?: number;
}): Promise<Objection> {
  return apiFetch<Objection>(`${CRO_BASE}/objections`, { method: "POST", body: JSON.stringify(body) });
}

export async function updateObjection(objectionId: string, body: { outcome?: string; response_strategy?: string; confidence?: number }): Promise<Objection> {
  return apiFetch<Objection>(`${CRO_BASE}/objections/${objectionId}`, { method: "PATCH", body: JSON.stringify(body) });
}

// ── Demo Readiness ──────────────────────────────────────────────────────────

export type DemoReadiness = {
  id: string;
  env_id: string;
  business_id: string;
  demo_name: string;
  vertical: string | null;
  status: string;
  blockers: string[];
  last_tested_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchDemoReadiness(envId: string, businessId: string): Promise<DemoReadiness[]> {
  return apiFetch<DemoReadiness[]>(`${CRO_BASE}/demo-readiness?env_id=${envId}&business_id=${businessId}`);
}

export async function updateDemoReadiness(demoId: string, body: { status?: string; blockers?: string[]; notes?: string }): Promise<DemoReadiness> {
  return apiFetch<DemoReadiness>(`${CRO_BASE}/demo-readiness/${demoId}`, { method: "PATCH", body: JSON.stringify(body) });
}

// ── Stale Records ───────────────────────────────────────────────────────────

export type StaleAccount = {
  crm_account_id: string;
  name: string;
  industry: string | null;
  last_activity_date: string | null;
  days_stale: number;
};

export type OrphanOpportunity = {
  crm_opportunity_id: string;
  name: string;
  account_name: string | null;
  stage_key: string | null;
  amount: number | null;
};

export type StaleRecords = {
  stale_accounts: StaleAccount[];
  orphan_opportunities: OrphanOpportunity[];
};

export async function fetchStaleRecords(envId: string, businessId: string, staleDays = 14): Promise<StaleRecords> {
  return apiFetch<StaleRecords>(`${CRO_BASE}/health/stale?env_id=${envId}&business_id=${businessId}&stale_days=${staleDays}`);
}

export async function resetAndReseed(envId: string, businessId: string): Promise<Record<string, number>> {
  return apiFetch<Record<string, number>>(`${CRO_BASE}/seed/reset`, {
    method: "POST",
    body: JSON.stringify({ env_id: envId, business_id: businessId }),
  });
}

// Target from client-hunting research — used in the Target Queue panel
export type TargetQueueItem = {
  company: string;
  segment: string;
  signal: string;
  score: number;
  offer: string;
  offerValue: string;
  contact: string;
  contactTitle: string;
  email: string;
  linkedin: string;
  pain: string;
  thesis: string;
  expectedROI: string;
  stage: "new" | "researched" | "outreach_ready" | "contacted" | "blocked";
  nextAction: string;
  nextActionDue: string;
};

export const TARGET_QUEUE: TargetQueueItem[] = [
  {
    company: "Marcus Partners",
    segment: "REPE National",
    signal: "$875M Fund V closed, East Coast expansion, ILPA compliance pressure",
    score: 21,
    offer: "Winston REPE Pilot — LP reporting + portfolio analytics",
    offerValue: "$35K",
    contact: "Jay McNamara",
    contactTitle: "Managing Director, Operations",
    email: "jmcnamara@marcuspartners.com",
    linkedin: "https://www.linkedin.com/in/jay-mcnamara-marcus/",
    pain: "ILPA Q1 2026 reporting templates now required — manual quarterly LP packages across $875M fund",
    thesis: "New fund close = new LP base = reporting complexity spike. ILPA compliance is now table stakes.",
    expectedROI: "Cut LP reporting prep from 40hrs/quarter to <10hrs. Compliance automation.",
    stage: "researched",
    nextAction: "Send intro email — reference Fund V close + ILPA pressure",
    nextActionDue: "2026-04-02",
  },
  {
    company: "GAIA Real Estate",
    segment: "REPE National",
    signal: "New MD hire (Pascual Korchmar), South Florida expansion, multifamily focus",
    score: 19,
    offer: "AI Diagnostic — operational readiness assessment",
    offerValue: "$7.5K",
    contact: "Pascual Korchmar",
    contactTitle: "Managing Director",
    email: "pkorchmar@gaiare.com",
    linkedin: "https://www.linkedin.com/in/pascualkorchmar/",
    pain: "Expanding into South Florida with new leadership — need operational infrastructure to match growth",
    thesis: "New MD hire = operational mandate. SoFla expansion = local network advantage for Novendor.",
    expectedROI: "Operational readiness assessment before scaling. Prevent reporting chaos during expansion.",
    stage: "researched",
    nextAction: "LinkedIn connect + intro message referencing SoFla expansion",
    nextActionDue: "2026-04-02",
  },
  {
    company: "Comvest Private Equity",
    segment: "PE-Backed / SoFla",
    signal: "$10.4B AUM, 166 portfolio companies, Jan 2026 Corvid Technologies investment, active FL add-ons",
    score: 20,
    offer: "AI Diagnostic — portfolio operations value creation",
    offerValue: "$7.5K",
    contact: "Value Creation Team Lead",
    contactTitle: "VP, Value Creation",
    email: "info@comvest.com",
    linkedin: "",
    pain: "166 portfolio companies with inconsistent reporting and no centralized operational visibility",
    thesis: "Massive portco count + active add-ons = integration complexity. Local WPB presence = warm path.",
    expectedROI: "Standardize portco reporting across 166 companies. Save 100+ hours/quarter on consolidation.",
    stage: "new",
    nextAction: "Research value creation team — find named contact on LinkedIn",
    nextActionDue: "2026-04-01",
  },
  {
    company: "ACG South Florida",
    segment: "Workshop/Event",
    signal: "AI + PE events running quarterly, DealMAX 2026 on calendar",
    score: 19,
    offer: "Workshop pipeline — speaking + attendance",
    offerValue: "$200-500/seat",
    contact: "Events Team",
    contactTitle: "Chapter Director",
    email: "southflorida@acg.org",
    linkedin: "https://www.linkedin.com/company/acg-south-florida/",
    pain: "PE community needs AI education — limited local speakers with implementation experience",
    thesis: "Workshop channel builds pipeline at scale. 1 talk = 5-10 warm intros to PE ops leaders.",
    expectedROI: "3-5 qualified leads per workshop. Brand positioning as AI ops authority in SoFla PE community.",
    stage: "new",
    nextAction: "Email events team — propose AI + PE ops workshop for Q2",
    nextActionDue: "2026-04-03",
  },
  {
    company: "Canopy Real Estate Partners",
    segment: "REPE National",
    signal: "$75M inaugural fund closed Mar 18, emerging sponsor, rapid deployment phase",
    score: 19,
    offer: "Winston REPE Pilot — fund ops from day one",
    offerValue: "$35K",
    contact: "Jay Rollins",
    contactTitle: "Founder & Managing Partner",
    email: "jrollins@canopyrep.com",
    linkedin: "https://www.linkedin.com/in/jay-rollins-canopy/",
    pain: "Brand new fund = zero operational infrastructure. Need LP reporting before first deployment.",
    thesis: "Inaugural fund = greenfield ops build. No legacy systems to fight. Perfect pilot candidate.",
    expectedROI: "Build LP reporting infrastructure from scratch — avoid 6 months of manual Excel hell.",
    stage: "researched",
    nextAction: "Find warm intro path — check LinkedIn connections to Jay Rollins",
    nextActionDue: "2026-04-02",
  },
  {
    company: "Hidden Harbor Capital",
    segment: "PE-Backed Transition",
    signal: "Active FL roll-up — Paramount Painting acquired, 24 portfolio companies, Boca HQ",
    score: 18,
    offer: "AI Diagnostic — roll-up integration operations",
    offerValue: "$7.5K",
    contact: "Justin Martino",
    contactTitle: "Managing Partner",
    email: "jmartino@hh-cp.com",
    linkedin: "https://www.linkedin.com/in/justinmartino/",
    pain: "24 portcos acquired via roll-up — integration complexity growing with each add-on",
    thesis: "Active roll-up = compounding integration pain. Local Boca presence = easy first meeting.",
    expectedROI: "Standardize reporting across 24 portcos. Reduce integration time per add-on by 40%.",
    stage: "researched",
    nextAction: "Research Justin Martino background — draft personalized intro",
    nextActionDue: "2026-04-03",
  },
  {
    company: "Apex Service Partners",
    segment: "PE-Backed Transition",
    signal: "107 brands, $1.3B revenue, Tampa HQ, Alpine Investors backed",
    score: 18,
    offer: "AI Diagnostic — multi-brand operational intelligence",
    offerValue: "$7.5K",
    contact: "Operations Leadership",
    contactTitle: "VP Operations",
    email: "info@apexservicepartners.com",
    linkedin: "",
    pain: "107 brands with fragmented reporting — no centralized view across service verticals",
    thesis: "$1.3B across 107 brands = massive data fragmentation. Alpine Investors mandate for AI ops.",
    expectedROI: "Centralized ops dashboard across 107 brands. Surface underperformers in real-time.",
    stage: "new",
    nextAction: "Find VP Ops or COO on LinkedIn — Alpine Investors may have ops contact",
    nextActionDue: "2026-04-02",
  },
  {
    company: "FIU College of Business",
    segment: "Workshop/Event",
    signal: "AI Strategy for Business Leaders program, AI 305 Conference Oct 2026",
    score: 18,
    offer: "Workshop / Guest speaking",
    offerValue: "Brand + pipeline",
    contact: "Executive Education Team",
    contactTitle: "Program Director",
    email: "fiuExecEd@fiu.edu",
    linkedin: "https://www.linkedin.com/school/fiubusiness/",
    pain: "Need practitioner speakers with real AI implementation experience for exec ed programs",
    thesis: "Academic channel = credibility + pipeline. Students are future buyers. Conference = warm intros.",
    expectedROI: "Brand positioning as AI ops practitioner. 2-3 leads per event from exec ed attendees.",
    stage: "new",
    nextAction: "Email fiuExecEd@fiu.edu — propose guest lecture on AI ops in PE/RE",
    nextActionDue: "2026-04-03",
  },
  {
    company: "Greystar Investment Group",
    segment: "REPE National",
    signal: "GEP XII fund raise, 893K+ units globally, massive LP reporting burden",
    score: 19,
    offer: "Winston REPE Pilot — institutional LP reporting",
    offerValue: "$35K",
    contact: "Fund Operations Team",
    contactTitle: "VP, Fund Operations",
    email: "",
    linkedin: "",
    pain: "893K+ units globally — LP reporting across multiple fund vehicles is a massive manual lift",
    thesis: "Largest apartment operator globally. Even a small efficiency gain = massive dollar impact.",
    expectedROI: "Automate LP reporting across fund vehicles. Save hundreds of hours per quarter.",
    stage: "new",
    nextAction: "Find fund ops contact — check LinkedIn for VP Fund Operations at Greystar",
    nextActionDue: "2026-04-04",
  },
];

export const PROOF_ASSET_GAPS = [
  { title: "Diagnostic Questionnaire", description: "Pre-call discovery form to qualify pain depth and budget", status: "missing" as const },
  { title: "Offer Sheet — One Page", description: "Foundation Sprint scope, pricing, and expected outcomes", status: "missing" as const },
  { title: "Workflow Example — Replace Spreadsheet Reporting", description: "Before/after workflow showing reporting automation", status: "missing" as const },
  { title: "Case Study / REPE Pilot Summary", description: "Anonymized outcome from first engagement", status: "missing" as const },
  { title: "LinkedIn Sequence Template", description: "3-touch LinkedIn + email outreach cadence", status: "missing" as const },
];

// ── Daily Outreach Brief ──────────────────────────────────────────────────────
// Mirrors DailyBriefOut + sub-types from backend/app/schemas/consulting.py

export type ReadinessSignals = {
  named_contact: boolean;
  titled_contact: boolean;
  channel_available: boolean;
  warm_intro_path: boolean;
  pain_thesis: boolean;
  matched_offer: boolean;
  proof_asset: boolean;
  next_step_defined: boolean;
};

export type BestShotItem = {
  crm_account_id: string;
  company_name: string;
  contact_name: string | null;
  contact_title: string | null;
  vertical: string | null;
  matched_offer: string | null;
  why_now_trigger: string | null;
  recommended_channel: string;
  cta: string;
  readiness_score: number;
  readiness_signals: ReadinessSignals;
  missing_signals: string[];
  composite_priority_score: number;
};

export type BlockingIssueBucket = { crm_account_id: string; company_name: string };

export type BlockingIssueSummary = {
  missing_contact: number;
  missing_channel: number;
  missing_pain_thesis: number;
  missing_matched_offer: number;
  missing_proof_asset: number;
  no_followup_scheduled: number;
  total_blocked: number;
  by_bucket: Record<string, BlockingIssueBucket[]>;
};

export type MessageQueueItem = {
  lead_profile_id: string;
  outreach_sequence_id: string;
  company_name: string;
  contact_name: string | null;
  channel: string;
  sequence_stage: number;
  draft_preview: string;
  proof_asset_attached: boolean;
  send_ready: boolean;
  followup_due_date: string | null;
};

export type ObjectionItem = {
  id: string;
  objection_type: string;
  summary: string;
  response_strategy: string | null;
  confidence: number | null;
  outcome: string | null;
};

export type ProofReadinessItem = {
  asset_type: string;
  title: string;
  status: "ready" | "draft" | "needs_update" | "missing";
  action_label: string | null;
  linked_offer_type: string | null;
  required_for_outreach: boolean;
};

export type WeeklyStripItem = {
  week_start: string;
  touches_target: number;
  sent: number;
  replies: number;
  meetings_booked: number;
  proposals_sent: number;
  reply_rate_pct: number | null;
};

export type DailyBrief = {
  generated_at: string;
  env_id: string;
  business_id: string;
  best_shots: BestShotItem[];
  blocking_issues: BlockingIssueSummary;
  message_queue: MessageQueueItem[];
  objection_radar: ObjectionItem[];
  proof_readiness: ProofReadinessItem[];
  weekly_strip: WeeklyStripItem;
  total_active_leads: number;
  ready_now_count: number;
};

export function fetchDailyBrief(envId: string, businessId: string) {
  return apiFetch<DailyBrief>(
    `${CRO_BASE}/daily-brief?env_id=${encodeURIComponent(envId)}&business_id=${encodeURIComponent(businessId)}`
  );
}

// ── Revenue Execution OS — Deal-centric types ───────────────────────────────

export type ComputedStatus = "NeedsAttention" | "ReadyToAct" | "Waiting" | "OnTrack" | "Closed";

export type Deal = {
  crm_opportunity_id: string;
  name: string;
  amount: number;
  opp_status: string;
  thesis: string | null;
  pain: string | null;
  winston_angle: string | null;
  expected_close_date: string | null;
  created_at: string;
  updated_at: string | null;
  crm_account_id: string | null;
  account_name: string | null;
  industry: string | null;
  stage_key: string | null;
  stage_label: string | null;
  stage_order: number | null;
  last_activity_at: string | null;
  last_activity_direction: string | null;
  last_activity_type: string | null;
  next_action_id: string | null;
  next_action_due: string | null;
  next_action_description: string | null;
  next_action_type: string | null;
  next_action_status: string | null;
  computed_status: ComputedStatus;
};

export type PipelineStripItem = {
  stage_key: string;
  stage_label: string;
  stage_order: number;
  deal_count: number;
  total_value: number;
  stale_count: number;
};

export type IndustryBreakdownItem = {
  industry: string;
  deal_count: number;
  total_value: number;
  needs_attention_count: number;
};

export type StuckMoneyItem = {
  crm_opportunity_id: string;
  name: string;
  amount: number;
  account_name: string | null;
  industry: string | null;
  stage_label: string | null;
  next_action_due: string | null;
  next_action_description: string | null;
};

export type OutreachSnapshotData = {
  sent_7d: number;
  replies_7d: number;
  meetings_7d: number;
  reply_rate_7d: number;
};

export type DealSummary = {
  pipeline_strip: PipelineStripItem[];
  industry_breakdown: IndustryBreakdownItem[];
  stuck_money: StuckMoneyItem[];
  outreach_7d: OutreachSnapshotData;
};

export type DealFilters = {
  industry?: string;
  stage_key?: string;
  computed_status?: string;
  min_value?: number;
  max_value?: number;
  last_activity_days?: number;
  include_closed?: boolean;
};

export function fetchDeals(envId: string, businessId: string, filters?: DealFilters) {
  const params = new URLSearchParams({
    env_id: envId,
    business_id: businessId,
  });
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    });
  }
  return apiFetch<Deal[]>(`${CRO_BASE}/deals?${params.toString()}`);
}

export function fetchDealSummary(envId: string, businessId: string) {
  return apiFetch<DealSummary>(
    `${CRO_BASE}/deals/summary?env_id=${encodeURIComponent(envId)}&business_id=${encodeURIComponent(businessId)}`
  );
}

export function logDealActivity(
  dealId: string,
  body: {
    env_id: string;
    business_id: string;
    activity_type: string;
    subject: string;
    direction?: string;
    outcome?: string;
    next_step?: string;
    create_next_action?: boolean;
    next_action_description?: string;
    next_action_due?: string;
  },
) {
  return apiFetch<{ crm_activity_id: string; next_action_id: string | null; logged: boolean }>(
    `${CRO_BASE}/deals/${dealId}/log-activity`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function ingestLeads(body: { env_id: string; business_id: string; source_path?: string }) {
  return apiFetch<{
    accounts_created: number;
    contacts_created: number;
    opportunities_created: number;
    skipped_dupes: number;
    errors: string[] | null;
  }>(`${CRO_BASE}/ingest-leads`, { method: "POST", body: JSON.stringify(body) });
}

// ─── Winston Assist ──────────────────────────────────────────────────────────

export interface WinstonAssistResult {
  state: string[];
  problem: string;
  next_step: string;
  category: "RESEARCH" | "OUTREACH" | "BUILD" | "CLOSE";
  confidence: number;
  copyable_prompt: string;
  deal_id: string;
  deal_name: string;
  deal_score: number;
}

export async function fetchWinstonAssist(body: {
  deal_id: string;
  env_id: string;
  business_id: string;
}): Promise<WinstonAssistResult> {
  return apiFetch<WinstonAssistResult>(`${CRO_BASE}/winston/assist`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function applyAssistAsNextAction(body: {
  deal_id: string;
  env_id: string;
  business_id: string;
  description: string;
  action_type: string;
}): Promise<NextAction> {
  return createNextAction({
    env_id: body.env_id,
    business_id: body.business_id,
    entity_type: "opportunity",
    entity_id: body.deal_id,
    action_type: body.action_type,
    description: body.description,
    due_date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
    priority: "high",
  });
}


// ── App Intelligence ───────────────────────────────────────────────────────

export type AppOpportunityKind = "winston_backlog" | "consulting_offer" | "outreach_angle" | "demo_brief";
export type AppOpportunityStatus = "draft" | "ready" | "sent" | "exported" | "discarded";

export type AppInboxItem = {
  id: string;
  env_id: string;
  business_id: string;
  source: string | null;
  platform: string | null;
  app_name: string;
  category: string | null;
  search_term: string | null;
  url: string | null;
  raw_notes: string | null;
  screenshot_urls: string[];
  status: "raw" | "extracted" | "discarded";
  discarded_reason: string | null;
  discarded_at: string | null;
  processed_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type AppRecord = {
  id: string;
  env_id: string;
  business_id: string;
  inbox_item_id: string | null;
  app_name: string;
  target_user: string | null;
  core_workflow_input: string;
  core_workflow_process: string;
  core_workflow_output: string;
  pain_signals: string[];
  relevance_score: number;
  weakness_score: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  workflow_shape: string | null;
  top_pain_signal: string | null;
  linked_pattern_count: number;
  linked_opportunity_count: number;
  is_prime: boolean;
};

export type AppPatternEvidence = {
  app_record_id: string;
  app_name: string;
  workflow_shape: string;
  pain_signals: string[];
  contribution_note: string | null;
  auto_suggested: boolean;
  created_at: string | null;
};

export type SuggestedEvidence = AppPatternEvidence & {
  score: number;
};

export type AppPattern = {
  id: string;
  env_id: string;
  business_id: string;
  pattern_name: string;
  workflow_shape: string | null;
  industries_seen_in: string[];
  recurring_pain: string | null;
  bad_implementation_pattern: string | null;
  winston_module_opportunity: string | null;
  consulting_offer_opportunity: string | null;
  demo_idea: string | null;
  priority: "low" | "med" | "high";
  confidence: number;
  status: "draft" | "active" | "archived";
  notes: string | null;
  created_at: string;
  updated_at: string;
  evidence_count: number;
  linked_opportunity_count: number;
  evidence: AppPatternEvidence[];
};

export type AppPatternCreateResponse = {
  pattern: AppPattern;
  suggested_evidence: SuggestedEvidence[];
};

export type AppOpportunityDraft = {
  title: string;
  payload: Record<string, unknown>;
  must_edit_fields: string[];
};

export type AppOpportunity = {
  id: string;
  env_id: string;
  business_id: string;
  pattern_id: string | null;
  app_record_id: string | null;
  kind: AppOpportunityKind;
  title: string;
  payload: Record<string, unknown>;
  brief_markdown: string | null;
  status: AppOpportunityStatus;
  exported_to: string | null;
  exported_ref: string | null;
  created_at: string;
  updated_at: string;
  source_label: string | null;
  source_type: string | null;
};

export type AppOpportunityList = {
  sent_this_week_count: number;
  rows: AppOpportunity[];
};

export type AppScoreboard = {
  unconverted_patterns: number;
  prime_unsent: number;
  sent_this_week: number;
  avg_hours_inbox_to_opportunity: number | null;
  avg_hours_opportunity_to_sent: number | null;
};

export type AppWeeklyMemo = {
  id: string;
  env_id: string;
  business_id: string;
  period_start: string;
  period_end: string;
  summary_markdown: string;
  memo_payload: Record<string, unknown>;
  generated_at: string;
  generated_by: string | null;
};

function appIntelQuery(envId: string, businessId: string, extra?: Record<string, string | undefined>) {
  const params = new URLSearchParams({ env_id: envId, business_id: businessId });
  if (extra) {
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined) params.set(key, value);
    });
  }
  return params.toString();
}

export function fetchAppInbox(envId: string, businessId: string, status?: string) {
  return apiFetch<AppInboxItem[]>(`${CRO_BASE}/app-intelligence/inbox?${appIntelQuery(envId, businessId, { status })}`);
}

export function createAppInboxItem(envId: string, businessId: string, body: {
  source?: string;
  platform?: string;
  app_name: string;
  category?: string;
  search_term?: string;
  url?: string;
  raw_notes?: string;
  screenshot_urls?: string[];
  created_by?: string;
}) {
  return apiFetch<AppInboxItem>(`${CRO_BASE}/app-intelligence/inbox?${appIntelQuery(envId, businessId)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function discardAppInboxItem(envId: string, businessId: string, inboxItemId: string, reason: string) {
  return apiFetch<AppInboxItem>(`${CRO_BASE}/app-intelligence/inbox/${inboxItemId}/discard?${appIntelQuery(envId, businessId)}`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function extractAppRecord(envId: string, businessId: string, inboxItemId: string, body: {
  target_user?: string;
  core_workflow_input: string;
  core_workflow_process: string;
  core_workflow_output: string;
  pain_signals: string[];
  relevance_score?: number;
  weakness_score?: number;
  notes?: string;
}) {
  return apiFetch<AppRecord>(`${CRO_BASE}/app-intelligence/inbox/${inboxItemId}/extract?${appIntelQuery(envId, businessId)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchAppRecords(envId: string, businessId: string, opts?: { primeOnly?: boolean; unconverted?: boolean }) {
  return apiFetch<AppRecord[]>(`${CRO_BASE}/app-intelligence/records?${appIntelQuery(envId, businessId, {
    prime_only: opts?.primeOnly ? "true" : undefined,
    unconverted: opts?.unconverted ? "true" : undefined,
  })}`);
}

export function updateAppRecord(envId: string, businessId: string, recordId: string, body: Partial<Pick<AppRecord, "target_user" | "core_workflow_input" | "core_workflow_process" | "core_workflow_output" | "pain_signals" | "relevance_score" | "weakness_score" | "notes">>) {
  return apiFetch<AppRecord>(`${CRO_BASE}/app-intelligence/records/${recordId}?${appIntelQuery(envId, businessId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function fetchAppPatterns(envId: string, businessId: string) {
  return apiFetch<AppPattern[]>(`${CRO_BASE}/app-intelligence/patterns?${appIntelQuery(envId, businessId)}`);
}

export function createAppPattern(envId: string, businessId: string, body: {
  pattern_name: string;
  workflow_shape?: string;
  industries_seen_in?: string[];
  recurring_pain?: string;
  bad_implementation_pattern?: string;
  winston_module_opportunity?: string;
  consulting_offer_opportunity?: string;
  demo_idea?: string;
  priority?: "low" | "med" | "high";
  confidence?: number;
  status?: "draft" | "active" | "archived";
  notes?: string;
}) {
  return apiFetch<AppPatternCreateResponse>(`${CRO_BASE}/app-intelligence/patterns?${appIntelQuery(envId, businessId)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function linkAppPatternEvidence(envId: string, businessId: string, patternId: string, body: {
  app_record_id: string;
  contribution_note?: string;
  auto_suggested?: boolean;
  unlink?: boolean;
}) {
  return apiFetch<AppPattern>(`${CRO_BASE}/app-intelligence/patterns/${patternId}/evidence?${appIntelQuery(envId, businessId)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function draftAppOpportunity(envId: string, businessId: string, body: {
  kind: AppOpportunityKind;
  source_pattern_id?: string;
  source_app_record_id?: string;
}) {
  return apiFetch<AppOpportunityDraft>(`${CRO_BASE}/app-intelligence/converter/draft?${appIntelQuery(envId, businessId)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function convertAppPattern(envId: string, businessId: string, patternId: string, body: {
  kind: AppOpportunityKind;
  title: string;
  payload: Record<string, unknown>;
  status?: AppOpportunityStatus;
}) {
  return apiFetch<AppOpportunity>(`${CRO_BASE}/app-intelligence/patterns/${patternId}/convert?${appIntelQuery(envId, businessId)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function convertAppRecord(envId: string, businessId: string, recordId: string, body: {
  kind: AppOpportunityKind;
  title: string;
  payload: Record<string, unknown>;
  status?: AppOpportunityStatus;
}) {
  return apiFetch<AppOpportunity>(`${CRO_BASE}/app-intelligence/records/${recordId}/convert?${appIntelQuery(envId, businessId)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchAppOpportunities(envId: string, businessId: string, opts?: { kind?: AppOpportunityKind; status?: AppOpportunityStatus }) {
  return apiFetch<AppOpportunityList>(`${CRO_BASE}/app-intelligence/opportunities?${appIntelQuery(envId, businessId, {
    kind: opts?.kind,
    status: opts?.status,
  })}`);
}

export function updateAppOpportunity(envId: string, businessId: string, opportunityId: string, body: {
  title?: string;
  payload?: Record<string, unknown>;
  status?: AppOpportunityStatus;
}) {
  return apiFetch<AppOpportunity>(`${CRO_BASE}/app-intelligence/opportunities/${opportunityId}?${appIntelQuery(envId, businessId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function fetchAppScoreboard(envId: string, businessId: string) {
  return apiFetch<AppScoreboard>(`${CRO_BASE}/app-intelligence/scoreboard?${appIntelQuery(envId, businessId)}`);
}

export function generateAppWeeklyMemo(envId: string, businessId: string, body?: { generated_by?: string }) {
  return apiFetch<AppWeeklyMemo>(`${CRO_BASE}/app-intelligence/weekly-memo/generate?${appIntelQuery(envId, businessId)}`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function fetchLatestAppWeeklyMemo(envId: string, businessId: string) {
  return apiFetch<AppWeeklyMemo>(`${CRO_BASE}/app-intelligence/weekly-memo/latest?${appIntelQuery(envId, businessId)}`);
}
