// Aerospace data-engineering capability map for the Agent Workbench (Phase 2B). Pure + testable.
//
// These are the data-engineering ACTIONS the workbench is meant to offer, grouped by what they do to
// the data (Observe / Propose / Execute-with-guardrails). Each capability is matched against the LIVE
// governed skill registry: if a real skill backs it, the card shows that skill's real permission /
// side-effect / confirmation; if not, it is shown as a *declared capability that cannot run* — never
// implied runnable. Matchers are deliberately specific name tokens so we never falsely claim a
// wrong-domain skill (e.g. an accounting "receipt" tool is NOT an audit-receipt capability).

import type { SkillSummary } from "@/lib/automated-data-engineering/api";

export type DeMode = "observe" | "propose" | "execute";

export const DE_MODE_LABEL: Record<DeMode, string> = {
  observe: "Observe",
  propose: "Propose",
  execute: "Execute with guardrails",
};

export const DE_MODE_BLURB: Record<DeMode, string> = {
  observe: "Read-only: inspect the data without side effects.",
  propose: "Draft an artifact or change for review — nothing runs.",
  execute: "A run that is read-only or fails closed until confirmed.",
};

export type DeCapability = {
  key: string;
  label: string;
  mode: DeMode;
  blurb: string;
  /** Specific lowercase name tokens that indicate a TRUE backing skill (avoid loose matches). */
  matchers: string[];
};

export const DE_CAPABILITIES: DeCapability[] = [
  { key: "profile_source", label: "Profile source", mode: "observe",
    blurb: "Row counts, null rates, distincts, and freshness for a source.", matchers: ["profile_source", "profile_table"] },
  { key: "infer_grain", label: "Infer grain", mode: "observe",
    blurb: "Determine the row grain (keys × period) of a table.", matchers: ["infer_grain", "detect_grain"] },
  { key: "validate_relationship", label: "Validate relationship", mode: "observe",
    blurb: "Check whether a join between two tables is safe.", matchers: ["validate_join", "validate_relationship", "join_path"] },
  { key: "run_quality_check", label: "Run quality check", mode: "observe",
    blurb: "Evaluate declared data-quality assertions for a table.", matchers: ["run_quality", "quality_check", "dq_assertion"] },
  { key: "generate_source_contract", label: "Generate source contract", mode: "propose",
    blurb: "Draft a source contract: schema, grain, keys, freshness SLA.", matchers: ["generate_contract", "source_contract"] },
  { key: "propose_feature_table", label: "Propose feature table", mode: "propose",
    blurb: "Draft a point-in-time-safe feature table definition.", matchers: ["propose_feature", "feature_table"] },
  { key: "dry_run_sql", label: "Dry-run SQL", mode: "execute",
    blurb: "Validate / plan SQL without writing — read-only execution.", matchers: ["validate_query", "dry_run_sql"] },
  { key: "open_pr", label: "Open PR", mode: "execute",
    blurb: "Open a pull request with the proposed change for review.", matchers: ["create_pr", "open_pr", "pull_request"] },
  { key: "write_receipt", label: "Write receipt", mode: "execute",
    blurb: "Record an audit receipt for a governed action.", matchers: ["write_audit_receipt", "record_audit_receipt"] },
];

/** First registry skill whose name contains one of the capability's specific matchers, else null. */
export function matchSkill(cap: DeCapability, tools: SkillSummary[]): SkillSummary | null {
  for (const t of tools) {
    const name = t.name.toLowerCase();
    if (cap.matchers.some((m) => name.includes(m))) return t;
  }
  return null;
}

export function capabilitiesByMode(): Record<DeMode, DeCapability[]> {
  const out: Record<DeMode, DeCapability[]> = { observe: [], propose: [], execute: [] };
  for (const c of DE_CAPABILITIES) out[c.mode].push(c);
  return out;
}

export const DE_MODES: DeMode[] = ["observe", "propose", "execute"];
