import { describe, it, expect } from "vitest";

import {
  FLOW_SCENARIOS,
  FLOW_LANES,
  FLOW_EXPLORER_CAPTION,
  type NullReason,
} from "./flowExplorerData";
import { IMPL_LABEL, VERIFY_LABEL } from "./howItWorksData";
import { TELEMETRY_NAV } from "./telemetryNav";

const IMPL_KEYS = new Set(Object.keys(IMPL_LABEL));
const VERIFY_KEYS = new Set(Object.keys(VERIFY_LABEL));
const VALID_SLUGS = new Set<string>(TELEMETRY_NAV.map((n) => n.slug));
const NULL_REASONS: Set<NullReason> = new Set([
  "unsupported_question", "live_data_not_available", "model_not_promoted",
  "data_source_not_configured", "write_not_confirmed", "unpermissioned_tool",
]);
const LANE_ORDER = FLOW_LANES.map((l) => l.kind);

describe("flowExplorerData — Flow Explorer scenarios (honest, grounded, well-formed)", () => {
  it("ships at least 4 scenarios (the spec asks ≥4; we ship 5) with unique ids + trace ids", () => {
    expect(FLOW_SCENARIOS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(FLOW_SCENARIOS.map((s) => s.id)).size).toBe(FLOW_SCENARIOS.length);
    expect(new Set(FLOW_SCENARIOS.map((s) => s.traceId)).size).toBe(FLOW_SCENARIOS.length);
  });

  it("each scenario has exactly the 6 lanes in canonical order", () => {
    for (const s of FLOW_SCENARIOS) {
      expect(s.lanes.map((l) => l.lane), s.id).toEqual(LANE_ORDER);
    }
  });

  it("every step + scenario uses valid impl/verify status enums", () => {
    for (const s of FLOW_SCENARIOS) {
      expect(IMPL_KEYS.has(s.impl), `${s.id} impl`).toBe(true);
      expect(VERIFY_KEYS.has(s.verify), `${s.id} verify`).toBe(true);
      for (const step of s.lanes) {
        expect(IMPL_KEYS.has(step.impl), `${s.id}/${step.id} impl`).toBe(true);
        expect(VERIFY_KEYS.has(step.verify), `${s.id}/${step.id} verify`).toBe(true);
        expect(step.label.trim() && step.realName.trim() && step.detail.trim(), `${step.id} text`).toBeTruthy();
      }
    }
  });

  it("every nullReason (step + fail-closed) is in the real vocabulary", () => {
    for (const s of FLOW_SCENARIOS) {
      for (const step of s.lanes) {
        if (step.nullReason) expect(NULL_REASONS.has(step.nullReason), `${step.id}`).toBe(true);
      }
      expect(NULL_REASONS.has(s.failClosed.nullReason), `${s.id} failClosed`).toBe(true);
    }
  });

  it("every evidenceSlug points at a real telemetry route (no dead deep-links)", () => {
    for (const s of FLOW_SCENARIOS) {
      for (const step of s.lanes) {
        if (step.evidenceSlug !== undefined) {
          expect(VALID_SLUGS.has(step.evidenceSlug), `${s.id}/${step.id} slug "${step.evidenceSlug}"`).toBe(true);
        }
      }
    }
  });

  it("trace steps are contiguous 0..6", () => {
    for (const s of FLOW_SCENARIOS) {
      expect(s.trace.map((x) => x.n), s.id).toEqual([0, 1, 2, 3, 4, 5, 6]);
      for (const step of s.trace) expect(step.line.trim(), `${s.id} trace ${step.n}`).toBeTruthy();
    }
  });

  it("every scenario has a happy path and a fail-closed branch with an outcome", () => {
    for (const s of FLOW_SCENARIOS) {
      expect(s.happyPath.trim(), `${s.id} happyPath`).toBeTruthy();
      expect(s.failClosed.trigger.trim() && s.failClosed.outcome.trim(), `${s.id} failClosed`).toBeTruthy();
    }
  });

  it("the named scenarios fail closed with the right reason (no fabrication)", () => {
    const agg = FLOW_SCENARIOS.find((s) => s.id === "aggregate-count")!;
    expect(agg.failClosed.nullReason).toBe("unsupported_question");
    const live = FLOW_SCENARIOS.find((s) => s.id === "live-freshness")!;
    expect(live.failClosed.nullReason).toBe("live_data_not_available");
    // the stale path's honesty note is recorded, not buried
    expect(live.failClosed.observed).toMatch(/unit-verified, not production-observed/i);
  });

  it("the caption carries the 'not a live execution' disclaimer", () => {
    expect(FLOW_EXPLORER_CAPTION).toMatch(/No live call is made/i);
    expect(FLOW_EXPLORER_CAPTION).toMatch(/nothing here executes/i);
  });
});
