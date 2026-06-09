/**
 * Healthcare Subscription Analytics (hha) API client.
 * Backed by `backend/app/routes/hha.py`. SYNTHETIC / NO-PHI.
 *
 * Browser reads use the same-origin `/bos` proxy, which forwards to FastAPI.
 */

export interface HhaMetricDefinition {
  key: string;
  label: string;
  formula: string;
  grain: string;
  owner: string;
  source: string;
}

export type HhaKpiFormat = "currency" | "percent" | "ratio" | "months" | "hours" | "count";

export interface HhaKpi {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  fmt: HhaKpiFormat;
  definition: HhaMetricDefinition;
}

export interface HhaOverview {
  env_id: string;
  as_of_date: string | null;
  source_freshness_at: string | null;
  provenance_label: string | null;
  synthetic: boolean;
  phi: boolean;
  disclaimer: string;
  kpis: HhaKpi[];
}

export interface HhaHealth {
  ok: boolean;
  env_id: string;
  row_counts: Record<string, number>;
  source_freshness_at: string | null;
  provenance_label: string | null;
  synthetic: boolean;
  phi: boolean;
}

export interface HhaSurfaceResponse {
  env_id: string;
  as_of_date: string | null;
  source_freshness_at: string | null;
  provenance_label: string | null;
  synthetic: boolean;
  phi: boolean;
  disclaimer: string;
  definitions: HhaMetricDefinition[];
}

export interface HhaFunnelStage {
  stage_key: string;
  stage_label: string;
  stage_order: number;
  entered_count: number | null;
  converted_count: number | null;
  conversion_pct: number | null;
}

export interface HhaFunnelChannel {
  channel: string;
  cac_dollars: number | null;
  stages: HhaFunnelStage[];
}

export interface HhaFunnel extends HhaSurfaceResponse {
  blended_stages: HhaFunnelStage[];
  channels: HhaFunnelChannel[];
}

export interface HhaCohortCell {
  signup_cohort_month: string;
  months_since_signup: number;
  cohort_size: number;
  retained_count: number | null;
  retention_pct: number | null;
  ltv_dollars: number | null;
}

export interface HhaMaskedCohort {
  signup_cohort_month: string;
  channel: string;
  masked: true;
  reason: string;
}

export interface HhaChannelLtvCac {
  channel: string;
  ltv_dollars: number;
  cac_dollars: number;
  ratio: number;
}

export interface HhaCohorts extends HhaSurfaceResponse {
  cells: HhaCohortCell[];
  masked_cohorts: HhaMaskedCohort[];
  ltv_cac_by_channel: HhaChannelLtvCac[];
  ltv_cac_unavailable_reason: string | null;
}

export interface HhaOperationsDomain {
  ops_domain: string;
  metric_label: string | null;
  volume: number | null;
  sla_target_hours: number | null;
  sla_actual_p50_hours: number | null;
  sla_actual_p90_hours: number | null;
  sla_breach_pct: number | null;
  backlog_count: number | null;
  over_sla: boolean | null;
}

export interface HhaOperations extends HhaSurfaceResponse {
  domains: HhaOperationsDomain[];
}

// Browser calls always route through the same-origin /bos proxy.
const API_BASE = "/bos";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[hha-client] ${path} failed:`, err);
    return null;
  }
}

export function fetchHhaOverview(envId: string): Promise<HhaOverview | null> {
  return getJson<HhaOverview>(
    `/api/hha/v1/overview?env_id=${encodeURIComponent(envId)}`,
  );
}

export function fetchHhaHealth(envId: string): Promise<HhaHealth | null> {
  return getJson<HhaHealth>(
    `/api/hha/v1/health?env_id=${encodeURIComponent(envId)}`,
  );
}

export function fetchHhaFunnel(envId: string): Promise<HhaFunnel | null> {
  return getJson<HhaFunnel>(
    `/api/hha/v1/funnel?env_id=${encodeURIComponent(envId)}`,
  );
}

export function fetchHhaCohorts(envId: string): Promise<HhaCohorts | null> {
  return getJson<HhaCohorts>(
    `/api/hha/v1/cohorts?env_id=${encodeURIComponent(envId)}`,
  );
}

export function fetchHhaOperations(envId: string): Promise<HhaOperations | null> {
  return getJson<HhaOperations>(
    `/api/hha/v1/operations?env_id=${encodeURIComponent(envId)}`,
  );
}
