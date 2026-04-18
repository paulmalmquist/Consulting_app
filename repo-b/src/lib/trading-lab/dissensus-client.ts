// Typed client for the backend Dissensus routes.
//
// Calls the same-origin Next.js proxy at /api/v1/dissensus/* which forwards
// to the FastAPI backend routes registered in backend/app/routes/dissensus.py
// (see META_PROMPT_DISSENSUS.md Step 10 for the contract).
//
// Each fetcher returns a discriminated union so the component never has to
// inspect HTTP status codes. The warmup case is a 404 with a structured body
// and must not be treated as a generic error.

export type DissensusCurrent = {
  period_ts: string;
  composite_D: number;
  z_D: number;
  pct_D: number;
  regime_flag: string;
  ood_flag: boolean;
  w1_pairwise_mean: number;
  jsd_mean: number;
  directional_disagreement: number;
  z_w1: number;
  z_jsd: number;
  z_dir: number;
  n_eff: number;
  n_agents: number;
  mean_p_bear: number;
  mean_p_base: number;
  mean_p_bull: number;
  frac_bullish: number;
  max_pairwise_rho: number | null;
  ci_width_base: number;
  ci_width_adjusted: number;
  alpha_adjusted: number;
  warmup_progress: { n_logged: number; n_needed: number } | null;
};

export type DissensusHistoryPoint = {
  period_ts: string;
  composite_D: number;
  pct_D: number;
  regime_flag: string;
  ood_flag: boolean;
};

export type RegimeEvent = {
  event_ts: string;
  event_type: string;
  severity: string;
  triggering_metrics: Record<string, unknown>;
  resolved_at: string | null;
};

export type DissensusCurrentResult =
  | { state: "ready"; data: DissensusCurrent }
  | { state: "warmup"; n_logged: number; n_needed: number }
  | { state: "error"; message: string };

export type DissensusHistoryResult =
  | { state: "ready"; series: DissensusHistoryPoint[] }
  | { state: "empty" }
  | { state: "error"; message: string };

export type DissensusEventsResult =
  | { state: "ready"; events: RegimeEvent[] }
  | { state: "empty" }
  | { state: "error"; message: string };

export class DissensusClientError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "DissensusClientError";
  }
}

type FetchInit = RequestInit & { signal?: AbortSignal };

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : "";
}

export async function fetchDissensusCurrent(
  args: { symbol: string; horizon: string },
  init?: FetchInit,
): Promise<DissensusCurrentResult> {
  const path = `/api/v1/dissensus/current${qs({ asset: args.symbol, horizon: args.horizon })}`;
  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    if (res.status === 404) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (body && (body as { detail?: string }).detail === "no_data") {
        const nLogged = Number((body as { n_logged?: number }).n_logged ?? 0);
        const nNeeded = Number((body as { n_needed?: number }).n_needed ?? 20);
        return { state: "warmup", n_logged: nLogged, n_needed: nNeeded };
      }
      return { state: "error", message: "Not found" };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { state: "error", message: text || `Request failed (${res.status})` };
    }
    const data = (await res.json()) as DissensusCurrent;
    return { state: "ready", data };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return { state: "error", message: "aborted" };
    }
    return { state: "error", message: (err as Error).message || "Network error" };
  }
}

export async function fetchDissensusHistory(
  args: { symbol: string; horizon: string; days?: number },
  init?: FetchInit,
): Promise<DissensusHistoryResult> {
  const path = `/api/v1/dissensus/history${qs({ asset: args.symbol, horizon: args.horizon, days: args.days ?? 90 })}`;
  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    if (res.status === 404) return { state: "empty" };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { state: "error", message: text || `Request failed (${res.status})` };
    }
    const data = (await res.json()) as DissensusHistoryPoint[] | null;
    if (!Array.isArray(data) || data.length === 0) return { state: "empty" };
    return { state: "ready", series: data };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return { state: "error", message: "aborted" };
    }
    return { state: "error", message: (err as Error).message || "Network error" };
  }
}

export async function fetchDissensusEvents(
  args: { symbol: string; horizon: string; limit?: number },
  init?: FetchInit,
): Promise<DissensusEventsResult> {
  const path = `/api/v1/dissensus/events${qs({ asset: args.symbol, horizon: args.horizon, limit: args.limit ?? 3 })}`;
  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    if (res.status === 404) return { state: "empty" };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { state: "error", message: text || `Request failed (${res.status})` };
    }
    const data = (await res.json()) as RegimeEvent[] | null;
    if (!Array.isArray(data) || data.length === 0) return { state: "empty" };
    return { state: "ready", events: data };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return { state: "error", message: "aborted" };
    }
    return { state: "error", message: (err as Error).message || "Network error" };
  }
}
