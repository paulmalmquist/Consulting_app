/**
 * Outreach Personalizer — Frontend API client.
 *
 * Uses apiFetch from @/lib/api with /bos/api/outreach-personalizer/v1/* paths,
 * which route through the same-origin /bos catch-all proxy
 * (repo-b/src/app/bos/[...path]/route.ts) to the FastAPI backend at
 * /api/outreach-personalizer/v1/*. The /bos proxy is not auth-gated, so the
 * public microsite endpoints work for anonymous visitors.
 */
import { apiFetch } from "@/lib/api";

const OP_BASE = "/bos/api/outreach-personalizer/v1";

// ── Types ────────────────────────────────────────────────────────────────────

export type OutreachInsight = {
  title: string;
  observation: string;
  novendor_angle: string;
  confidence: string;
};

export type OutreachAsset = {
  id: string;
  target_id: string;
  asset_type: "insight" | "loom_script" | "cold_email" | "microsite_section";
  position: number;
  payload: Record<string, unknown>;
  generated_at: string;
  regenerated_count: number;
};

export type OutreachTarget = {
  id: string;
  env_id: string;
  business_id: string | null;
  crm_account_id: string | null;
  crm_opportunity_id: string | null;  // Phase 2C
  firm_name: string;
  firm_slug: string;
  status: "pending" | "enriching" | "assets_ready" | "microsite_live" | "failed";
  logo_url: string | null;
  accent_hsl: string | null;
  profile_json: Record<string, unknown>;
  microsite_url: string | null;
  loom_url: string | null;
};

export type CrmAccountSummary = {
  crm_account_id: string;
  name: string;
  website: string | null;
};

// Phase 2C — opportunity + joined current-stage fields the operator UI needs.
// Mirrors the backend op_db.crm_opportunity_summary return shape.
export type CrmOpportunitySummary = {
  crm_opportunity_id: string;
  name: string;
  amount: string;
  status: string;
  business_id: string;
  crm_account_id: string | null;
  crm_pipeline_stage_id: string | null;
  stage_key: string | null;
  stage_label: string | null;
  stage_order: number | null;
  is_closed: boolean | null;
  is_won: boolean | null;
};

// Phase 2C — the four-condition gate state surfaced by GET /targets/{id}.
// `available` is true ONLY when business_id, account, opportunity, and a valid
// next stage all line up. `blocking_reason` carries the exact backend message
// that must be rendered verbatim beside the disabled advance button.
export type PipelineAdvanceState = {
  available: boolean;
  blocking_reason: string | null;
  opportunity: CrmOpportunitySummary | null;
  next_stage: { crm_pipeline_stage_id: string; key: string; label: string } | null;
};

// Phase 2C list-view per-target indicator (no N+1 full gate; built from a
// single bulk LEFT JOIN in op_db.list_opportunity_summaries_bulk).
export type PipelineListSummary = {
  linked: boolean;
  opportunity_name: string | null;
  current_stage_label: string | null;
};

// Phase 2C — exact return shape of crm_svc.move_opportunity_stage. Passed
// through verbatim under `opportunity` on the advance-pipeline response. Do
// NOT invent a prettier wrapper. stage_key/stage_label may be missing if the
// to-stage row vanished between move and lookup.
export type MovedOpportunity = {
  crm_opportunity_id: string;
  name: string;
  amount: string;
  status: string;
  expected_close_date: string | null;
  stage_key?: string;
  stage_label?: string;
};

// Phase 2B engagement rollup (operator-facing; no IP/user-agent).
export type EngagementEvent = {
  event_type: "microsite_view" | "microsite_cta";
  occurred_at: string;
};

export type EngagementSummary = {
  total_views: number;
  total_ctas: number;
  last_viewed_at: string | null;
  last_cta_at: string | null;
};

export type EngagementRollup = EngagementSummary & {
  recent_events: EngagementEvent[];
};

export type OutreachTargetWithEngagement = OutreachTarget & {
  engagement?: EngagementSummary;
  crm_opportunity?: { crm_opportunity_id: string; name: string; stage_label: string | null } | null;  // Phase 2C list-view
  pipeline?: PipelineListSummary;  // Phase 2C
};

export type TargetResponse = {
  target: OutreachTarget;
  assets: OutreachAsset[];
  microsite_url: string | null;
  public_path: string;
  created?: boolean;
  crm_account?: CrmAccountSummary | null;
  crm_opportunity?: CrmOpportunitySummary | null;  // Phase 2C
  pipeline?: PipelineAdvanceState;                  // Phase 2C
  engagement?: EngagementRollup;
};

// crm_account row as returned by the existing /api/crm/accounts route
// (backend/app/routes/crm.py). Reused as-is — no new CRM endpoint/model.
export type CrmAccount = {
  crm_account_id: string;
  name: string;
  account_type: string;
  industry: string | null;
  website: string | null;
  created_at: string;
};

export type PatchTargetPayload = {
  loom_url?: string | null;
  crm_account_id?: string | null;
  crm_opportunity_id?: string | null;  // Phase 2C
  logo_url?: string | null;
  accent_hsl?: string | null;
};

// crm_opportunity row as returned by the existing /api/crm/opportunities
// route. Reused as-is — no new CRM endpoint/model. Phase 2C.
export type CrmOpportunityListRow = {
  crm_opportunity_id: string;
  name: string;
  amount: string;
  status: string;
  crm_account_id: string | null;
  account_name: string | null;
  crm_pipeline_stage_id: string | null;
  stage_key: string | null;
  stage_label: string | null;
  stage_order: number | null;
  expected_close_date: string | null;
};

export type SeedTargetPayload = {
  firm_name: string;
  firm_slug: string;
  logo_url?: string | null;
  accent_hsl?: string | null;
  profile_json?: Record<string, unknown>;
  loom_url?: string | null;
};

export type MicrositePayload =
  | {
      ready: true;
      firm: { name: string; slug: string; logo_url: string | null };
      insights: OutreachInsight[];
      loom: { url: string | null; script: string | null; state: "ready" | "pending" };
      cold_email_preview: { subject: string | null; body: string | null };
      cta: { label: string; kind: "email" | "calendar"; href: string };
      styling: { accent_hsl: string | null; logo_url: string | null };
      source: string | null;
    }
  | {
      ready: false;
      reason: string;
      firm: { name: string; slug: string };
    };

export type MicrositeTrackEvent = "microsite_view" | "microsite_cta";

// ── Operator endpoints ───────────────────────────────────────────────────────

export function seedOutreachTarget(
  envId: string,
  payload: SeedTargetPayload,
  businessId?: string,
) {
  const qs = new URLSearchParams({ env_id: envId });
  if (businessId) qs.set("business_id", businessId);
  return apiFetch<TargetResponse>(`${OP_BASE}/targets?${qs.toString()}`, {
    method: "POST",
    body: JSON.stringify({ ...payload, env_id: envId, business_id: businessId }),
  });
}

export function listOutreachTargets(envId: string) {
  return apiFetch<{ targets: OutreachTargetWithEngagement[] }>(
    `${OP_BASE}/targets?env_id=${encodeURIComponent(envId)}`,
  );
}

/** Log the target's microsite engagement as a CRM activity (reuses crm_svc). */
export function logCrmActivity(targetId: string, note?: string) {
  return apiFetch<{
    ok: boolean;
    activity: Record<string, unknown>;
    engagement: EngagementRollup;
  }>(`${OP_BASE}/targets/${targetId}/crm-activity`, {
    method: "POST",
    body: JSON.stringify({ note: note ?? null }),
  });
}

export function getOutreachTarget(targetId: string) {
  return apiFetch<TargetResponse>(`${OP_BASE}/targets/${targetId}`);
}

export function patchOutreachTarget(targetId: string, payload: PatchTargetPayload) {
  return apiFetch<TargetResponse>(`${OP_BASE}/targets/${targetId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/**
 * Lists CRM accounts via the EXISTING /api/crm/accounts route
 * (backend/app/routes/crm.py — scoped by business_id). Reused, not duplicated.
 */
export function listCrmAccounts(businessId: string) {
  return apiFetch<CrmAccount[]>(
    `/bos/api/crm/accounts?business_id=${encodeURIComponent(businessId)}`,
  );
}

/**
 * Phase 2C — lists CRM opportunities via the EXISTING /api/crm/opportunities
 * route (backend/app/routes/crm.py — scoped by business_id). Reused, not
 * duplicated. Powers the operator opportunity picker.
 */
export function listCrmOpportunities(businessId: string) {
  return apiFetch<CrmOpportunityListRow[]>(
    `/bos/api/crm/opportunities?business_id=${encodeURIComponent(businessId)}`,
  );
}

/**
 * Phase 2C — advance the linked opportunity's pipeline stage by one step. The
 * four-condition gate is enforced server-side; 400 with the exact
 * blocking_reason string when unavailable.
 */
export function advancePipeline(targetId: string, note?: string) {
  return apiFetch<{
    ok: boolean;
    opportunity: MovedOpportunity;
    pipeline: PipelineAdvanceState;
  }>(`${OP_BASE}/targets/${targetId}/advance-pipeline`, {
    method: "POST",
    body: JSON.stringify({ note: note ?? null }),
  });
}

export function regenerateOutreachAsset(
  targetId: string,
  assetType: "insight" | "loom_script" | "cold_email",
) {
  return apiFetch<{ asset: OutreachAsset }>(
    `${OP_BASE}/targets/${targetId}/regenerate/${assetType}`,
    { method: "POST" },
  );
}

// ── Public endpoints ─────────────────────────────────────────────────────────

export function getMicrosite(slug: string) {
  return apiFetch<MicrositePayload>(
    `${OP_BASE}/microsite/${encodeURIComponent(slug)}`,
  );
}

export function trackMicrosite(
  slug: string,
  eventType: MicrositeTrackEvent,
  metadata: Record<string, unknown> = {},
) {
  return apiFetch<{ ok: boolean; event_id: string }>(
    `${OP_BASE}/microsite/${encodeURIComponent(slug)}/track`,
    { method: "POST", body: JSON.stringify({ event_type: eventType, metadata }) },
  );
}
