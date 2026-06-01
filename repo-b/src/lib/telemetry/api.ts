"use client";

import { apiFetch } from "@/lib/api";

// The Phase 3 serving fixture tenant. The production telemetry env (provisioned via the v2
// pipeline) resolves its own business_id at page load; for the demo serving contract these are the
// seeded telemetry-demo identifiers. Centralized so no component hardcodes them inline.
export const TELEMETRY_DEMO_ENV_ID = "telemetry-demo";
export const TELEMETRY_DEMO_BUSINESS_ID = "7e1eb000-0000-4000-a000-000000000001";

export interface ReplayTick {
  t: number;
  value: number;
  rmean: number;
  score: number;
  model_pred: number;
  is_anomaly: number;
}

export interface ReplayFeed {
  channel: string;
  spacecraft: string;
  fixture_ticks: number;
  total_ticks_source: number;
  first_model_fire_t: number | null;
  model_fired_ticks: number;
  label_anomaly_ticks: number;
  provenance: {
    source_table: string;
    champion_model: string;
    champion_mlflow_run_id: string;
    note: string;
  };
  feed: ReplayTick[];
  null_reason?: string | null;
}

export interface ModelRun {
  model_name: string;
  model_kind: string;
  model_version: string;
  model_alias: string | null;
  mlflow_run_id: string;
  experiment_id: string | null;
  metrics: Record<string, number>;
  gate: Record<string, unknown>;
  promotion_state: string;
}

export interface MonitoringResponse {
  rolling_anomaly_rate: number | null;
  prediction_count: number;
  latest_model_name: string | null;
  latest_model_version: string | null;
  latest_model_alias: string | null;
  last_scored_at: string | null;
  psi: number | null;
  window_label: string;
  null_reason: string | null;
}

export interface TestRun {
  id: string;
  run_key: string;
  dataset: string;
  unit_or_channel: string;
  spacecraft: string | null;
  row_count: number;
  ingest_at: string | null;
  status: string;
  created_at: string;
}

export interface TelemetrySummary {
  inventory: Record<string, number>;
  kpi: {
    test_runs: number;
    predictions: number;
    anomaly_events: number;
    promoted_models: number;
    drift_monitors: number;
    anomaly_f1: number | null;
    rul_rmse: number | null;
    last_scored_at: string | null;
  };
  verdicts: Record<string, number>;
  verdict_pct: Record<string, number>;
  note: string;
}

export interface AnomalyEvent {
  channel_name: string | null;
  start_t: number | null;
  end_t: number | null;
  anomaly_class: string | null;
  confidence: number | null;
  source: string;
}

const params = (env: string, biz: string) => ({ env_id: env, business_id: biz });

export const getReplayFeed = () => apiFetch<ReplayFeed>("/api/telemetry/replay");

export const getModelPerformance = (env: string, biz: string) =>
  apiFetch<{ models: ModelRun[]; null_reason: string | null }>(
    "/api/telemetry/model-performance", { params: params(env, biz) });

export const getMonitoring = (env: string, biz: string) =>
  apiFetch<MonitoringResponse>("/api/telemetry/monitoring", { params: params(env, biz) });

export const getRuns = (env: string, biz: string) =>
  apiFetch<TestRun[]>("/api/telemetry/runs", { params: params(env, biz) });

export const getSummary = (env: string, biz: string) =>
  apiFetch<TelemetrySummary>("/api/telemetry/summary", { params: params(env, biz) });
