/**
 * Client for the Episode Feature Store / Feature Observatory API (Phase 0).
 *
 * Same direct-to-FastAPI convention as the other HR clients (NEXT_PUBLIC_API_BASE,
 * no Next.js proxy). Paths are /api/hr/v1/features/* — the /api/historyrhymes/*
 * namespace is forbidden by the HR contract test. Distinct from featureStore.ts
 * (the ml-demo "Feature Foundry" surface); this drives the episode Observatory.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[episode-observatory] ${path} failed:`, err);
    return null;
  }
}

export type EpisodeListItem = {
  id: string;
  name: string;
  is_non_event: boolean;
  as_of: string | null;
  feature_count: number;
};

export type EpisodesResponse = {
  status: "ok" | "not_available";
  episodes: EpisodeListItem[];
  null_reason: string | null;
};

export type DerivedFeature = {
  feature_id: string;
  feature_name: string;
  family: string;
  transform: string;
  unit: string | null;
  raw_sources: string[];
  value: number | null;
  value_label: string | null;
  null_reason: string | null;
  data_provenance: string;
};

export type RawInput = { family: string; raw_sources: string[] };

export type ModelOutputs = {
  status: string | null;
  status_label: string | null;
  training_basis: string | null;
  purpose: string | null;
  calibrated: boolean;
  model: string | null;
  target: string | null;
  features_used: string[];
  features_dropped: string[];
  note: string | null;
  recession_flag: number | null;
  recession_probability: number | null;
  null_reason: string | null;
};

export type CoverageItem = { kind: "feature" | "target"; id: string; reason: string };

export type Coverage = {
  features_available: number;
  features_total: number;
  targets_available: number;
  targets_total: number;
  unavailable: CoverageItem[];
};

export type PlannedBand = { status: "not_available"; null_reason: string };

export type ObservatoryTarget = {
  target_name: string;
  horizon_days: number;
  value: number | null;
  null_reason: string | null;
  source_lineage: string | null;
};

export type ObservatoryResponse = {
  status: "ok" | "not_available";
  null_reason: string | null;
  model_status?: string;
  data_provenance?: string[];
  episode?: { id: string; name: string; as_of: string; is_non_event: boolean };
  coverage?: Coverage;
  bands?: {
    raw_inputs: RawInput[];
    derived_features: DerivedFeature[];
    model_outputs: ModelOutputs;
    analog_matches: PlannedBand & { items: unknown[] };
    forecast_performance: PlannedBand & { metrics: Record<string, unknown> };
  };
  targets?: ObservatoryTarget[];
};

export function fetchObservatoryEpisodes(): Promise<EpisodesResponse | null> {
  return getJson<EpisodesResponse>("/api/hr/v1/features/episodes");
}

export function fetchObservatory(episodeId: string): Promise<ObservatoryResponse | null> {
  return getJson<ObservatoryResponse>(
    `/api/hr/v1/features/episodes/${encodeURIComponent(episodeId)}/observatory`,
  );
}
