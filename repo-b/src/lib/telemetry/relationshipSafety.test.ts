import { describe, expect, it } from "vitest";

import {
  classifyRelationship,
  foreignKeyLink,
  grainOf,
  tallyVerdicts,
} from "./relationshipSafety";
import type { TelemetryMetadataEdge, TelemetryMetadataNode } from "./metadata";

function node(over: Partial<TelemetryMetadataNode> & { id: string }): TelemetryMetadataNode {
  return { label: over.id, kind: "table", confidence: "explicit", status: "fresh", ...over };
}
function edge(over: Partial<TelemetryMetadataEdge> & { source: string; target: string }): TelemetryMetadataEdge {
  return { id: `${over.source}->${over.target}`, relationship: "references", confidence: "explicit", ...over };
}

describe("relationshipSafety.classifyRelationship", () => {
  // ── The cardinal guarantee: no fake "safe" verdict without metadata support ──────────────────
  it("NEVER returns safe for a references edge with no FK and no grain (fails closed to unverifiable)", () => {
    const s = node({ id: "a", object_name: "a", metadata: {} });
    const t = node({ id: "b", object_name: "b", metadata: {} });
    const r = classifyRelationship(edge({ source: "a", target: "b", relationship: "references" }), s, t);
    expect(r.verdict).toBe("unverifiable");
    expect(r.verdict).not.toBe("safe");
    expect(r.nullReason).toBe("no_foreign_key_or_grain_to_confirm_join");
  });

  it("returns safe ONLY with positive evidence — a declared foreign key, explicit, both fresh", () => {
    const s = node({ id: "pred", object_name: "tel_predictions", status: "fresh", metadata: { foreign_keys: { run_id: "tel_test_runs.id" } } });
    const t = node({ id: "runs", object_name: "tel_test_runs", status: "fresh", metadata: { primary_key: ["id"] } });
    const r = classifyRelationship(edge({ source: "pred", target: "runs", relationship: "references" }), s, t);
    expect(r.verdict).toBe("safe");
    expect(r.foreignKeyLink).toBe("run_id → tel_test_runs.id");
  });

  it("returns safe when both sides declare the SAME grain (explicit, fresh)", () => {
    const s = node({ id: "g1", metadata: { grain: "printer telemetry event" } });
    const t = node({ id: "g2", metadata: { grain: "printer telemetry event" } });
    const r = classifyRelationship(edge({ source: "g1", target: "g2", relationship: "exports_to" }), s, t);
    expect(r.verdict).toBe("safe");
  });

  it("downgrades a would-be-safe FK join to bridge_required when confidence is inferred", () => {
    const s = node({ id: "pred", object_name: "tel_predictions", metadata: { foreign_keys: { run_id: "tel_test_runs.id" } } });
    const t = node({ id: "runs", object_name: "tel_test_runs", metadata: { primary_key: ["id"] } });
    const r = classifyRelationship(edge({ source: "pred", target: "runs", relationship: "references", confidence: "inferred" }), s, t);
    expect(r.verdict).toBe("bridge_required");
  });

  it("classifies a transform edge as bridge_required even with no grain declared (grain changes by design)", () => {
    const s = node({ id: "bronze", metadata: {} });
    const t = node({ id: "silver", metadata: {} });
    const r = classifyRelationship(edge({ source: "bronze", target: "silver", relationship: "cleans_to" }), s, t);
    expect(r.verdict).toBe("bridge_required");
    expect(r.bridgePath).toBeTruthy();
  });

  it("flags bridge_required when grains differ on a direct-join edge", () => {
    const s = node({ id: "x", metadata: { grain: "printer telemetry event" } });
    const t = node({ id: "y", metadata: { grain: "day x work_center_id" } });
    const r = classifyRelationship(edge({ source: "x", target: "y", relationship: "references" }), s, t);
    expect(r.verdict).toBe("bridge_required");
    expect(r.bridgePath).toContain("Grain changes");
  });

  it("returns unsafe when an endpoint's data is missing/quarantined", () => {
    const s = node({ id: "x", status: "missing", metadata: { foreign_keys: { k: "y.id" } } });
    const t = node({ id: "y", object_name: "y", status: "fresh", metadata: {} });
    const r = classifyRelationship(edge({ source: "x", target: "y" }), s, t);
    expect(r.verdict).toBe("unsafe");
  });

  it("treats consumption edges (defines_metric / feeds_dashboard) as not-a-join (unverifiable, not safe)", () => {
    const s = node({ id: "m", metadata: { grain: "g" } });
    const t = node({ id: "d", metadata: { grain: "g" } });
    for (const rel of ["defines_metric", "feeds_dashboard", "feeds_model", "used_by_ai"] as const) {
      const r = classifyRelationship(edge({ source: "m", target: "d", relationship: rel }), s, t);
      expect(r.verdict).toBe("unverifiable");
      expect(r.verdict).not.toBe("safe");
      expect(r.nullReason).toBe("not_a_join_consumption_edge");
    }
  });

  it("fails closed to unverifiable when a node is missing from the graph", () => {
    const r = classifyRelationship(edge({ source: "a", target: "ghost" }), node({ id: "a" }), undefined);
    expect(r.verdict).toBe("unverifiable");
    expect(r.nullReason).toBe("endpoint_node_missing_from_catalog");
  });

  it("never lets an inferred edge with no metadata read as safe", () => {
    const s = node({ id: "a", metadata: {} });
    const t = node({ id: "b", metadata: {} });
    const r = classifyRelationship(edge({ source: "a", target: "b", relationship: "references", confidence: "inferred" }), s, t);
    expect(r.verdict).not.toBe("safe");
  });
});

describe("relationshipSafety helpers", () => {
  it("grainOf reads a trimmed string grain or null", () => {
    expect(grainOf(node({ id: "a", metadata: { grain: "  unit-cycle " } }))).toBe("unit-cycle");
    expect(grainOf(node({ id: "a", metadata: {} }))).toBeNull();
  });

  it("foreignKeyLink matches the target object_name", () => {
    const s = node({ id: "a", metadata: { foreign_keys: { run_id: "tel_test_runs.id" } } });
    expect(foreignKeyLink(s, node({ id: "b", object_name: "tel_test_runs" }))).toBe("run_id → tel_test_runs.id");
    expect(foreignKeyLink(s, node({ id: "b", object_name: "other_table" }))).toBeNull();
  });

  it("tallyVerdicts counts by verdict", () => {
    const t = tallyVerdicts([
      { verdict: "safe" } as never,
      { verdict: "bridge_required" } as never,
      { verdict: "bridge_required" } as never,
      { verdict: "unverifiable" } as never,
    ]);
    expect(t).toEqual({ safe: 1, bridge_required: 2, unsafe: 0, unverifiable: 1 });
  });
});
