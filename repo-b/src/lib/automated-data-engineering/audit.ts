"use client";

import { apiFetch } from "@/lib/api";
import { ADE_DEFAULT_BUSINESS_ID } from "./api";

// Audit Dashboard client (plan PR 3). Read-only over the existing audit tables,
// mounted under /api/ade/audit to reuse the committed ADE proxy.

export interface AuditTopTool {
  tool_name: string;
  call_count: number;
  avg_latency: number | null;
}

export interface CallsPerDay {
  day: string;
  calls: number;
  failed: number;
}

export interface AuditSummaryResponse {
  window_days: number;
  total_decisions: number;
  successful: number;
  failed: number;
  success_rate: number | null;
  avg_latency_ms: number | null;
  avg_grounding_score: number | null;
  high_grounding: number;
  mixed_grounding: number;
  low_grounding: number;
  top_tools: AuditTopTool[];
  calls_per_day: CallsPerDay[];
  estimated_cost_usd: number | null;
  cost_is_estimate: boolean;
  null_reason: string | null;
}

export interface DecisionRow {
  id: string | null;
  actor: string | null;
  decision_type: string | null;
  tool_name: string | null;
  model_used: string | null;
  latency_ms: number | null;
  grounding_score: number | null;
  grounding_low: boolean;
  success: boolean | null;
  error_message: string | null;
  created_at: string | null;
}

export interface DecisionsResponse {
  decisions: DecisionRow[];
  null_reason: string | null;
}

export interface DecisionDetail {
  id: string;
  actor: string | null;
  decision_type: string | null;
  tool_name: string | null;
  model_used: string | null;
  input_summary: Record<string, unknown> | null;
  output_summary: Record<string, unknown> | null;
  grounding_score: number | null;
  latency_ms: number | null;
  success: boolean | null;
  error_message: string | null;
  created_at: string | null;
  null_reason: string | null;
  [key: string]: unknown;
}

export const getAuditSummary = (biz: string = ADE_DEFAULT_BUSINESS_ID, env?: string) =>
  apiFetch<AuditSummaryResponse>("/api/ade/audit/summary", {
    params: env ? { business_id: biz, env_id: env } : { business_id: biz },
  });

export const getAuditDecisions = (
  biz: string = ADE_DEFAULT_BUSINESS_ID,
  opts: { env?: string; tool_name?: string; limit?: number } = {},
) =>
  apiFetch<DecisionsResponse>("/api/ade/audit/decisions", {
    params: {
      business_id: biz,
      env_id: opts.env,
      tool_name: opts.tool_name,
      limit: opts.limit ? String(opts.limit) : undefined,
    },
  });

export const getDecisionDetail = (id: string) =>
  apiFetch<DecisionDetail>(`/api/ade/audit/decisions/${encodeURIComponent(id)}`);
