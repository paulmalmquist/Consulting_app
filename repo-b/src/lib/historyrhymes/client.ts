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

/* ─────────────────────────────────────────────────────────────────────────
 * Research → planning bridge (backed by backend/app/routes/hr_research.py).
 * SHIPPED, TESTED CONTRACT — paths are /api/hr/v1/research/* . Same
 * direct-to-FastAPI convention as above (NEXT_PUBLIC_API_BASE); there is
 * intentionally no Next.js proxy route for /api/hr/*. Do not rename these
 * paths or reshape the responses without changing the backend + its tests.
 * ──────────────────────────────────────────────────────────────────────── */

export type CandidateStatus =
  | "new"
  | "promoted"
  | "discarded"
  | "planned"
  | "shipped";

export interface EnhancementCandidate {
  candidate_id: string;
  brief_id?: string | null;
  title: string;
  category: string | null;
  what: string | null;
  why: string | null;
  effort_days: number | null;
  expected_impact: string | null;
  dependencies: string[];
  priority: string;
  confidence: number | null;
  adversarial_verdict: string | null;
  status: CandidateStatus;
  created_at?: string;
}

export interface ResearchBriefSummary {
  brief_id: string;
  brief_date: string;
  week_type: string;
  pillar_name: string;
  title: string | null;
  confidence: number | null;
  freshness_score: number | null;
  source_filename?: string | null;
  parsed_json: Record<string, unknown>;
  candidate_count: number;
  created_at: string;
}

export interface IngestResult {
  brief: {
    brief_id: string;
    brief_date: string;
    week_type: string;
    pillar_name: string;
    title: string | null;
    confidence: number;
    freshness_score: number | null;
    regime_call: string | null;
    found_sections: string[];
    created_at: string | null;
  };
  candidates: EnhancementCandidate[];
  warnings: string[];
  confidence: number;
  degraded: boolean;
}

export interface IngestInput {
  brief_date: string; // YYYY-MM-DD
  week_type: string;
  pillar_name: string;
  markdown_content: string;
  title?: string | null;
  source_filename?: string | null;
}

async function sendJson<T>(
  path: string,
  method: "POST",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (j?.detail) detail = String(j.detail);
    } catch {
      /* keep status-only detail */
    }
    throw new Error(`${path} → ${detail}`);
  }
  return (await res.json()) as T;
}

export function postResearchBrief(input: IngestInput): Promise<IngestResult> {
  return sendJson<IngestResult>(
    "/api/hr/v1/research/briefs",
    "POST",
    input,
  );
}

export function fetchLatestResearchBrief(): Promise<ResearchBriefSummary | null> {
  return getJson<ResearchBriefSummary>("/api/hr/v1/research/briefs/latest");
}

export function fetchEnhancementCandidates(
  status?: CandidateStatus,
): Promise<{ count: number; candidates: EnhancementCandidate[] } | null> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return getJson<{ count: number; candidates: EnhancementCandidate[] }>(
    `/api/hr/v1/research/enhancement-candidates${q}`,
  );
}

export function promoteCandidate(
  candidateId: string,
): Promise<{ candidate_id: string; title: string; status: string }> {
  return sendJson(
    `/api/hr/v1/research/enhancement-candidates/${encodeURIComponent(
      candidateId,
    )}/promote`,
    "POST",
  );
}

export function discardCandidate(
  candidateId: string,
): Promise<{ candidate_id: string; title: string; status: string }> {
  return sendJson(
    `/api/hr/v1/research/enhancement-candidates/${encodeURIComponent(
      candidateId,
    )}/discard`,
    "POST",
  );
}

export function fetchPlanningMarkdown(
  candidateId: string,
): Promise<{ candidate_id: string; planning_markdown: string } | null> {
  return getJson(
    `/api/hr/v1/research/enhancement-candidates/${encodeURIComponent(
      candidateId,
    )}/planning-markdown`,
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Morning Book v1 (backed by backend/app/routes/hr_morning_book.py).
 * Regime-transition awareness only — the daily-open delta between the latest
 * two research briefs. Backend owns the delta; the frontend renders it.
 * ──────────────────────────────────────────────────────────────────────── */

export type TriageState = "Act Now" | "Watch" | "Research Only";

export type ConfidenceStatus =
  | "improving"
  | "stable"
  | "deteriorating"
  | "unknown";

export type FreshnessStatus = "fresh" | "stale" | "very_stale" | "unknown";

export interface MorningBookData {
  current_regime: string | null;
  what_changed: string[];
  confidence: {
    current: number | null;
    previous: number | null;
    delta: number | null;
    status: ConfidenceStatus;
  };
  freshness: {
    latest_brief_date: string | null;
    previous_brief_date: string | null;
    status: FreshnessStatus;
  };
  top_risks: string[];
  top_new_enhancements: string[];
  triage: TriageState;
  warnings: string[];
}

export function fetchMorningBook(): Promise<MorningBookData | null> {
  return getJson<MorningBookData>("/api/hr/v1/research/morning-book");
}

/* ─────────────────────────────────────────────────────────────────────────
 * Stream status (backed by backend/app/routes/hr_stream.py). Same direct
 * convention as the rest of the /api/hr/v1 namespace. The payload is
 * allowlisted server-side — it never carries broker URLs or credentials.
 * ──────────────────────────────────────────────────────────────────────── */

export type StreamMode = "off" | "synthetic" | "replay" | "live_kafka";

export type StreamStatus =
  | "connected"
  | "delayed"
  | "replaying"
  | "disconnected"
  | "not_configured";

export interface StreamHealth {
  mode: StreamMode;
  provider: "confluent" | "google" | null;
  status: StreamStatus;
  consumer_group: string;
  topic_prefix: string;
  latest_event_at: string | null;
  lag_seconds: number | null;
  degraded_reason: string | null;
}

export function fetchStreamHealth(): Promise<StreamHealth | null> {
  return getJson<StreamHealth>("/api/hr/v1/stream/health");
}

export interface StreamSignalQuality {
  status: "fresh" | "stale" | "missing";
  null_reason: string | null;
  source_lag_seconds: number | null;
  validation_errors: string[];
}

export interface StreamSignal {
  signal_key: string;
  domain: string;
  value: number | string | null;
  unit: string | null;
  previous_value: number | null;
  delta: number | null;
  observed_at: string | null;
  source: string;
  mode: StreamMode;
  quality: StreamSignalQuality;
  tags: string[];
}

export interface StreamSignalsResponse {
  mode: StreamMode;
  signals: StreamSignal[];
}

export function fetchStreamSignals(): Promise<StreamSignalsResponse | null> {
  return getJson<StreamSignalsResponse>("/api/hr/v1/stream/signals/latest");
}
