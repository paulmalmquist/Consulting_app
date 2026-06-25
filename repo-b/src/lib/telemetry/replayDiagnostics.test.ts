import { describe, it, expect } from "vitest";

import type { ReplayFeed, ReplayTick } from "./api";
import {
  AGREEMENT_CAVEAT,
  computeReplayDiagnostics,
  inspectTick,
  NA_REASONS,
  residualSeries,
} from "./replayDiagnostics";

// Minimal scoringDiagnostics body (threshold overridden per-test) for the residual-chart tests.
const SCORING_BASE = {
  mad_k: 4, global_train_scale: 0.0339, threshold_residual_units: 0.135467,
  threshold_source: "serving global-scale fallback",
  residual_definition: "residual = abs(value - rmean)",
  fired_ticks: 3, fired_ticks_above_threshold: 0, max_fired_residual: 1.9,
  threshold_reproduces_firing: false, per_channel_caveat: null,
  fixture_score_degenerate: true, note: "test",
} as const;

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

describe("computeReplayDiagnostics — scoring diagnostics (Ticket 2)", () => {
  it("is fail-closed (scoringAvailable false, all scoring fields null) when the payload has no scoringDiagnostics", () => {
    const d = computeReplayDiagnostics(feed); // `feed` carries no scoringDiagnostics
    expect(d.scoringAvailable).toBe(false);
    expect(d.threshold).toBeNull();
    expect(d.firedAboveThreshold).toBeNull();
    expect(d.maxFiredResidual).toBeNull();
    expect(d.thresholdReproducesFiring).toBeNull();
    expect(d.perChannelCaveat).toBeNull();
  });

  // The real D-4 shape: the serving global-fallback threshold does NOT reproduce the champion's firing
  // (every fired tick sits below it), so the backend reports the divergence and we surface it verbatim.
  const scored: ReplayFeed = {
    ...feed,
    scoringDiagnostics: {
      mad_k: 4, global_train_scale: 0.0339, threshold_residual_units: 0.135467,
      threshold_source: "serving global-scale fallback",
      residual_definition: "residual = abs(value - rmean)",
      fired_ticks: 412, fired_ticks_above_threshold: 0, max_fired_residual: 0.0699,
      threshold_reproduces_firing: false,
      per_channel_caveat: "The serving global-scale fallback threshold does NOT reproduce the champion's D-4 firing.",
      fixture_score_degenerate: true, note: "test",
    },
  };
  const d = computeReplayDiagnostics(scored);

  it("surfaces the backend divergence facts verbatim and never invents a per-tick verdict", () => {
    expect(d.scoringAvailable).toBe(true);
    expect(d.threshold).toBe(0.135467);
    expect(d.madK).toBe(4);
    expect(d.firedTicksScored).toBe(412);
    expect(d.firedAboveThreshold).toBe(0);
    expect(d.maxFiredResidual).toBeCloseTo(0.0699, 6);
    expect(d.thresholdReproducesFiring).toBe(false);
    expect(d.perChannelCaveat).toMatch(/does NOT reproduce/i);
    // internally consistent: the largest fired residual sits BELOW the serving threshold
    expect(d.maxFiredResidual!).toBeLessThan(d.threshold!);
  });

  it("still reports the real residual at the first fire (the trustworthy quantity), degenerate score flagged", () => {
    // fire tick t=10: residual |1.0-(-0.9)| = 1.9; the fixture score there is the degenerate 1.48e12
    expect(d.residualAtFire).toBeCloseTo(1.9, 6);
    expect(d.scoreIsDegenerate).toBe(true);
    expect(d.residualAtFire).not.toBe(d.scoreAtFire);
  });

  it("inspectTick no longer fabricates a per-tick verdict — it returns the real residual only", () => {
    const insp = inspectTick(scored, 10);
    expect(insp!.residual).toBeCloseTo(1.9, 6);
    // the removed per-tick verdict fields must not reappear on the shape
    expect((insp as Record<string, unknown>).verdict).toBeUndefined();
    expect((insp as Record<string, unknown>).realScore).toBeUndefined();
  });
});

describe("residualSeries (Ticket 6 — residual vs threshold chart model)", () => {
  it("maps every tick to abs(value-rmean) with a fired flag; no redline when threshold is absent", () => {
    const s = residualSeries(feed); // `feed` carries no scoringDiagnostics
    expect(s.threshold).toBeNull();
    expect(s.points).toHaveLength(8);
    expect(s.firedCount).toBe(3);
    const fireTick = s.points.find((p) => p.t === 10)!; // |1.0-(-0.9)| = 1.9, fired
    expect(fireTick.residual).toBeCloseTo(1.9, 6);
    expect(fireTick.fired).toBe(true);
    expect(s.allFiredBelowThreshold).toBe(false); // no threshold => never a divergence claim
    expect(s.yMax).toBeGreaterThan(1.9); // ceiling sits above the largest residual
  });

  it("flags the divergence when every fired tick sits below the serving threshold (the D-4 case)", () => {
    const divergent: ReplayFeed = { ...feed, scoringDiagnostics: { ...SCORING_BASE, threshold_residual_units: 5.0 } };
    const s = residualSeries(divergent);
    expect(s.threshold).toBe(5.0);
    expect(s.firedAboveThreshold).toBe(0); // all fired residuals (1.9, 1.7, 0.8) < 5.0
    expect(s.allFiredBelowThreshold).toBe(true); // the visible divergence
    expect(s.yMax).toBeCloseTo(5.0 * 1.12, 6); // redline drives the ceiling
  });

  it("does NOT flag divergence when fired residuals exceed the threshold", () => {
    const reproduces: ReplayFeed = { ...feed, scoringDiagnostics: { ...SCORING_BASE, threshold_residual_units: 0.135467 } };
    const s = residualSeries(reproduces);
    expect(s.firedAboveThreshold).toBe(3); // 1.9, 1.7, 0.8 all > 0.135467
    expect(s.allFiredBelowThreshold).toBe(false);
  });
});
