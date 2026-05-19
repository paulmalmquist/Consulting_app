/**
 * History Rhymes execution-loop API client.
 * Backed by `backend/app/routes/hr.py`.
 */

export type FreshnessVerdict =
  | "fresh"
  | "stale_snapshot"
  | "stale_brief"
  | "no_brief"
  | "no_snapshot";

export type Regime =
  | "expansion"
  | "late_cycle"
  | "stagflation"
  | "crisis"
  | "recovery"
  | "unknown";

export interface HrState {
  latest_brief_id: string | null;
  latest_brief_at: string | null;
  latest_snapshot_id: string | null;
  latest_snapshot_at: string | null;
  latest_decision_id: string | null;
  latest_decision_at?: string | null;
  latest_regime: Regime | null;
  latest_confidence: number | null;
  worst_input_age_hours: number;
  freshness_verdict: FreshnessVerdict;
}

export interface Position {
  asset: string;
  direction: "long" | "short" | "neutral";
  size: number;
  time_horizon_days: 7 | 30 | 90;
  entry_type: "immediate" | "staggered" | "conditional";
  key_drivers: string[];
  top_analog: string;
  rhyme_score: number;
  invalidation: string;
  next_check: string;
}

export interface Risk {
  gross_exposure: number;
  net_exposure: number;
  max_position_size: number;
  stop_loss_logic: string;
  volatility_adjustment: string;
}

export interface Alert {
  type: "honeypot" | "crowding" | "divergence" | "data_quality";
  message: string;
  action: "reduce" | "hedge" | "pause" | "reverse";
}

export interface HrDecision {
  decision_id: string;
  prediction_date: string;
  regime: Regime;
  confidence: number;
  positions: Position[];
  risk: Risk;
  alerts: Alert[];
  execution_tasks: string[];
  source_brief_id: string | null;
  source_snapshot_id: string | null;
  source: string;
  created_at: string;
}

export interface HrBrief {
  brief_id: string;
  published_at: string;
  regime_call: Regime | null;
  confidence: number | null;
  freshness_score: number | null;
  markdown_uri: string | null;
  parsed_json: Record<string, unknown>;
  source: string;
  created_at: string;
}

export interface EnhancementCandidate {
  candidate_id: string;
  title: string;
  status: "new" | "promoted" | "discarded" | "planned" | "shipped";
  adversarial_verdict?: "PASS" | "FAIL" | "HOLD" | "CAUTION" | "ABSTAIN";
  priority?: string;
  effort_days?: number | null;
  what?: string;
  why?: string;
  expected_impact?: string;
  dependencies: string[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[hr-client] ${path} failed:`, err);
    return null;
  }
}

export function fetchHrState(): Promise<HrState | null> {
  return getJson<HrState>("/api/hr/v1/state");
}

export function fetchLatestDecision(): Promise<HrDecision | null> {
  return getJson<HrDecision>("/api/hr/v1/decisions/latest");
}

export function fetchLatestBrief(): Promise<HrBrief | null> {
  return getJson<HrBrief>("/api/hr/v1/briefs/latest");
}
