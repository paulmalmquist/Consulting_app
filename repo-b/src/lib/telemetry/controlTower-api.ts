"use client";

import { apiFetch } from "@/lib/api";
import { TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID } from "./api";

const BASE = "/api/telemetry/control-tower";

export interface Decision {
  id: string;
  env_id: string;
  run_key: string;
  channel_name: string;
  verdict: string;
  anomaly_score: number | null;
  threshold: number | null;
  triage_summary: string | null;
  privacy: string | null;
  itar_tagged: boolean;
  dispatch_provider: string | null;
  dispatch_model: string | null;
  dispatch_status: string | null;
  routing_reason: string | null;
  routing_rejected: Record<string, string>;
  triage_cost_usd: number | null;
  status: string;
  human_decision: string | null;
  human_rationale: string | null;
  requested_evidence: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  signed_receipt_id: string | null;
  created_at: string | null;
}

export interface Receipt {
  id: string;
  chain_seq: number;
  prev_receipt_hash: string | null;
  payload_hash: string;
  payload: Record<string, unknown>;
  signature: string;
  public_key_id: string;
  algo: string;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  receipt_id?: string;
  chain_seq?: number;
  hash_valid?: boolean;
  signature_valid?: boolean;
  key_matches?: boolean;
  chain_intact?: boolean;
  chain_reason?: string | null;
  public_key_id?: string;
  algo?: string;
}

export interface GemmaState {
  status: string; // cold | warming_requested | warming | live | teardown_requested | tearing_down | torn_down | failed | unavailable
  endpoint_id: string | null;
  dedicated_dns: string | null;
  region: string | null;
  project_id: string | null;
  model_id: string | null;
  deployed_model_count: number;
  teardown_verification: string | null;
  est_active_cost_usd: number;
  last_warmed_at: string | null;
  last_teardown_at: string | null;
  last_probe_at: string | null;
  idle_since: string | null;
  last_error: string | null;
  lifecycle_enabled: boolean;
  confirm_tokens: { warm: string; teardown: string };
}

const env = TELEMETRY_DEMO_ENV_ID;
const biz = TELEMETRY_DEMO_BUSINESS_ID;
const scope = { env_id: env, business_id: biz };

const post = <T>(path: string, body: Record<string, unknown>) =>
  apiFetch<T>(`${BASE}${path}`, { method: "POST", body: JSON.stringify(body) });

export const listDecisions = () =>
  apiFetch<{ decisions: Decision[] }>(`${BASE}/decisions`, { params: scope });

export const scoreAndGate = (body: {
  run_key: string;
  channel_name: string;
  window: { t: number; value: number }[];
  itar_tagged: boolean;
  execute_triage?: boolean;
}) => post<Decision>("/score-and-gate", { ...scope, ...body });

export const resolveDecision = (
  decisionId: string,
  body: { human_decision: string; rationale?: string; requested_evidence?: string },
) => post<{ decision: Decision; receipt: Receipt | null }>(`/decisions/${decisionId}/resolve`, { ...scope, ...body });

export const verifyReceipt = (receiptId: string) =>
  apiFetch<VerifyResult>(`${BASE}/receipts/${receiptId}/verify`, { params: scope });

export const getGemmaState = () =>
  apiFetch<GemmaState>(`${BASE}/gemma-tier`, { params: scope });

export const probeGemma = () => post<GemmaState>("/gemma-tier/probe", { ...scope });

export const warmGemma = (confirm: string) => post<{ job_id: string; status: string }>("/gemma-tier/warm", { ...scope, confirm });

export const teardownGemma = (confirm: string) =>
  post<{ job_id: string; status: string }>("/gemma-tier/teardown", { ...scope, confirm });

export const getPublicKey = () =>
  apiFetch<{ public_key_hex: string; public_key_id: string; algo: string }>(`${BASE}/public-key`, {});
