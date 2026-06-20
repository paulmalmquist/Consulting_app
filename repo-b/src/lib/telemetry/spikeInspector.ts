// Telemetry Spike Inspector — real findings from the telemetry analyzer.
//
// SINGLE SOURCE OF TRUTH: the backend telemetry analyzer (`/api/telemetry/findings`, which delegates
// to `telemetry_analyzer.analyze`). It grounds findings in the already-seeded tel_* serving reads
// (monitoring / model_performance) with rule-based severity and fails closed with `null_reasons`.
//
// There is NO static/demo data here. When the analyzer has no findings or a source is unavailable,
// the UI fails closed and names the reason — it never falls back to fabricated cards.

import { apiFetch } from "@/lib/api";
import { TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID } from "./api";
import { C } from "@/components/telemetry/primitives";

export type Severity = "info" | "warning" | "critical";

// Mirrors the backend AnalyzerFinding contract (backend/app/services/analyzer_contract.py).
export interface AnalyzerFinding {
  finding_id: string;
  env_id?: string;
  analyzer_type?: string;
  source_ref: Record<string, unknown>; // provenance: { source, field, model, ... }
  severity: Severity;
  what_changed: string;
  why_it_matters: string;
  confidence: number;
  evidence_refs: string[];
  metric_refs?: string[];
  recommendations: string[];
  next_questions?: string[];
  latency_ms?: number | null;
}

export interface NullReason {
  source: string;
  reason: string;
}

export interface FindingsProvenance {
  surface: string;
  mode: string;
  source: string;
  tenant: string;
  rows_evaluated: number | null;
  last_refresh: string;
  fallback_used: boolean;
}

export interface FindingsResponse {
  analyzer_type: string;
  findings: AnalyzerFinding[];
  null_reasons: NullReason[];
  by_severity: Record<Severity, number>;
  finding_count: number;
  provenance: FindingsProvenance;
  null_reason: string | null;
}

export function getFindings(
  envId: string = TELEMETRY_DEMO_ENV_ID,
  businessId: string = TELEMETRY_DEMO_BUSINESS_ID,
): Promise<FindingsResponse> {
  return apiFetch<FindingsResponse>("/api/telemetry/findings", {
    params: { env_id: envId, business_id: businessId },
  });
}

// ── display helpers (honest, derived from real fields only) ──────────────────

export function severityColor(sev: Severity): string {
  if (sev === "critical") return C.red;
  if (sev === "warning") return C.amber;
  return C.cyan; // info
}

export function severityRank(sev: Severity): number {
  if (sev === "critical") return 0;
  if (sev === "warning") return 1;
  return 2; // info
}

// UI policy, not data: critical/warning findings require a human gate before any operator response.
// Documented so it is never mistaken for a backend-provided field.
export function humanGateRequired(sev: Severity): boolean {
  return sev === "critical" || sev === "warning";
}

// Best-effort freshness pulled from a finding's evidence (e.g. "last_scored_at=..."). Returns the raw
// timestamp string or null — never fabricated.
export function findingFreshness(f: AnalyzerFinding): string | null {
  for (const e of f.evidence_refs ?? []) {
    const m = /last_scored_at=(.+)$/.exec(e);
    if (m && m[1] && m[1] !== "None") return m[1];
  }
  return null;
}

// A short provenance line from source_ref for the evidence panel.
export function sourceLabel(ref: Record<string, unknown>): string {
  const src = (ref?.source as string) ?? "unknown";
  const field = ref?.field ? ` · ${ref.field as string}` : "";
  const model = ref?.model_name
    ? ` · ${ref.model_name as string}`
    : ref?.model
      ? ` · ${ref.model as string}`
      : "";
  return `${src}${field}${model}`;
}
