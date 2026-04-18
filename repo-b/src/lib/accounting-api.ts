/**
 * Novendor Accounting API client.
 *
 * Routes through the same /bos proxy as bos-api.ts. Backend router mount:
 *   /api/nv/accounting/...
 */
import { bosFetch } from "@/lib/bos-api";

const BASE = "/api/nv/accounting";

export type IngestStatus = "pending" | "parsed" | "failed" | "duplicate";

export type ReceiptIntakeRow = {
  id: string;
  source_type: string;
  ingest_status: IngestStatus;
  original_filename: string | null;
  created_at: string;
  file_hash: string;
  merchant_raw: string | null;
  billing_platform: string | null;
  vendor_normalized: string | null;
  service_name_guess: string | null;
  total: string | number | null;
  currency: string | null;
  transaction_date: string | null;
  confidence_overall: string | number | null;
};

export type ParseResult = {
  id: string;
  parser_source: string;
  parser_version: string | null;
  merchant_raw: string | null;
  billing_platform: string | null;
  service_name_guess: string | null;
  vendor_normalized: string | null;
  transaction_date: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  subtotal: string | number | null;
  tax: string | number | null;
  total: string | number | null;
  currency: string | null;
  apple_document_ref: string | null;
  line_items: Array<Record<string, unknown>>;
  renewal_language: string | null;
  confidence_overall: string | number | null;
  confidence_vendor: string | number | null;
  confidence_service: string | number | null;
};

export type MatchCandidate = {
  id: string;
  transaction_id: string | null;
  match_score: string | number;
  match_reason: Record<string, unknown>;
  match_status: string;
  created_at: string;
};

export type ReviewItem = {
  id: string;
  intake_id?: string;
  reason: string;
  next_action: string;
  status: "open" | "resolved" | "deferred";
  created_at: string;
  resolved_at: string | null;
  merchant_raw?: string | null;
  vendor_normalized?: string | null;
  billing_platform?: string | null;
  service_name_guess?: string | null;
  total?: string | number | null;
  currency?: string | null;
  transaction_date?: string | null;
  confidence_overall?: string | number | null;
};

export type IntakeDetail = {
  intake: {
    id: string;
    source_type: string;
    ingest_status: IngestStatus;
    original_filename: string | null;
    mime_type: string | null;
    storage_path: string | null;
    created_at: string;
    file_hash: string;
  };
  parse: ParseResult | null;
  match_candidates: MatchCandidate[];
  review_items: ReviewItem[];
};

export type SpendType =
  | "subscription_fixed"
  | "api_usage"
  | "one_off"
  | "reimbursable_client"
  | "ambiguous";

export type SubscriptionRow = {
  id: string;
  vendor_normalized: string | null;
  service_name: string;
  billing_platform: string | null;
  cadence: "monthly" | "quarterly" | "annual" | "unknown";
  expected_amount: string | number | null;
  currency: string | null;
  category: string | null;
  business_relevance: string | null;
  spend_type: SpendType | null;
  last_seen_date: string | null;
  next_expected_date: string | null;
  documentation_complete: boolean;
  is_active: boolean;
  occurrence_count?: number;
  last_price_delta_pct?: number | null;
};

export type OccurrenceRow = {
  id: string;
  occurrence_date: string;
  amount: string | number | null;
  currency: string | null;
  expected_amount: string | number | null;
  price_delta_pct: number | null;
  days_since_last: number | null;
  source_signals: Array<Record<string, unknown>>;
  review_state: "auto" | "confirmed" | "manual" | "rejected" | "non_business" | "mixed";
  notes: string | null;
  created_at: string;
};

export type AiSoftwareSummary = {
  period_start: string | null;
  period_end: string | null;
  apple_billed_total: number;
  claude_total: number;
  openai_total: number;
  by_spend_type: Array<{ spend_type: string; total: number; receipt_count: number }>;
  by_vendor: Array<{ vendor: string; billing_platform: string | null; total: number; receipt_count: number }>;
  ambiguous_pending_review_usd: number;
  missing_support_count: number;
};

export type SoftwareSpendReport = {
  period_start: string | null;
  period_end: string | null;
  total_spend: number;
  by_vendor: Array<{
    vendor: string;
    billing_platform: string | null;
    receipt_count: number;
    total_spend: number;
    currency: string | null;
  }>;
  by_platform: Array<{
    platform: string;
    total_spend: number;
    receipt_count: number;
  }>;
};

export type AppleBilledReport = {
  period_start: string | null;
  period_end: string | null;
  total_apple_billed: number;
  undetermined_vendor_spend: number;
  rows: Array<{
    vendor: string;
    service: string | null;
    receipt_count: number;
    total_spend: number;
    currency: string | null;
  }>;
};

function scopeParams(envId: string, businessId?: string) {
  return {
    env_id: envId,
    business_id: businessId,
  };
}

export async function uploadReceipt(params: {
  envId: string;
  businessId?: string;
  file: File;
  sourceType?: string;
  sourceRef?: string;
  uploadedBy?: string;
}): Promise<{ intake_id: string; ingest_status: IngestStatus; duplicate: boolean; parse_result_id?: string }> {
  const form = new FormData();
  form.append("env_id", params.envId);
  if (params.businessId) form.append("business_id", params.businessId);
  form.append("source_type", params.sourceType ?? "upload");
  if (params.sourceRef) form.append("source_ref", params.sourceRef);
  if (params.uploadedBy) form.append("uploaded_by", params.uploadedBy);
  form.append("file", params.file);
  return bosFetch(`${BASE}/receipts/upload`, {
    method: "POST",
    body: form,
  });
}

export async function bulkUploadReceipts(params: {
  envId: string;
  businessId?: string;
  files: File[];
}): Promise<{ count: number; results: Array<{ intake_id: string; ingest_status: IngestStatus; duplicate: boolean }> }> {
  const form = new FormData();
  form.append("env_id", params.envId);
  if (params.businessId) form.append("business_id", params.businessId);
  for (const f of params.files) form.append("files", f);
  return bosFetch(`${BASE}/receipts/bulk-upload`, {
    method: "POST",
    body: form,
  });
}

export async function listIntake(params: {
  envId: string;
  businessId?: string;
  status?: IngestStatus;
  limit?: number;
}): Promise<{ count: number; rows: ReceiptIntakeRow[] }> {
  return bosFetch(`${BASE}/receipts/intake`, {
    params: {
      ...scopeParams(params.envId, params.businessId),
      status: params.status,
      limit: params.limit ? String(params.limit) : undefined,
    },
  });
}

export async function getIntake(params: {
  envId: string;
  businessId?: string;
  intakeId: string;
}): Promise<IntakeDetail> {
  return bosFetch(`${BASE}/receipts/${params.intakeId}`, {
    params: scopeParams(params.envId, params.businessId),
  });
}

export async function listReviewQueue(params: {
  envId: string;
  businessId?: string;
  status?: "open" | "resolved" | "deferred";
  limit?: number;
}): Promise<{ count: number; items: ReviewItem[] }> {
  return bosFetch(`${BASE}/review-queue`, {
    params: {
      ...scopeParams(params.envId, params.businessId),
      status: params.status ?? "open",
      limit: params.limit ? String(params.limit) : undefined,
    },
  });
}

export async function resolveReviewItem(params: {
  envId: string;
  businessId?: string;
  itemId: string;
  resolvedBy?: string;
  notes?: string;
}): Promise<{ resolved: boolean }> {
  return bosFetch(`${BASE}/review-queue/${params.itemId}/resolve`, {
    method: "POST",
    params: {
      ...scopeParams(params.envId, params.businessId),
      resolved_by: params.resolvedBy,
      notes: params.notes,
    },
  });
}

export async function listSubscriptions(params: {
  envId: string;
  businessId?: string;
  activeOnly?: boolean;
  spendType?: SpendType;
}): Promise<{ count: number; rows: SubscriptionRow[] }> {
  return bosFetch(`${BASE}/subscriptions/ledger`, {
    params: {
      ...scopeParams(params.envId, params.businessId),
      active_only: (params.activeOnly ?? true) ? "true" : "false",
      spend_type: params.spendType,
    },
  });
}

export async function listOccurrences(params: {
  envId: string;
  businessId?: string;
  subscriptionId: string;
  limit?: number;
}): Promise<{ count: number; rows: OccurrenceRow[] }> {
  return bosFetch(`${BASE}/subscriptions/${params.subscriptionId}/occurrences`, {
    params: {
      ...scopeParams(params.envId, params.businessId),
      limit: params.limit ? String(params.limit) : undefined,
    },
  });
}

export async function markSubscriptionNonBusiness(params: {
  envId: string;
  businessId?: string;
  subscriptionId: string;
}): Promise<{ updated: boolean }> {
  return bosFetch(`${BASE}/subscriptions/${params.subscriptionId}/mark-non-business`, {
    method: "POST",
    params: scopeParams(params.envId, params.businessId),
  });
}

export async function attachIntakeToSubscription(params: {
  envId: string;
  businessId?: string;
  intakeId: string;
  subscriptionId: string;
}): Promise<{ occurrence_id: string; subscription_id: string }> {
  return bosFetch(`${BASE}/receipts/${params.intakeId}/attach-subscription`, {
    method: "POST",
    params: {
      ...scopeParams(params.envId, params.businessId),
      subscription_id: params.subscriptionId,
    },
  });
}

export async function suppressOccurrence(params: {
  envId: string;
  businessId?: string;
  occurrenceId: string;
}): Promise<{ suppressed: boolean }> {
  return bosFetch(`${BASE}/occurrences/${params.occurrenceId}/suppress`, {
    method: "POST",
    params: scopeParams(params.envId, params.businessId),
  });
}

export async function setOccurrenceReviewState(params: {
  envId: string;
  businessId?: string;
  occurrenceId: string;
  reviewState: "confirmed" | "rejected" | "non_business" | "mixed" | "manual";
  notes?: string;
}): Promise<{ updated: boolean; review_state: string }> {
  return bosFetch(`${BASE}/occurrences/${params.occurrenceId}/review-state`, {
    method: "POST",
    params: {
      ...scopeParams(params.envId, params.businessId),
      review_state: params.reviewState,
      notes: params.notes,
    },
  });
}

export async function processIntake(params: {
  envId: string;
  businessId?: string;
  intakeId: string;
}): Promise<Record<string, unknown>> {
  return bosFetch(`${BASE}/receipts/${params.intakeId}/process`, {
    method: "POST",
    params: scopeParams(params.envId, params.businessId),
  });
}

export async function fetchAiSoftwareSummary(params: {
  envId: string;
  businessId?: string;
  periodStart?: string;
  periodEnd?: string;
}): Promise<AiSoftwareSummary> {
  return bosFetch(`${BASE}/reports/ai-software-summary`, {
    params: {
      ...scopeParams(params.envId, params.businessId),
      period_start: params.periodStart,
      period_end: params.periodEnd,
    },
  });
}

export async function detectRecurring(params: {
  envId: string;
  businessId?: string;
}): Promise<{ processed: number }> {
  return bosFetch(`${BASE}/subscriptions/detect-recurring`, {
    method: "POST",
    params: scopeParams(params.envId, params.businessId),
  });
}

export async function fetchSoftwareSpend(params: {
  envId: string;
  businessId?: string;
  periodStart?: string;
  periodEnd?: string;
}): Promise<SoftwareSpendReport> {
  return bosFetch(`${BASE}/reports/software-spend`, {
    params: {
      ...scopeParams(params.envId, params.businessId),
      period_start: params.periodStart,
      period_end: params.periodEnd,
    },
  });
}

export async function fetchAppleBilledSpend(params: {
  envId: string;
  businessId?: string;
  periodStart?: string;
  periodEnd?: string;
}): Promise<AppleBilledReport> {
  return bosFetch(`${BASE}/reports/apple-billed-spend`, {
    params: {
      ...scopeParams(params.envId, params.businessId),
      period_start: params.periodStart,
      period_end: params.periodEnd,
    },
  });
}

export async function fetchToolingMom(params: {
  envId: string;
  businessId?: string;
  months?: number;
}): Promise<{ rows: Array<{ month: string; total_spend: string | number | null }> }> {
  return bosFetch(`${BASE}/reports/tooling-mom`, {
    params: {
      ...scopeParams(params.envId, params.businessId),
      months: params.months ? String(params.months) : undefined,
    },
  });
}
