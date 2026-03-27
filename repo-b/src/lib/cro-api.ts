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

export function advanceOpportunityStage(body: {
  env_id: string;
  business_id: string;
  opportunity_id: string;
  to_stage_key: string;
  note?: string;
}) {
  return apiFetch<{ crm_opportunity_id: string; name: string; status: string }>(
    `${CRO_BASE}/pipeline/advance`,
    { method: "POST", body: JSON.stringify(body) },
  );
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
