import { describe, expect, it } from "vitest";

import {
  capabilitiesByMode,
  DE_CAPABILITIES,
  matchSkill,
  type DeCapability,
} from "./deCapabilities";
import type { SkillSummary } from "@/lib/automated-data-engineering/api";

function skill(name: string, over: Partial<SkillSummary> = {}): SkillSummary {
  return {
    name, module: name.split(".")[0], description: name, permission: "read",
    side_effect_class: "read", permission_required: "read", confirmation_required: false,
    lane_tags: [], skill_tags: [], input_fields: [], ...over,
  };
}
const cap = (key: string): DeCapability => DE_CAPABILITIES.find((c) => c.key === key)!;

describe("deCapabilities", () => {
  it("exposes the nine aerospace DE capabilities", () => {
    expect(DE_CAPABILITIES.map((c) => c.key)).toEqual([
      "profile_source", "infer_grain", "validate_relationship", "run_quality_check",
      "generate_source_contract", "propose_feature_table", "dry_run_sql", "open_pr", "write_receipt",
    ]);
  });

  it("groups capabilities into observe / propose / execute", () => {
    const g = capabilitiesByMode();
    expect(g.observe.map((c) => c.key)).toEqual(["profile_source", "infer_grain", "validate_relationship", "run_quality_check"]);
    expect(g.propose.map((c) => c.key)).toEqual(["generate_source_contract", "propose_feature_table"]);
    expect(g.execute.map((c) => c.key)).toEqual(["dry_run_sql", "open_pr", "write_receipt"]);
  });

  it("matches dry-run SQL to a real validate_query skill", () => {
    const tools = [skill("sql.validate_query"), skill("sql.describe_schema")];
    const m = matchSkill(cap("dry_run_sql"), tools);
    expect(m?.name).toBe("sql.validate_query");
  });

  it("does NOT match write_receipt to wrong-domain accounting receipt tools (no false backing)", () => {
    const tools = [skill("novendor.accounting.receipt.ingest"), skill("novendor.accounting.receipt.classify")];
    expect(matchSkill(cap("write_receipt"), tools)).toBeNull();
  });

  it("does NOT match open_pr to approvals / provenance tools that merely contain 'pr'", () => {
    const tools = [skill("repe.approve_change"), skill("repe.get_metric_provenance"), skill("platform.list_approvals")];
    expect(matchSkill(cap("open_pr"), tools)).toBeNull();
  });

  it("does NOT match generate_source_contract to a sql-with-contract runner", () => {
    const tools = [skill("repe.run_readonly_sql_with_contract")];
    expect(matchSkill(cap("generate_source_contract"), tools)).toBeNull();
  });

  it("returns null for capabilities with no registered skill (fail-closed default)", () => {
    const tools = [skill("bm.health_check"), skill("business.create")];
    for (const key of ["profile_source", "infer_grain", "validate_relationship", "run_quality_check", "propose_feature_table"]) {
      expect(matchSkill(cap(key), tools)).toBeNull();
    }
  });
});
