// Workflow templates for the Data Engineering Workflow Registry (Phase 2C). Pure + testable.
//
// These are DOCUMENTED, READ-ONLY workflow shapes — the ordered steps a governed data-engineering job
// would take, the skills each step needs, and the tests/evals it must pass. They do NOT execute:
// there is no run path, so nothing here fabricates a run, a receipt, or a backend result. A template's
// executability is computed honestly from the live skill registry — whether each step's capability is
// backed by a registered governed skill (reusing the Phase 2B capability matcher). Until execution is
// wired, the ceiling is "read-only template"; a template whose steps lack a backing skill is "blocked".

import type { SkillSummary } from "@/lib/automated-data-engineering/api";
import { DE_CAPABILITIES, matchSkill, type DeCapability } from "./deCapabilities";

export type Executability = "executable" | "read_only_template" | "blocked" | "unavailable";

export const EXECUTABILITY_LABEL: Record<Executability, string> = {
  executable: "Executable",
  read_only_template: "Read-only template",
  blocked: "Blocked",
  unavailable: "Unavailable",
};

export type WorkflowStep = {
  name: string;
  /** Capability key from deCapabilities (drives backing/executability), or null for a manual step. */
  capabilityKey: string | null;
  detail: string;
};

export type WorkflowTemplate = {
  key: string;
  name: string;
  purpose: string;
  requiredInputs: string[];
  steps: WorkflowStep[];
  tests: string[];
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: "ingest_new_telemetry_source",
    name: "Ingest new telemetry source",
    purpose: "Land a new source into the medallion path with a declared contract before anything depends on it.",
    requiredInputs: ["source connection / topic", "expected schema", "owner"],
    steps: [
      { name: "Profile the source", capabilityKey: "profile_source", detail: "Row counts, null rates, freshness." },
      { name: "Infer grain", capabilityKey: "infer_grain", detail: "Establish keys × period." },
      { name: "Generate source contract", capabilityKey: "generate_source_contract", detail: "Schema, grain, keys, freshness SLA." },
      { name: "Open PR", capabilityKey: "open_pr", detail: "Contract + bronze landing for review." },
    ],
    tests: ["schema matches contract", "row count > 0", "freshness within SLA"],
  },
  {
    key: "add_governed_metric",
    name: "Add governed metric",
    purpose: "Define a metric with a formula, grain, and source lineage so dashboards can trust it.",
    requiredInputs: ["metric definition", "source gold table", "owner"],
    steps: [
      { name: "Validate source relationship", capabilityKey: "validate_relationship", detail: "Confirm the gold source joins safely." },
      { name: "Dry-run the metric SQL", capabilityKey: "dry_run_sql", detail: "Validate the query without writing." },
      { name: "Generate metric contract", capabilityKey: "generate_source_contract", detail: "Formula, grain, owner, freshness." },
      { name: "Open PR", capabilityKey: "open_pr", detail: "Metric definition for review." },
    ],
    tests: ["formula compiles", "grain declared", "lineage resolves to a source"],
  },
  {
    key: "create_model_feature_table",
    name: "Create model feature table",
    purpose: "Draft a point-in-time-safe feature table for a model, with leakage guards.",
    requiredInputs: ["target entity + label", "candidate sources", "feature window"],
    steps: [
      { name: "Profile candidate sources", capabilityKey: "profile_source", detail: "Coverage and freshness per source." },
      { name: "Validate join paths", capabilityKey: "validate_relationship", detail: "Only safe / bridged joins." },
      { name: "Propose feature table", capabilityKey: "propose_feature_table", detail: "PIT-safe columns, no look-ahead." },
      { name: "Dry-run feature SQL", capabilityKey: "dry_run_sql", detail: "Validate before any write." },
    ],
    tests: ["no future ticks (PIT control)", "train/test split by run", "missing-coverage quarantine"],
  },
  {
    key: "investigate_stale_dashboard_metric",
    name: "Investigate stale dashboard metric",
    purpose: "Trace why a dashboard number is stale and surface the failing stage — fail closed, never guess.",
    requiredInputs: ["dashboard metric id"],
    steps: [
      { name: "Trace lineage", capabilityKey: null, detail: "Walk upstream via the metadata catalog (Relationships & Lineage)." },
      { name: "Run quality check", capabilityKey: "run_quality_check", detail: "Evaluate DQ assertions on each upstream stage." },
      { name: "Profile the stalest source", capabilityKey: "profile_source", detail: "Confirm freshness gap at the root." },
    ],
    tests: ["root stage identified", "freshness gap quantified", "no value substituted while stale"],
  },
  {
    key: "validate_model_input_drift",
    name: "Validate model input drift",
    purpose: "Check whether a model's input distribution has drifted before trusting new scores.",
    requiredInputs: ["model + version", "scoring window"],
    steps: [
      { name: "Profile input features", capabilityKey: "profile_source", detail: "Distribution stats over the window." },
      { name: "Run quality check", capabilityKey: "run_quality_check", detail: "Drift / range assertions vs. training." },
      { name: "Dry-run the drift query", capabilityKey: "dry_run_sql", detail: "Validate PSI/KL computation read-only." },
    ],
    tests: ["PSI within budget", "no schema drift", "scoring window aligns to features"],
  },
  {
    key: "add_ncr_clustering_source",
    name: "Add NCR clustering source",
    purpose: "Bring a non-conformance corpus into the clustering pipeline with a governed contract.",
    requiredInputs: ["NCR corpus location", "expected fields", "owner"],
    steps: [
      { name: "Profile the NCR corpus", capabilityKey: "profile_source", detail: "Field coverage, record counts." },
      { name: "Infer grain", capabilityKey: "infer_grain", detail: "One row per non-conformance event." },
      { name: "Generate source contract", capabilityKey: "generate_source_contract", detail: "Fields, grain, owner." },
      { name: "Open PR", capabilityKey: "open_pr", detail: "Contract + clustering wiring for review." },
    ],
    tests: ["required fields present", "grain = one row per NCR", "corpus row count > 0"],
  },
];

function capByKey(key: string): DeCapability | undefined {
  return DE_CAPABILITIES.find((c) => c.key === key);
}

export type TemplateExecutability = {
  state: Executability;
  reason: string | null;
  /** Per-step backing: the matched skill name, or null if the step is unbacked/manual. */
  stepBacking: (string | null)[];
};

/**
 * Compute a template's executability from the live registry. Honest by construction:
 * - registry unavailable           → "unavailable"
 * - any backed step requires data   → never "executable" (no run path is wired) → "read_only_template"
 * - a skill-bearing step is unbacked→ "blocked" (cannot run even in principle) with a reason
 * No template returns "executable" today — there is no execution path, and claiming one would imply
 * runnability we do not have.
 */
export function templateExecutability(
  template: WorkflowTemplate,
  registry: { tools: SkillSummary[]; null_reason: string | null } | null,
): TemplateExecutability {
  if (!registry || registry.null_reason) {
    return { state: "unavailable", reason: registry?.null_reason ?? "skill_registry_unavailable", stepBacking: template.steps.map(() => null) };
  }
  const tools = registry.tools;
  const stepBacking = template.steps.map((s) => {
    if (!s.capabilityKey) return null; // manual step, not skill-bearing
    const cap = capByKey(s.capabilityKey);
    const skill = cap ? matchSkill(cap, tools) : null;
    return skill?.name ?? null;
  });

  // Skill-bearing steps whose capability has no registered backing.
  const unbacked = template.steps
    .map((s, i) => ({ s, backed: s.capabilityKey ? stepBacking[i] !== null : true }))
    .filter((x) => x.s.capabilityKey && !x.backed)
    .map((x) => x.s.name);

  if (unbacked.length > 0) {
    return { state: "blocked", reason: `No registered governed skill for: ${unbacked.join(", ")}.`, stepBacking };
  }
  return {
    state: "read_only_template",
    reason: "All steps map to registered skills, but no execution path is wired — documented template only.",
    stepBacking,
  };
}
