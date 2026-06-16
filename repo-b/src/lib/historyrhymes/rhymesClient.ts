/**
 * Client for the analog-matching API (backend/app/routes/rhymes.py).
 *
 * Transport convention differs from client.ts on purpose: these calls are
 * same-origin relative — they hit the existing Next proxy at
 * repo-b/src/app/api/v1/rhymes/[...path]/route.ts, which forwards to
 * BOS_API_ORIGIN. Deliberately NOT prefixed with NEXT_PUBLIC_API_BASE; do not
 * mix the two conventions in one file.
 *
 * Response shapes mirror the backend envelope exactly (DO-NOT-RESHAPE — see
 * the dispatch record). v1 quirks the UI must honor: dtw is always null,
 * scenarios are placeholders ("Awaiting multi-agent forecaster (Stage 5)."),
 * trap_detector fields are all false/null, and degraded responses are valid
 * 200s with empty top_analogs and a confidence_meta.degraded_reason.
 */

export interface RhymesMatchRequest {
  as_of_date?: string;
  scope?: "global";
  k?: number;
}

export interface TopAnalog {
  rank: number;
  episode_id: string;
  episode_name: string;
  rhyme_score: number;
  cosine: number;
  dtw: number | null;
  categorical: number;
  era_discount: number;
  hoyt_amplification: number;
  episode_start_year: number;
  is_non_event: boolean;
  tags: string[];
}

export interface Scenario {
  probability: number;
  narrative: string;
}

export interface TrapDetector {
  trap_flag: boolean;
  trap_reason: string | null;
  honeypot_match: string | null;
  crowding_score: number | null;
  consensus_divergence: number | null;
}

export interface StructuralAlert {
  id: string;
  alert_type: "hoyt_convergence" | "era_mismatch" | "narrative_silence" | "honeypot_match";
  severity: "info" | "warning" | "critical";
  hoyt_position: number | string | null;
  trigger_signals: Record<string, unknown>;
  narrative: string | null;
  alert_date: string;
  created_at?: string;
}

export interface ConfidenceMeta {
  agent_agreement: number | null;
  permutation_p_value: number | null;
  sample_size: number;
  data_freshness_hours: number | null;
  freshness_weight: number;
  degraded_reason: string | null;
}

export interface RhymesMatchResponse {
  as_of_date: string;
  scope: string;
  request_id: string;
  latency_ms: number;
  top_analogs: TopAnalog[];
  scenarios: { bull: Scenario; base: Scenario; bear: Scenario };
  trap_detector: TrapDetector;
  structural_alerts: StructuralAlert[];
  confidence_meta: ConfidenceMeta;
}

/**
 * Fail-closed convention matching client.ts: network errors and non-OK
 * responses resolve to null; the zone renders "match unavailable", never a
 * fabricated value. (The proxy returns 503 JSON when the backend is down,
 * which lands here as null.)
 */
export async function postRhymesMatch(
  req: RhymesMatchRequest = {},
): Promise<RhymesMatchResponse | null> {
  try {
    const res = await fetch("/api/v1/rhymes/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ scope: "global", k: 5, ...req }),
    });
    if (!res.ok) {
      console.error(`[rhymes-client] /api/v1/rhymes/match → ${res.status}`);
      return null;
    }
    return (await res.json()) as RhymesMatchResponse;
  } catch (err) {
    console.error("[rhymes-client] /api/v1/rhymes/match failed:", err);
    return null;
  }
}

export interface RhymesAlertsResponse {
  alerts: StructuralAlert[];
  count: number;
  /** Present when unacknowledged=false: acknowledged history not yet exposed (v1). */
  note?: string;
}

export async function fetchRhymesAlerts(filters: {
  type?: StructuralAlert["alert_type"];
  unacknowledged?: boolean;
} = {}): Promise<RhymesAlertsResponse | null> {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.unacknowledged !== undefined) params.set("unacknowledged", String(filters.unacknowledged));
  const qs = params.toString();
  try {
    const res = await fetch(`/api/v1/rhymes/alerts${qs ? `?${qs}` : ""}`, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[rhymes-client] /api/v1/rhymes/alerts → ${res.status}`);
      return null;
    }
    return (await res.json()) as RhymesAlertsResponse;
  } catch (err) {
    console.error("[rhymes-client] /api/v1/rhymes/alerts failed:", err);
    return null;
  }
}

export interface Episode {
  episode_id: string;
  episode_name: string;
  episode_start_year: number;
  episode_end_year: number | null;
  asset_class: string | null;
  is_non_event: boolean;
  tags: string[];
  description: string | null;
}

export interface EpisodesResponse {
  episodes: Episode[];
  count: number;
}

export async function fetchRhymesEpisodes(filters: {
  asset_class?: string;
  is_non_event?: boolean;
  has_hoyt_peak_tag?: boolean;
  limit?: number;
} = {}): Promise<EpisodesResponse | null> {
  const params = new URLSearchParams();
  if (filters.asset_class) params.set("asset_class", filters.asset_class);
  if (filters.is_non_event !== undefined) params.set("is_non_event", String(filters.is_non_event));
  if (filters.has_hoyt_peak_tag !== undefined) params.set("has_hoyt_peak_tag", String(filters.has_hoyt_peak_tag));
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const qs = params.toString();
  try {
    const res = await fetch(`/api/v1/rhymes/episodes${qs ? `?${qs}` : ""}`, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[rhymes-client] /api/v1/rhymes/episodes → ${res.status}`);
      return null;
    }
    return (await res.json()) as EpisodesResponse;
  } catch (err) {
    console.error("[rhymes-client] /api/v1/rhymes/episodes failed:", err);
    return null;
  }
}

/**
 * Acknowledge a structural alert. Mutating call: returns the backend receipt
 * or null on failure (404 = already acknowledged or unknown id). Callers must
 * surface a failure — optimistic UI reverts on null.
 */
export async function acknowledgeRhymesAlert(
  alertId: string,
  acknowledgedBy: string,
): Promise<{ status: "acknowledged"; alert_id: string } | null> {
  try {
    const res = await fetch(`/api/v1/rhymes/alerts/${alertId}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ acknowledged_by: acknowledgedBy }),
    });
    if (!res.ok) {
      console.error(`[rhymes-client] acknowledge ${alertId} → ${res.status}`);
      return null;
    }
    return (await res.json()) as { status: "acknowledged"; alert_id: string };
  } catch (err) {
    console.error(`[rhymes-client] acknowledge ${alertId} failed:`, err);
    return null;
  }
}
