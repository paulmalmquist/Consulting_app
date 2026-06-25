import { describe, expect, it } from "vitest";

import {
  templateExecutability,
  WORKFLOW_TEMPLATES,
} from "./workflowTemplates";
import type { SkillSummary } from "@/lib/automated-data-engineering/api";

function skill(name: string): SkillSummary {
  return {
    name, module: name.split(".")[0], description: name, permission: "read",
    side_effect_class: "read", permission_required: "read", confirmation_required: false,
    lane_tags: [], skill_tags: [], input_fields: [],
  };
}
const tmpl = (key: string) => WORKFLOW_TEMPLATES.find((t) => t.key === key)!;

describe("workflowTemplates", () => {
  it("ships the six named templates", () => {
    expect(WORKFLOW_TEMPLATES.map((t) => t.key)).toEqual([
      "ingest_new_telemetry_source",
      "add_governed_metric",
      "create_model_feature_table",
      "investigate_stale_dashboard_metric",
      "validate_model_input_drift",
      "add_ncr_clustering_source",
    ]);
  });

  it("every template declares purpose, inputs, steps, and tests", () => {
    for (const t of WORKFLOW_TEMPLATES) {
      expect(t.purpose.length).toBeGreaterThan(0);
      expect(t.requiredInputs.length).toBeGreaterThan(0);
      expect(t.steps.length).toBeGreaterThan(0);
      expect(t.tests.length).toBeGreaterThan(0);
    }
  });

  it("is 'unavailable' when the registry cannot be read (fail closed, no guess)", () => {
    const t = templateExecutability(tmpl("add_governed_metric"), { tools: [], null_reason: "workflow_read_unavailable" });
    expect(t.state).toBe("unavailable");
    expect(t.reason).toBe("workflow_read_unavailable");
  });

  it("is 'blocked' when a skill-bearing step has no registered governed skill", () => {
    // Only dry-run SQL is backed; profile/contract/etc. are not -> blocked.
    const t = templateExecutability(tmpl("add_governed_metric"), { tools: [skill("sql.validate_query")], null_reason: null });
    expect(t.state).toBe("blocked");
    expect(t.reason).toMatch(/No registered governed skill/);
  });

  it("never returns 'executable' — there is no run path, so the ceiling is read_only_template", () => {
    // Provide a registry where EVERY capability matches a skill; still must not be 'executable'.
    const allBacking = [
      "x.profile_source", "x.infer_grain", "x.validate_join", "x.run_quality", "x.generate_contract",
      "x.propose_feature", "sql.validate_query", "x.create_pr", "x.write_audit_receipt",
    ].map(skill);
    for (const t of WORKFLOW_TEMPLATES) {
      const exec = templateExecutability(t, { tools: allBacking, null_reason: null });
      expect(exec.state).not.toBe("executable");
      expect(["read_only_template", "blocked"]).toContain(exec.state);
    }
  });

  it("reports per-step backing (real skill name) for backed steps", () => {
    const t = templateExecutability(tmpl("create_model_feature_table"), { tools: [skill("sql.validate_query")], null_reason: null });
    // The dry-run SQL step should resolve to the real skill; unbacked steps stay null.
    expect(t.stepBacking).toContain("sql.validate_query");
    expect(t.stepBacking.some((b) => b === null)).toBe(true);
  });
});
