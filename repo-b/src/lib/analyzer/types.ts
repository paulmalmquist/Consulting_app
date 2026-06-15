// Universal AnalyzerFinding contract — TypeScript mirror (plan PR 8.5).
//
// Every UI that consumes analyzer output (cards, future reels, investigation sections,
// agent feeds) imports this type — no inline type invention. Mirrors the Python contract
// in backend/app/services/analyzer_contract.py. Keep the two in sync.

export type AnalyzerType = "telemetry" | "data_platform" | "business";
export type FindingSeverity = "info" | "warning" | "critical";
export type FindingEvalStatus = "pass" | "fail" | "pending" | null;

export interface FindingDriverMath {
  contributor: string;
  contribution_pct: number;
  evidence_row?: string;
}

export interface AnalyzerFinding {
  finding_id: string;
  env_id: string;
  analyzer_type: AnalyzerType;
  source_ref: Record<string, unknown>;
  severity: FindingSeverity;
  what_changed: string;
  why_it_matters: string;
  confidence: number; // 0-1, banded (see CONFIDENCE_BANDS)
  evidence_refs: string[];
  metric_refs: string[];
  driver_math: FindingDriverMath | null;
  null_reasons: string[];
  recommendations: string[];
  next_questions: string[];
  cost_to_generate_usd: number | null;
  latency_ms: number | null;
  eval_status: FindingEvalStatus;
}

// Documented confidence bands (mirror of the Python contract).
export const CONFIDENCE_BANDS = {
  measured: [0.9, 1.0], // directly measured / reconciled to a governed metric
  strong: [0.7, 0.89], // strong evidence, minor assumptions
  directional: [0.5, 0.69], // directional / incomplete evidence
  informational: [0.0, 0.49], // informational only — cannot drive critical/anomaly
} as const;

export const HIGH_CONFIDENCE = 0.7;

// Client-side guard mirroring the contract's load-bearing rule. Analyzers validate
// server-side; this lets the UI defensively reject a malformed finding rather than
// render an ungrounded high-confidence/critical claim.
export function isFindingHonest(f: AnalyzerFinding): boolean {
  const hasEvidence = f.evidence_refs.length > 0;
  if (f.confidence >= HIGH_CONFIDENCE && !hasEvidence) return false;
  if (f.severity === "critical" && !hasEvidence) return false;
  if (f.severity === "critical" && f.confidence < 0.5) return false;
  return true;
}
