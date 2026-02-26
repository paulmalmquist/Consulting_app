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
