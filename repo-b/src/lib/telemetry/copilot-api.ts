"use client";

import { apiFetch } from "@/lib/api";
import { TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID } from "./api";

export interface EvidenceItem {
  type: string;
  id: string | null;
  label: string;
  value: unknown;
  metadata: Record<string, unknown>;
}

export interface ToolTraceItem {
  tool_name: string;
  status: string;          // success | error | skipped
  args: Record<string, unknown>;
  result_summary: string;
  duration_ms: number;
}

export interface CopilotResponse {
  answer: string;
  evidence: EvidenceItem[];
  tool_trace: ToolTraceItem[];
  null_reason: string | null;
  is_refusal: boolean;
  intent: string | null;
  answer_source: string;   // live_llm | fallback_template | refusal
  prompt_version: string;
  model: string;
  draft_report_md: string | null;
  request_id: string;
}

export interface GovernanceSummary {
  total_interactions: number;
  refusal_rate: number | null;
  grounded_rate: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  answer_source_mix: Record<string, number>;
  null_reason_breakdown: Record<string, number>;
  active_prompt_version: string;
  active_model: string;
  allow_list: string[];
  refusal_rule_count: number;
  null_reason: string | null;
}

// NOTE: do NOT set a content-type header here. apiFetch already sets `Content-Type:
// application/json`; adding a lowercase `content-type` produced a DUPLICATE header
// (`content-type: application/json, application/json`) under undici/fetch, which mangled the JSON
// body — the backend received a non-dict and returned a 422 (model_attributes_type). Matching the
// other working POST callers (they pass only method + body) fixes it.
const jsonPost = <T>(path: string, body: Record<string, unknown>) =>
  apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const explainVerdict = (args: { run_key: string; fire_tick: number; verdict?: string; channel?: string }) =>
  jsonPost<CopilotResponse>("/api/telemetry/copilot/explain-verdict", {
    env_id: TELEMETRY_DEMO_ENV_ID,
    business_id: TELEMETRY_DEMO_BUSINESS_ID,
    run_key: args.run_key,
    fire_tick: args.fire_tick,
    verdict: args.verdict ?? "NO_GO",
    channel: args.channel ?? null,
  });

export const askCopilot = (question: string, context?: Record<string, unknown>) =>
  jsonPost<CopilotResponse>("/api/telemetry/copilot/ask", {
    env_id: TELEMETRY_DEMO_ENV_ID,
    business_id: TELEMETRY_DEMO_BUSINESS_ID,
    question,
    context: context ?? null,
  });

export const getGovernance = () =>
  apiFetch<GovernanceSummary>("/api/telemetry/copilot/governance", {
    params: { env_id: TELEMETRY_DEMO_ENV_ID, business_id: TELEMETRY_DEMO_BUSINESS_ID },
  });

// ── Phase 7: Test Report Workflow ──────────────────────────────────────────────
export interface DraftReportResponse {
  report_id: string | null;
  review_status: string | null;       // requires_human_review
  null_reason: string | null;
  generated_markdown: string | null;
  evidence: EvidenceItem[];
  prompt_version: string;
  run_key?: string;
  receipt_id?: string;
  verdict?: string;
  anomaly_score?: number;
  threshold?: number;
  champion_model?: string;
  model_version?: string;
  mlflow_run_id?: string;
}

export const draftReport = (args: { run_key: string; fire_tick: number; channel?: string }) =>
  jsonPost<DraftReportResponse>("/api/telemetry/copilot/draft-report", {
    env_id: TELEMETRY_DEMO_ENV_ID,
    business_id: TELEMETRY_DEMO_BUSINESS_ID,
    run_key: args.run_key,
    fire_tick: args.fire_tick,
    channel: args.channel ?? null,
  });

export const getReport = (reportId: string) =>
  apiFetch<{ report: Record<string, unknown> | null; null_reason: string | null }>(
    `/api/telemetry/copilot/report/${reportId}`,
    { params: { env_id: TELEMETRY_DEMO_ENV_ID, business_id: TELEMETRY_DEMO_BUSINESS_ID } });
