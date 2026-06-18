/**
 * Client for the promotion-candidate review API (C6).
 *
 * Direct-to-FastAPI convention (NEXT_PUBLIC_API_BASE, no proxy), same as
 * lib/historyrhymes/featureStore.ts. Paths are /api/hr/v1/promotion-candidates* —
 * the /api/historyrhymes/* namespace is forbidden by the HR contract test.
 *
 * The UI OPERATES the C4/C6 airlock only: it never creates episodes or writes
 * episode embeddings. A 409 carries the EXACT C4 blocked reasons; this client
 * preserves them verbatim (never collapses them into a generic message).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
const ROOT = "/api/hr/v1/promotion-candidates";

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type ApprovalStatus =
  | "draft" | "needs_evidence" | "needs_review"
  | "approved" | "rejected" | "superseded" | "promoted";

export type CoverageStatus = "pass" | "below_target" | "missing";

export interface NonEventCoverage {
  condition_cluster?: string | null;
  crisis_anchor_count?: number;
  non_event_count?: number;
  non_event_to_event_ratio?: number | null;
  coverage_status?: CoverageStatus;
  override_required?: boolean;
  override_reason?: string | null;
}

export interface NoLookaheadAudit {
  passed?: boolean;
  violations?: string[];
  knowable_as_of?: string | null;
}

export interface PromotionReceipt {
  version?: number;
  candidate_id?: string;
  observation_id?: string;
  approval_actor?: string | null;
  approval_timestamp?: string | null;
  approval_status?: string;
  created_episode_id?: string | null;
  receipt_generated_at?: string | null;
  calibration_evidence_hash?: string;
  no_lookahead_audit_hash?: string;
  non_event_context_hash?: string;
  lineage_hash?: string;
  features_snapshot_hash?: string;
  receipt_history?: Record<string, unknown>[];
  [k: string]: unknown;
}

/** A candidate row / detail packet. Unknown fields tolerated (safe-by-default). */
export interface PromotionCandidate {
  candidate_id: string;
  observation_id?: string;
  observation_embedding_id?: string | null;
  as_of_date?: string;
  model_obs_version?: string;
  embedding_model_version?: string;
  candidate_type?: string;
  candidate_label?: string;
  condition_cluster?: string | null;
  source_quality?: string;
  proposed_episode_name?: string;
  proposed_asset_class?: string;
  proposed_category?: string | null;
  proposed_start_date?: string | null;
  proposed_peak_date?: string | null;
  proposed_trough_date?: string | null;
  proposed_end_date?: string | null;
  proposed_tags?: string[];
  narrative_summary?: string;
  features_snapshot?: Record<string, unknown>;
  top_feature_drivers?: unknown[];
  lineage_json?: Record<string, unknown>;
  external_links_json?: Record<string, unknown>;
  calibration_evidence_json?: Record<string, unknown>;
  no_lookahead_audit_json?: NoLookaheadAudit;
  non_event_context_json?: NonEventCoverage;
  readiness_score?: number | null;
  readiness_degrade_reasons?: unknown[];
  reviewer_notes?: string | null;
  approval_status: ApprovalStatus;
  approval_actor?: string | null;
  approval_timestamp?: string | null;
  rejection_reason?: string | null;
  superseded_by_candidate_id?: string | null;
  created_episode_id?: string | null;
  promotion_receipt_json?: PromotionReceipt;
  updated_at?: string;
  created_at?: string;
  // derived on the detail route
  allowed_actions?: string[];
  blocked_reasons?: string[];
  coverage?: NonEventCoverage;
}

export interface CandidateListResponse {
  items: PromotionCandidate[];
  count: number;
  limit: number;
  offset: number;
}

export interface PromotionOkResponse {
  status: "ok";
  candidate_id: string;
  approval_status: ApprovalStatus;
  candidate: PromotionCandidate;
}

export type PromotionBlockedResponse = {
  status: "blocked";
  blocked_reasons: string[];
  candidate_id?: string;
  current_status?: string;
  allowed_actions?: string[];
};

/** Discriminated result so callers branch on ok vs blocked vs error. */
export type PromotionActionResult =
  | { kind: "ok"; data: PromotionOkResponse }
  | { kind: "blocked"; data: PromotionBlockedResponse }
  | { kind: "error"; httpStatus: number; message: string };

export interface CandidateFilters {
  approval_status?: string;
  candidate_type?: string;
  candidate_label?: string;
  condition_cluster?: string;
  source_quality?: string;
  coverage_status?: string;
  has_blocked_reasons?: boolean;
  as_of_date_from?: string;
  as_of_date_to?: string;
  limit?: number;
  offset?: number;
}

/* ── Fetch helpers ─────────────────────────────────────────────────────────── */

function isBlocked(body: unknown): body is PromotionBlockedResponse {
  return !!body && typeof body === "object" && (body as { status?: string }).status === "blocked";
}

async function post(path: string, payload: Record<string, unknown>): Promise<PromotionActionResult> {
  try {
    const res = await fetch(`${API_BASE}${ROOT}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (res.status === 409) {
      // FastAPI HTTPException wraps the payload under `detail`.
      const detail = (body && (body.detail ?? body)) as PromotionBlockedResponse;
      const reasons = Array.isArray(detail?.blocked_reasons) ? detail.blocked_reasons : ["unknown_blocked_reason"];
      return { kind: "blocked", data: { ...detail, status: "blocked", blocked_reasons: reasons } };
    }
    if (!res.ok) {
      return { kind: "error", httpStatus: res.status, message: `${path} → ${res.status}` };
    }
    return { kind: "ok", data: body as PromotionOkResponse };
  } catch (err) {
    return { kind: "error", httpStatus: 0, message: String(err) };
  }
}

/* ── Reads ─────────────────────────────────────────────────────────────────── */

export async function listCandidates(filters: CandidateFilters = {}): Promise<CandidateListResponse> {
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  const path = `${ROOT}${qs.toString() ? `?${qs}` : ""}`;
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return { items: [], count: 0, limit: filters.limit ?? 50, offset: filters.offset ?? 0 };
    return (await res.json()) as CandidateListResponse;
  } catch {
    return { items: [], count: 0, limit: filters.limit ?? 50, offset: filters.offset ?? 0 };
  }
}

export async function getCandidate(candidateId: string): Promise<PromotionCandidate | null> {
  try {
    const res = await fetch(`${API_BASE}${ROOT}/${encodeURIComponent(candidateId)}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as PromotionCandidate;
  } catch {
    return null;
  }
}

/* ── Actions (each maps to a C6 route → a C4 service function) ──────────────── */

const id = (c: string) => `/${encodeURIComponent(c)}`;

export const markNeedsEvidence = (c: string) => post(`${id(c)}/needs-evidence`, {});
export const markNeedsReview = (c: string) => post(`${id(c)}/needs-review`, {});
export const approveCandidate = (c: string, body: { reviewer_notes?: string; override_reason?: string } = {}) =>
  post(`${id(c)}/approve`, body);
export const rejectCandidate = (c: string, body: { rejection_reason: string; reviewer_notes?: string }) =>
  post(`${id(c)}/reject`, body);
export const supersedeCandidate = (c: string, body: { superseded_by_candidate_id: string; reviewer_notes?: string }) =>
  post(`${id(c)}/supersede`, body);
export const linkPromotedEpisode = (c: string, body: { created_episode_id: string }) =>
  post(`${id(c)}/link-promoted-episode`, body);

/** Coverage target shared with the UI. */
export const NON_EVENT_RATIO_TARGET = 2.0;
