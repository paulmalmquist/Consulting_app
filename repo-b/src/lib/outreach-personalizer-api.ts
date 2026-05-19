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
};

export type TargetResponse = {
  target: OutreachTarget;
  assets: OutreachAsset[];
  microsite_url: string | null;
  public_path: string;
  created?: boolean;
  crm_account?: CrmAccountSummary | null;
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
  logo_url?: string | null;
  accent_hsl?: string | null;
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
