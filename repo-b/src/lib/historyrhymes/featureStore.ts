/**
 * Client for the Feature Foundry (feature store) API.
 *
 * Same direct-to-FastAPI convention as lib/historyrhymes/mlDemo.ts
 * (NEXT_PUBLIC_API_BASE, no proxy). Paths are /api/hr/v1/ml-demo/features* —
 * the /api/historyrhymes/* namespace is forbidden by the HR contract test.
 * Single-feature lookup is /features/by-id/{feature_id} (never a bare dynamic
 * segment). Reuses ExternalResourceLink / Lineage types from mlDemo.ts.
 */

import type { ExternalResourceLink, Lineage } from "@/lib/historyrhymes/mlDemo";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
const ROOT = "/api/hr/v1/ml-demo";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[feature-store] ${path} failed:`, err);
    return null;
  }
}

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type LeakageRisk = "low" | "medium" | "high";

export interface FeatureSummary {
  feature_id: string;
  name: string;
  family: string;
  leakage_risk: LeakageRisk | null;
  models_using: string[];
}

export interface FeatureOverview {
  title: string;
  subtitle: string;
  lesson: string;
  closer: string;
  feature_count: number;
  family_count: number;
  families: Array<{ family: string; feature_count: number }>;
  signature_features: string[];
  features: FeatureSummary[];
  cloud_provider: string;
  evidence: { seed: number; model_obs_version: string; source: string };
}

export interface Readiness {
  score: number;
  degrade_reasons: string[];
}

export interface ImportanceEntry {
  model: string;
  importance?: number;
  coefficient?: number;
  coefficient_abs?: number;
}

export interface TransformationPoint {
  as_of: string;
  value: number | null;
}

export interface FeatureDetail {
  feature_id: string;
  name: string;
  status: "ok" | "not_available";
  null_reason: string | null;
  family: string | null;
  definition: string | null;
  formula: string | null;
  source_dependencies: string[];
  cadence: string | null;
  availability_at_prediction_time: boolean | null;
  leakage_risk: LeakageRisk | null;
  imputation_policy: string | null;
  models_using: string[];
  demo_explanation: string | null;
  quant_slot: string | null;
  current_value: number | null;
  current_percentile: number | null;
  transformation_example: { before?: TransformationPoint[]; after?: TransformationPoint[] };
  readiness: Readiness | Record<string, never>;
  missingness: { rate?: number; policy_visible?: boolean; imputation_policy?: string | null };
  importance_across_models: ImportanceEntry[];
  evidence: { seed: number; model_obs_version: string; source: string };
  external_links: ExternalResourceLink[];
  lineage: Lineage | Record<string, never>;
}

export interface QualityBoardRow {
  feature_id: string;
  family: string;
  freshness_status: string;
  missingness_rate: number;
  drift_status: string;
  leakage_risk: LeakageRisk;
  leakage_blocked: boolean;
  lineage_present: boolean;
  models_using_count: number;
  readiness_score: number;
  readiness_degrade_reasons: string[];
}

export interface QualityBoard {
  dimensions: string[];
  families: string[];
  features: QualityBoardRow[];
  grid: Record<string, Record<string, unknown>>;
}

export interface PipelineMap {
  nodes: Array<{ layer: string; label: string; detail: string }>;
  model_obs_version: string;
  note: string;
}

export interface ImportanceMap {
  importance: Record<string, ImportanceEntry[]>;
}

/* ── Fetchers ─────────────────────────────────────────────────────────────── */

export function fetchFeatureOverview(): Promise<FeatureOverview | null> {
  return getJson<FeatureOverview>(`${ROOT}/features`);
}

export function fetchFeatureQualityBoard(): Promise<QualityBoard | null> {
  return getJson<QualityBoard>(`${ROOT}/features/quality-board`);
}

export function fetchFeaturePipelineMap(): Promise<PipelineMap | null> {
  return getJson<PipelineMap>(`${ROOT}/features/pipeline-map`);
}

export function fetchFeatureImportance(): Promise<ImportanceMap | null> {
  return getJson<ImportanceMap>(`${ROOT}/features/importance`);
}

export function fetchFeatureDetail(featureId: string): Promise<FeatureDetail | null> {
  return getJson<FeatureDetail>(`${ROOT}/features/by-id/${encodeURIComponent(featureId)}`);
}
