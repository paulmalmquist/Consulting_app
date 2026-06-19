/**
 * Client for the ML Algorithm Decision Lab API.
 *
 * Same direct-to-FastAPI convention as lib/historyrhymes/client.ts
 * (NEXT_PUBLIC_API_BASE, no Next.js proxy). Paths are /api/hr/v1/ml-demo/* —
 * the /api/historyrhymes/* namespace is forbidden by the HR contract test.
 *
 * Kept in its own module so the large surface (Reality Mode + cloud lineage)
 * stays out of the frozen client.ts contract.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[ml-demo] ${path} failed:`, err);
    return null;
  }
}

async function sendJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[ml-demo] POST ${path} failed:`, err);
    return null;
  }
}

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type AlgorithmStatus = "ok" | "not_available";

export type TaskType =
  | "regression"
  | "classification"
  | "text_classification"
  | "clustering"
  | "dim_reduction";

export interface FitScoreDimensions {
  interpretability: number;
  handles_nonlinearity: number;
  handles_high_dim: number;
  training_speed: number;
  robust_to_outliers: number;
  needs_scaling: number;
}

export interface ModelCard {
  best_for: string;
  not_for: string;
  preprocessing: string;
  limitations: string;
  decision_this_informs: string;
  recommended_when: string;
  avoid_when: string;
  fit_score_dimensions: FitScoreDimensions;
}

export interface ExternalResourceLink {
  provider: "gcp" | "databricks" | "none";
  label: string;
  resourceType: string;
  href: string | null;
  copyValue?: string;
  unavailableReason?: string;
}

export interface Lineage {
  source_tables: Array<{
    name: string;
    grain: string;
    freshness: string;
    external_links: ExternalResourceLink[];
  }>;
  transform_steps: Array<{ name: string; type: string; description: string }>;
  model_artifacts: Array<{
    name: string;
    version: string;
    external_links: ExternalResourceLink[];
  }>;
}

export interface AlgorithmResult {
  algorithm_id: string;
  name: string;
  status: AlgorithmStatus;
  null_reason: string | null;
  task_type: TaskType | null;
  business_question: string | null;
  dataset: Record<string, unknown>;
  metrics: Record<string, number | number[] | null>;
  charts: Record<string, unknown>;
  model_card: ModelCard | Record<string, never>;
  evidence: { seed: number; model_version: string; source: string };
  external_links: ExternalResourceLink[];
  lineage: Lineage | Record<string, never>;
  reality?: RealityOverlay;
}

export interface RealityOverlay {
  active_toggles: string[];
  notes: string[];
  mutations?: Record<string, Record<string, unknown>>;
  cost_of_error?: Record<string, number | string>;
  leakage?: Record<string, string>;
  policy?: Record<string, unknown>;
  latency?: { estimated_ms: number; budget_ms: number; eligible: boolean; note: string };
  freshness?: Record<string, unknown>;
  drift?: Record<string, unknown>;
  analogs?: Record<string, unknown>;
  outliers?: Record<string, unknown>;
  directional_read?: string;
}

export interface Curveball {
  id: string;
  label: string;
  kind: string;
  ui_group: string;
  description: string;
  demo_lesson: string;
  affects: string[];
}

export interface HeadlineMetric {
  label: string;
  value: number | null;
}

export interface CompareRow {
  algorithm_id: string;
  name: string;
  task_type: TaskType | null;
  status: AlgorithmStatus;
  fit_score_dimensions: FitScoreDimensions;
  headline_metric: HeadlineMetric;
}

export interface Overview {
  title: string;
  subtitle: string;
  lesson: string;
  hero_metrics: {
    n_rows: number;
    n_features: number;
    algorithms_available: number;
    algorithms_total: number;
    best_regression: { name: string | null; headline: HeadlineMetric | null };
    best_classification: { name: string | null; headline: HeadlineMetric | null };
    data_freshness: string;
  };
  task_families: Record<string, number>;
  algorithms: Array<{
    algorithm_id: string;
    name: string;
    task_type: TaskType;
    status: AlgorithmStatus;
    headline_metric: HeadlineMetric;
    business_question: string;
  }>;
  how_to_choose: Array<{ need: string; use: string }>;
  demo_script: {
    three_minute: string[];
    eight_minute: string[];
    interview_talk_track: string[];
  };
  cloud_provider: string;
  evidence: { seed: number; model_version: string; source: string };
}

export interface DatasetProfile {
  n_rows: number;
  n_features: number;
  seed: number;
  source: string;
  as_of_range: [string, string];
  columns: Array<{ name: string; dtype: string; role: string; missingness: number }>;
  numeric_summary: Record<string, { min: number; max: number; mean: number; std: number }>;
  class_balance: {
    risk_event_30d: { positive: number; negative: number; positive_rate: number };
    theme: Record<string, number>;
  };
  episodes: Array<{ id: string; name: string; is_crisis: boolean }>;
}

export interface CloudConfig {
  provider: string;
  label: string;
  available_link_types: string[];
  bigquery_dataset?: string | null;
  gcp_project_id?: string | null;
  databricks_workspace_url?: string | null;
  configured: boolean;
}

export interface Scenario {
  toggles: string[];
  fp_cost?: number;
  fn_cost?: number;
  split_mode?: string;
  confidence_threshold?: number;
  latency_budget_ms?: number;
}

/* ── Scenario → query string ─────────────────────────────────────────────── */

export function scenarioQuery(scenario?: Scenario | null): string {
  if (!scenario || !scenario.toggles || scenario.toggles.length === 0) return "";
  const params = new URLSearchParams();
  for (const t of scenario.toggles) params.append("toggle", t);
  if (scenario.fp_cost != null) params.set("fp_cost", String(scenario.fp_cost));
  if (scenario.fn_cost != null) params.set("fn_cost", String(scenario.fn_cost));
  if (scenario.split_mode) params.set("split_mode", scenario.split_mode);
  if (scenario.confidence_threshold != null)
    params.set("confidence_threshold", String(scenario.confidence_threshold));
  if (scenario.latency_budget_ms != null)
    params.set("latency_budget_ms", String(scenario.latency_budget_ms));
  return `?${params.toString()}`;
}

/* ── Fetchers ─────────────────────────────────────────────────────────────── */

const ROOT = "/api/hr/v1/ml-demo";

export function fetchMlOverview(): Promise<Overview | null> {
  return getJson<Overview>(`${ROOT}/overview`);
}

export function fetchMlDataset(): Promise<DatasetProfile | null> {
  return getJson<DatasetProfile>(`${ROOT}/dataset`);
}

export function fetchMlAlgorithms(
  scenario?: Scenario | null,
): Promise<{ algorithms: AlgorithmResult[]; disagreement?: Record<string, unknown> } | null> {
  return getJson(`${ROOT}/algorithms${scenarioQuery(scenario)}`);
}

export function fetchMlAlgorithm(
  id: string,
  scenario?: Scenario | null,
): Promise<AlgorithmResult | null> {
  return getJson<AlgorithmResult>(`${ROOT}/algorithms/${encodeURIComponent(id)}${scenarioQuery(scenario)}`);
}

export function fetchMlCompare(
  scenario?: Scenario | null,
): Promise<{ dimensions: string[]; rows: CompareRow[] } | null> {
  return getJson(`${ROOT}/compare${scenarioQuery(scenario)}`);
}

export function fetchCurveballs(): Promise<{ curveballs: Curveball[] } | null> {
  return getJson(`${ROOT}/curveballs`);
}

export function fetchCloudConfig(): Promise<CloudConfig | null> {
  return getJson<CloudConfig>(`${ROOT}/cloud-config`);
}

export function runMlAlgorithm(
  id: string,
  scenario?: Scenario | null,
): Promise<AlgorithmResult | null> {
  return sendJson<AlgorithmResult>(`${ROOT}/run`, { algorithm_id: id, scenario: scenario ?? null });
}
