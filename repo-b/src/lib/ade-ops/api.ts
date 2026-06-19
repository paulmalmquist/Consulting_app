"use client";

import { apiFetch } from "@/lib/api";

// Typed client for the ADE Ops Orchestrator read-only surface. Hits the
// `ade-ops` proxy (independent of the deletable ADE product surface).

export interface OpsSkill {
  name: string;
  family: string;
  description: string;
  risk_tier: number;
  risk_tier_name: string;
  mode: string;
  executable: boolean;
  approval_required: boolean;
  permission_required: string;
  lane: string;
  input_fields: string[];
}

export interface SkillsResponse {
  skills: OpsSkill[];
  risk_tiers: Record<string, string>;
  executable_max_tier: number;
  null_reason: string | null;
}

export interface Evidence {
  label: string;
  value: unknown;
  source: string;
  as_of: string | null;
}

export interface RunResult {
  name: string;
  risk_tier: number;
  mode: string;
  status: "ok" | "degraded" | "blocked";
  recommendation: string | null;
  confidence: string | null;
  evidence: Evidence[];
  null_reason: string | null;
  approval_required: boolean;
  receipt_id: string | null;
  receipt_status: string;
}

export interface RunRow {
  receipt_id: string | null;
  skill: string | null;
  actor: string | null;
  success: boolean | null;
  confidence: number | null;
  tags: string[];
  output_summary: unknown;
  created_at: string | null;
}

export interface RunsResponse {
  runs: RunRow[];
  null_reason: string | null;
}

export const getSkills = () => apiFetch<SkillsResponse>("/api/ade-ops/skills");

export const getRuns = (businessId: string, envId?: string) =>
  apiFetch<RunsResponse>("/api/ade-ops/runs", {
    params: envId ? { business_id: businessId, env_id: envId } : { business_id: businessId },
  });

export const runSkill = (skill: string, inputs: Record<string, unknown>, businessId?: string, envId?: string) =>
  apiFetch<RunResult>("/api/ade-ops/run", {
    method: "POST",
    body: JSON.stringify({ skill, inputs, business_id: businessId, env_id: envId }),
  });

// ── Approval escrow + execution preflight (PR 5A) ────────────────────────────
// The control spine. Nothing here executes a provider write — `attemptExecute`
// hits a gate that always returns blocked in PR 5A.

export type ApprovalStateName = "pending" | "approved" | "expired" | "blocked";

export interface PreflightResult {
  passed: boolean;
  missing: string[];
  checked: string[];
}

export interface ApprovalRequest {
  approval_id: string;
  recommendation_id: string;
  command_name: string;
  category: string | null;
  provider: string | null;
  target_ref: string | null;
  target_type: string | null;
  risk_tier: number;
  approval_token: string;
  state: ApprovalStateName;
  requested_by: string | null;
  approver: string | null;
  approved_at: string | null;
  requested_at: string;
  expires_at: string;
  rollback_plan: string | null;
  observation_window: string | null;
  evidence: Evidence[];
  preflight: PreflightResult | null;
  executed: boolean;
  execution_mode: "simulation" | "nonprod" | "prod" | null;
  executed_at: string | null;
  observation_window_opened_at: string | null;
  rolled_back: boolean;
  rolled_back_at: string | null;
  // PR 5C: the one real action's audit trail (Snowflake auto_suspend).
  action_kind: string | null;
  before_value: string | null;
  after_value: string | null;
  generated_sql_hash: string | null;
  rollback_sql_hash: string | null;
  null_reason: string | null;
}

export interface ApprovalsResponse {
  approvals: ApprovalRequest[];
  null_reason: string | null;
}

// PR 5B: execute runs the SIMULATED ceremony. executed:true only for simulation;
// real modes are blocked (no real executor until PR 5C).
export interface ExecuteResponse {
  approval: ApprovalRequest;
  execution: {
    outcome: "simulated" | "blocked";
    executed: boolean;
    execution_mode: "simulation" | null;
    executed_at?: string;
    observation_window_opened_at?: string;
    simulated_plan?: string[];
    reason: string;
    note?: string;
  };
}

export interface RollbackResponse {
  approval: ApprovalRequest;
  rollback: {
    outcome: "simulated" | "blocked";
    execution_mode?: "simulation" | null;
    rolled_back?: boolean;
    rolled_back_at?: string;
    simulated_plan?: string[];
    reason: string;
  };
}

export const listApprovals = (businessId: string, envId?: string) =>
  apiFetch<ApprovalsResponse>("/api/ade-ops/approvals", {
    params: envId ? { business_id: businessId, env_id: envId } : { business_id: businessId },
  });

export const createApproval = (
  recommendation: Record<string, unknown>,
  businessId: string,
  envId?: string,
  opts?: { rollback_plan?: string; observation_window?: string; ttl_seconds?: number },
) =>
  apiFetch<ApprovalRequest>("/api/ade-ops/approvals", {
    method: "POST",
    body: JSON.stringify({ recommendation, business_id: businessId, env_id: envId, ...opts }),
  });

export const approveApproval = (
  approvalId: string,
  approver: string,
  approvalToken: string,
  businessId: string,
  envId?: string,
) =>
  apiFetch<ApprovalRequest>(`/api/ade-ops/approvals/${approvalId}/approve`, {
    method: "POST",
    body: JSON.stringify({ approver, approval_token: approvalToken, business_id: businessId, env_id: envId }),
  });

export const preflightApproval = (approvalId: string, businessId: string, envId?: string) =>
  apiFetch<ApprovalRequest>(`/api/ade-ops/approvals/${approvalId}/preflight`, {
    method: "POST",
    body: JSON.stringify({ business_id: businessId, env_id: envId }),
  });

// PR 5B: runs the SIMULATED execution ceremony. Defaults to simulation; a real
// mode is blocked server-side. Never touches a provider.
export const simulateExecute = (
  approvalId: string,
  businessId: string,
  envId?: string,
  executionMode: "simulation" | "nonprod" | "prod" = "simulation",
) =>
  apiFetch<ExecuteResponse>(`/api/ade-ops/approvals/${approvalId}/execute`, {
    method: "POST",
    body: JSON.stringify({ business_id: businessId, env_id: envId, execution_mode: executionMode }),
  });

// PR 5B: records a simulated rollback. Touches no provider.
export const simulateRollback = (approvalId: string, businessId: string, envId?: string) =>
  apiFetch<RollbackResponse>(`/api/ade-ops/approvals/${approvalId}/rollback`, {
    method: "POST",
    body: JSON.stringify({ business_id: businessId, env_id: envId }),
  });

// ── Incident state machine (PR 6B) — records + remediation; never act ────────

export type IncidentStateName =
  | "detected"
  | "triaged"
  | "owner_notified"
  | "mitigation_planned"
  | "resolved"
  | "closed";

export interface Incident {
  id: string | null;
  approval_id: string | null;
  source_verdict: string | null;
  provider: string | null;
  target_ref: string | null;
  recommendation_id: string | null;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  state: IncidentStateName;
  owner: string | null;
  mitigation_plan: string | null;
  resolution_note: string | null;
  evidence: Evidence[];
}

export interface IncidentsResponse {
  incidents: Incident[];
  null_reason: string | null;
}

export const getIncidents = (businessId: string, envId?: string) =>
  apiFetch<IncidentsResponse>("/api/ade-ops/incidents", {
    params: envId ? { business_id: businessId, env_id: envId } : { business_id: businessId },
  });
