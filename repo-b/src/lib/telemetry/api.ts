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

export interface ConformalBudget {
  alpha: number | null;
  measured_false_alarm_rate: number | null;
  calib_coverage: number | null;
  threshold_quantile: number | null;
  frozen_k: number | null;
  status: string | null;   // within | approaching | over (diagnostic only)
}

export interface StreamBlock {
  status: string | null;        // fresh | stale | failed | unknown
  as_of_ts: string | null;
  reason: string | null;
  last_frame_at: string | null;
  rows_per_min: number | null;
  failing_assertions: number | null;
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
  conformal_budget?: ConformalBudget | null;
  stream?: StreamBlock | null;
  null_reason: string | null;
}

// ── RS Demo: Model Registry console (display-only) ─────────────────────────────
export interface RegistryModel {
  model_name: string;
  model_kind: string;
  model_version: string | null;
  model_alias: string | null;
  mlflow_run_id: string | null;
  experiment_id: string | null;
  metrics: Record<string, unknown>;
  gate: Record<string, unknown>;
  promotion_state: string;
  created_at: string | null;
}

export interface RegistryResponse {
  models: RegistryModel[];
  drift: Record<string, { psi: number | null; window_label: string | null; computed_at: string }[]>;
  lifecycle: { ts: string | null; text: string; model_kind: string | null }[];
  null_reason: string | null;
}

export const getRegistry = (env: string, biz: string) =>
  apiFetch<RegistryResponse>("/api/telemetry/registry", {
    params: { env_id: env, business_id: biz },
  });

// ── RS Demo: Factory & NCR Intelligence (display-only mirror of the Databricks pipeline) ──
export interface NcrCluster {
  cluster_id: number;
  label: string;
  keywords: string[];
  exemplars: { ncr_key: string; workcell: string; severity: string; summary: string }[];
  n_records: number;
  status: string;                  // rising | flat | declining (declared slope thresholds)
  trend: number[];                 // trailing 8 weekly counts, oldest first
  median_ttc_days: number | null;
  reopen_rate: number | null;
  mlflow_run_id: string | null;
  provenance: string;              // databricks | local_fallback
}

export interface NcrPoint {
  ncr_key: string;
  x: number | null;                // real UMAP coordinates — never render-time jitter
  y: number | null;
  cluster_id: number | null;       // -1 = noise
  severity: string | null;
}

export interface NcrParetoRow {
  family: string;
  cluster_id: number;
  n: number;
  cum_pct: number;
}

export interface NcrBacklogRow {
  week_start: string;
  kind: string;                    // history | forecast
  opened: number | null;
  closed: number | null;
  backlog: number | null;
  fc: number | null;
  lo: number | null;
  hi: number | null;
}

export interface NcrBacktest {
  mae: number | null;
  mae_naive: number | null;
  mape_pct: number | null;
  mape_naive_pct: number | null;
  skill_vs_naive: number | null;
  backtest_folds: number | null;
}

export interface NcrKpis {
  open_now: number | null;
  open_weeks_ago: number | null;
  median_ttc_days: number | null;
  reopen_rate: number | null;
  clusters_rising: number;
  rising_labels: string[];
  n_records: number;
}

export interface NcrResponse {
  kpis: NcrKpis | null;
  clusters: NcrCluster[];
  points: NcrPoint[];
  pareto: NcrParetoRow[];
  backlog: { history: NcrBacklogRow[]; forecast: NcrBacklogRow[]; backtest: NcrBacktest | null };
  provenance: {
    provenance: string | null;
    batch_id: string | null;
    cluster_mlflow_run_id: string | null;
    forecast_mlflow_run_id: string | null;
    experiment_id: string | null;
  } | null;
  null_reason: string | null;
}

export const getNcr = (env: string, biz: string) =>
  apiFetch<NcrResponse>("/api/telemetry/ncr", {
    params: { env_id: env, business_id: biz },
  });

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

export interface FusedVectorInfo {
  available: boolean;
  null_reason?: string;
  vector_dim?: number;
  n_channels?: number;
  features_per_channel?: number;
  feature_names?: string[];
  channels?: string[];
  d4_included?: boolean;
  fused_vectors?: number;
  anomalous_test_vectors?: number;
  model?: string;
  alignment?: string;
  source?: string;
}

export const getFusedVectorInfo = (env: string, biz: string) =>
  apiFetch<FusedVectorInfo>("/api/telemetry/fused-vector-info", { params: params(env, biz) });
