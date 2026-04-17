// Typed client for the backend History Rhymes routes.
//
// Calls the same-origin Next.js proxy at /api/v1/rhymes/* which forwards to
// the FastAPI backend routes registered in backend/app/routes/rhymes.py.
//
// Loop 1 scope: only the episodes endpoint is wired from the UI. The match
// endpoint exists on the backend but requires a state-vector pipeline (T3.1)
// before UI wiring is honest.

import type { ApiEpisode } from "@/components/market/hooks/useDecisionEngine";

export type RhymesEpisodesResponse = {
  episodes: ApiEpisode[];
  count: number;
};

export type RhymesAlertsResponse = {
  alerts: Array<Record<string, unknown>>;
  count: number;
  note?: string;
};

export class RhymesClientError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "RhymesClientError";
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new RhymesClientError(
      text || `Request failed (${res.status})`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export function fetchRhymesEpisodes(params?: {
  assetClass?: string;
  isNonEvent?: boolean;
  hasHoytPeakTag?: boolean;
  limit?: number;
}): Promise<RhymesEpisodesResponse> {
  const qs = new URLSearchParams();
  if (params?.assetClass) qs.set("asset_class", params.assetClass);
  if (params?.isNonEvent !== undefined) qs.set("is_non_event", String(params.isNonEvent));
  if (params?.hasHoytPeakTag) qs.set("has_hoyt_peak_tag", "true");
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  const path = `/api/v1/rhymes/episodes${query ? `?${query}` : ""}`;
  return getJson<RhymesEpisodesResponse>(path);
}

export function fetchRhymesAlerts(params?: {
  type?: string;
  unacknowledged?: boolean;
}): Promise<RhymesAlertsResponse> {
  const qs = new URLSearchParams();
  if (params?.type) qs.set("type", params.type);
  if (params?.unacknowledged !== undefined) qs.set("unacknowledged", String(params.unacknowledged));
  const query = qs.toString();
  const path = `/api/v1/rhymes/alerts${query ? `?${query}` : ""}`;
  return getJson<RhymesAlertsResponse>(path);
}
