"use client";

import { apiFetch } from "@/lib/api";

// Typed client for the read-only AI Provider Dispatch admin surface. Hits the
// GET-only `ai-dispatch` proxy — there is intentionally no run()/route() here,
// so the admin panel cannot trigger a provider call.

export interface ProviderInfo {
  name: string;
  display_name: string;
  default_model: string;
  allowed_modes: string[];
  max_risk: string;
  max_privacy: string;
  fallback_allowed: boolean;
  implemented: boolean;
  available: boolean;
  missing_env: string[];
}

export interface ProvidersResponse {
  providers: ProviderInfo[];
}

export interface RunRow {
  id?: string;
  actor?: string | null;
  decision_type?: string | null;
  tool_name?: string | null;
  model_used?: string | null;
  latency_ms?: number | null;
  confidence?: number | null;
  success?: boolean | null;
  tags?: string[];
  output_summary?: unknown;
  created_at?: string | null;
}

export interface RunsResponse {
  runs: RunRow[];
  count: number;
}

export interface EvalCase {
  name: string;
  mode: string;
  risk: string;
  expect_status: string | null;
  expect_null_reason: string | null;
  got_status: string;
  got_provider: string | null;
  got_null_reason: string | null;
  passed: boolean;
}

export interface EvalsResponse {
  suite: string;
  total: number;
  passed: number;
  failed: number;
  cases: EvalCase[];
  note: string;
}

export const getProviders = () => apiFetch<ProvidersResponse>("/api/ai-dispatch/providers");

export const getRuns = (envId?: string) =>
  apiFetch<RunsResponse>("/api/ai-dispatch/runs", {
    params: envId ? { env_id: envId } : undefined,
  });

export const getEvals = () => apiFetch<EvalsResponse>("/api/ai-dispatch/evals");
