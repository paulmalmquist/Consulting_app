"use client";

// Relativity MES Sandbox API client (Phase 10). Dashboards read these endpoints — the FastAPI
// routes that read the Postgres/Lakebase rel_* serving tables. No local fixtures: every value on the
// dashboards comes from a real serving row (or a fail-closed null_reason). SYNTHETIC data only.

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID } from "@/lib/telemetry/api";

export const REL_ENV_ID = TELEMETRY_DEMO_ENV_ID;
export const REL_BUSINESS_ID = TELEMETRY_DEMO_BUSINESS_ID;

const base = "/api/telemetry/relativity-mes";
const tenant = () => ({ env_id: REL_ENV_ID, business_id: REL_BUSINESS_ID });

export type Row = Record<string, unknown>;

export interface ServingMeta {
  source_kind: "live-rows" | "computed-artifact" | "fixture" | "unavailable";
  serving_provenance: string | null;
  as_of: string | null;
  null_reason: string | null;
}

export interface OverviewResp extends ServingMeta { rows: Row[]; }
export interface GenealogyResp extends ServingMeta {
  vehicles: Row[]; rows: Row[]; ncrs: Row[];
}
export interface WhereUsedResp extends ServingMeta {
  lot_no: string; vehicles: string[]; affected_vehicle_count: number; rows: Row[];
}
export interface NcrResp extends ServingMeta { rows: Row[]; kpis: Record<string, unknown> | null; }
export interface CostResp extends ServingMeta {
  rollup: Row[]; reconciliation: Row[]; kpis: Record<string, unknown> | null;
}
export interface LineageResp extends ServingMeta {
  rows: Row[]; serving: Record<string, { row_count: number; serving_provenance: string | null }>;
}
export interface SourceRowsResp extends ServingMeta {
  table: string; columns: string[]; rows: Row[]; row_count: number;
}

export const getOverview = () =>
  apiFetch<OverviewResp>(`${base}/overview`, { params: tenant() });

export const getGenealogy = (vehicleSerial?: string) =>
  apiFetch<GenealogyResp>(`${base}/genealogy`, {
    params: { ...tenant(), vehicle_serial: vehicleSerial },
  });

export const getWhereUsed = (lotNo: string) =>
  apiFetch<WhereUsedResp>(`${base}/where-used`, { params: { ...tenant(), lot_no: lotNo } });

export const getNcr = () => apiFetch<NcrResp>(`${base}/ncr`, { params: tenant() });

export const getCost = (vehicleSerial?: string) =>
  apiFetch<CostResp>(`${base}/cost`, { params: { ...tenant(), vehicle_serial: vehicleSerial } });

export const getLineage = () => apiFetch<LineageResp>(`${base}/lineage`, { params: tenant() });

export const getSourceRows = (table: string, key?: string, value?: string) =>
  apiFetch<SourceRowsResp>(`${base}/source/${encodeURIComponent(table)}`, {
    params: { ...tenant(), key, value },
  });

// Small fetch hook with loading/error so each console stays declarative.
export function useRel<T>(fetcher: () => Promise<T>, deps: unknown[] = []): {
  data: T | null; loading: boolean; error: string | null;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error };
}

// Human label for the serving source-kind + provenance (honest chip text).
export function servingLabel(meta: ServingMeta): string {
  if (meta.source_kind === "unavailable") return "serving unavailable";
  const prov = meta.serving_provenance === "databricks-gold"
    ? "synthetic Databricks Gold serving rows"
    : "synthetic gold serving rows (bootstrap load)";
  return prov;
}
