/**
 * Healthcare Subscription Analytics (hha) API client.
 * Backed by `backend/app/routes/hha.py`. SYNTHETIC / NO-PHI.
 *
 * Direct-to-FastAPI via NEXT_PUBLIC_API_BASE — the same convention the History
 * Rhymes env uses; there is intentionally no Next.js proxy route for /api/hha/*.
 */

export interface HhaMetricDefinition {
  key: string;
  label: string;
  formula: string;
  grain: string;
  owner: string;
  source: string;
}

export type HhaKpiFormat = "currency" | "percent" | "ratio" | "months" | "count";

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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

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
