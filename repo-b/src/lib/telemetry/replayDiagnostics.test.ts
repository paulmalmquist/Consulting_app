import { describe, it, expect } from "vitest";

import type { ReplayFeed, ReplayTick } from "./api";
import {
  AGREEMENT_CAVEAT,
  computeReplayDiagnostics,
  inspectTick,
  NA_REASONS,
} from "./replayDiagnostics";

// A small synthetic feed that reproduces the shape of the real fixture's load-bearing facts:
// the model fires BEFORE the NASA-labeled window (pre-label false alarms), the labeled window comes
// later, and the score is degenerate at a fire tick. Values are hand-built so the asserts are exact.
function tick(t: number, value: number, rmean: number, model_pred: number, is_anomaly: number, score = 0): ReplayTick {
  return { t, value, rmean, score, model_pred, is_anomaly };
}

// fire ticks at t=10 and t=12 (both pre-label); labeled window [20,22]; one tick (t=20) is TP.
const feed: ReplayFeed = {
  channel: "D-4",
  spacecraft: "MSL",
  fixture_ticks: 8,
  total_ticks_source: 80,
  first_model_fire_t: 10,
  model_fired_ticks: 3,
  label_anomaly_ticks: 3,
  provenance: {
    source_table: "novendor_1.telemetry.gold_replay_feed_scored",
    champion_model: "novendor_1.telemetry.tel_anomaly_detector@champion",
    champion_mlflow_run_id: "4a48cb6af8714609b9581d66e904544c",
    note: "Precomputed REAL champion outputs. model_pred is the model's flag, not hand-authored.",
  },
  feed: [
    tick(0, -1.0, -1.0, 0, 0),
    tick(9, -1.0, -1.0, 0, 0),
    tick(10, 1.0, -0.9, 1, 0, 1.48e12), // pre-label false alarm + degenerate score
    tick(11, -1.0, -0.95, 0, 0),
    tick(12, 0.8, -0.9, 1, 0), // pre-label false alarm
    tick(20, 0.9, 0.1, 1, 1), // TP (fired + labeled)
    tick(21, 0.2, 0.15, 0, 1), // FN (labeled, not fired)
    tick(22, 0.1, 0.12, 0, 1), // FN (labeled, not fired)
  ],
};

describe("computeReplayDiagnostics", () => {
  const d = computeReplayDiagnostics(feed);

  it("is available and carries provenance verbatim", () => {
    expect(d.available).toBe(true);
    expect(d.channel).toBe("D-4");
    expect(d.spacecraft).toBe("MSL");
    expect(d.championMlflowRunId).toBe("4a48cb6af8714609b9581d66e904544c");
    expect(d.sourceTable).toBe("novendor_1.telemetry.gold_replay_feed_scored");
  });

  it("derives the NASA-labeled window from is_anomaly + t", () => {
    expect(d.labeledWindow).toEqual({ start: 20, end: 22 });
  });

  it("reports detection latency WITH its sign and frames pre-label fires as false alarms, not lead time", () => {
    // first fire t=10, labeled start t=20 => 10 - 20 = -10 (negative => pre-label)
    expect(d.detectionLatencyTicks).toBe(-10);
    expect(d.isPreLabel).toBe(true);
    expect(d.preLabelFalseAlarms).toBe(2); // t=10 and t=12 fire before the labeled window
    expect(d.latencyFraming).toMatch(/false alarm/i);
    expect(d.latencyFraming).not.toMatch(/lead time(?!\.)/i); // never sold as lead time
  });

  it("computes the replay-feed confusion matrix and always attaches the not-validation caveat", () => {
    // fired: t=10,12,20 ; labeled: t=20,21,22
    expect(d.confusion.tp).toBe(1); // t=20
    expect(d.confusion.fp).toBe(2); // t=10, t=12
    expect(d.confusion.fn).toBe(2); // t=21, t=22
    expect(d.confusion.tn).toBe(3); // t=0,9,11
    expect(d.confusion.precision).toBeCloseTo(1 / 3, 6);
    expect(d.confusion.recall).toBeCloseTo(1 / 3, 6);
    expect(d.confusion.caveat).toBe(AGREEMENT_CAVEAT);
    expect(d.confusion.caveat).toMatch(/NOT held-out validation/);
  });

  it("the matrix sums to tickCount and (for this fixture) every false positive is pre-label", () => {
    const c = d.confusion;
    expect(c.tp + c.fp + c.fn + c.tn).toBe(d.tickCount);
    // The real replay fixture's load-bearing fact: all the model's false positives precede the label,
    // i.e. fp === preLabelFalseAlarms (no fired-but-unlabeled tick sits after the labeled window here).
    expect(c.fp).toBe(d.preLabelFalseAlarms);
  });
});

describe("computeReplayDiagnostics within-window agreement (recall invariant)", () => {
  // Mirrors the REAL fixture's recall==1.0 / fn==0 fact: every labeled tick is also a fired tick, so
  // the model misses nothing inside the labeled window. Locks that invariant in the adapter so a future
  // change that dropped within-window TPs (recall<1) would fail CI.
  const within: ReplayFeed = {
    ...feed,
    first_model_fire_t: 5,
    model_fired_ticks: 2,
    label_anomaly_ticks: 2,
    feed: [
      tick(0, -1.0, -1.0, 0, 0),
      tick(5, 0.9, 0.1, 1, 1), // TP
      tick(6, 0.8, 0.1, 1, 1), // TP
      tick(7, -1.0, -0.9, 0, 0), // TN
    ],
  };
  const d = computeReplayDiagnostics(within);

  it("has fn==0 and recall==1 when every labeled tick fired", () => {
    expect(d.confusion.fn).toBe(0);
    expect(d.confusion.recall).toBe(1);
    expect(d.confusion.tp + d.confusion.fp + d.confusion.fn + d.confusion.tn).toBe(d.tickCount);
  });

  it("reports no pre-label false alarms and non-negative latency when the model fires inside the window", () => {
    expect(d.preLabelFalseAlarms).toBe(0);
    expect(d.isPreLabel).toBe(false);
    expect(d.detectionLatencyTicks).toBe(0); // first fire t=5 == labeled window start t=5
  });
});

describe("computeReplayDiagnostics — residual & cross-check", () => {
  const d = computeReplayDiagnostics(feed);

  it("uses the raw residual (not the degenerate score) and flags the score as degenerate", () => {
    // residual at fire t=10 = |1.0 - (-0.9)| = 1.9
    expect(d.residualAtFire).toBeCloseTo(1.9, 6);
    expect(d.scoreIsDegenerate).toBe(true);
  });

  it("cross-checks the recomputed scalars against the payload's top-level summary", () => {
    expect(d.crosscheck.firstFire).toBe(true);
    expect(d.crosscheck.fired).toBe(true);
    expect(d.crosscheck.labeled).toBe(true);
    expect(d.firstModelFireT).toBe(10);
    expect(d.samplingFraction).toBeCloseTo(8 / 80, 6);
  });
});

describe("computeReplayDiagnostics fail-closed", () => {
  it("returns available:false with the null reason when the payload is the fail-closed shape", () => {
    const empty: ReplayFeed = {
      channel: "",
      spacecraft: "",
      fixture_ticks: 0,
      total_ticks_source: 0,
      first_model_fire_t: null,
      model_fired_ticks: 0,
      label_anomaly_ticks: 0,
      provenance: { source_table: "", champion_model: "", champion_mlflow_run_id: "", note: "" },
      feed: [],
      null_reason: "data_not_ingested",
    };
    const d = computeReplayDiagnostics(empty);
    expect(d.available).toBe(false);
    expect(d.nullReason).toBe("data_not_ingested");
  });
});

describe("inspectTick", () => {
  it("returns the per-tick residual + deviation direction + coverage for a present tick", () => {
    const i = inspectTick(feed, 10);
    expect(i).not.toBeNull();
    expect(i!.residual).toBeCloseTo(1.9, 6);
    expect(i!.direction).toBe("above"); // value 1.0 > rmean -0.9
    expect(i!.modelPred).toBe(1);
    expect(i!.isAnomaly).toBe(0);
    expect(i!.coverage).toBe("dense"); // t=9,10,11 are consecutive
  });

  it("returns null for a tick index that is not present in the (downsampled) feed", () => {
    expect(inspectTick(feed, 99)).toBeNull();
    expect(inspectTick(feed, null)).toBeNull();
  });
});

describe("NA_REASONS", () => {
  it("every reason starts with 'Not available' so the UI fail-closed copy is consistent", () => {
    for (const reason of Object.values(NA_REASONS)) {
      expect(reason).toMatch(/^Not available/);
    }
  });
});
