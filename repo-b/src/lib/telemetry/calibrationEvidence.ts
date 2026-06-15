// Static, deterministic calibration evidence for the RUL Calibration screen (Ticket 3).
//
// Source of truth: the committed Databricks evidence artifacts
//   docs/plans/03-implementation-plans/evidence/telemetry-calibration-challenger.json   (CNN-LSTM champion)
//   docs/plans/03-implementation-plans/evidence/telemetry-calibration-baseline.json     (GBM baseline)
// The scalar metrics below are copied verbatim from those artifacts. The per-cycle trajectory is a
// REPLAY fixture: a representative FD001 engine whose interval bands use the model's REAL conformal
// quantiles (q_lower / q_upper at 80% / 90%) from the challenger artifact. No metric is invented; the
// screen labels this as "Replay / evidence artifact".
//
// This is frontend-local on purpose (Ticket 3 constraint): no Databricks query, no backend, no schema.

export const CALIBRATION_EVIDENCE = {
  champion: "CNN-LSTM",
  subset: "FD001",
  gatePassed: true,
  isSOTA: false, // 17.33 RMSE > the ~13 FD001 literature bar; do NOT claim competitive
  source: "Databricks run 1000196687230771 (challenger) + run 1048860487972876 (baseline)",
  evidence: {
    challenger: "docs/plans/03-implementation-plans/evidence/telemetry-calibration-challenger.md",
    baseline: "docs/plans/03-implementation-plans/evidence/telemetry-calibration-baseline.md",
    negativeResult: "docs/plans/03-implementation-plans/evidence/telemetry-trust-negative-result-writeup.md",
  },

  // --- scalar metrics, verbatim from the artifacts ---
  cnnlstm: { rmse: 17.33, phm: 742.4 },
  gbm: { rmse: 20.32, phm: 1423.3 },
  intervals: {
    "80": { picp: 0.778, mpiw: 37.4, qLower: 26.485, qUpper: 14.407 },
    "90": { picp: 0.903, mpiw: 49.1, qLower: 37.769, qUpper: 18.407 },
  },
  gbmIntervals: { "80": { mpiw: 42.98 }, "90": { mpiw: 55.98 } },

  // reliability_table from the challenger artifact (nominal -> observed coverage)
  reliability: [
    { nominal: 0.5, observed: 0.4319 },
    { nominal: 0.6, observed: 0.5281 },
    { nominal: 0.7, observed: 0.6489 },
    { nominal: 0.8, observed: 0.7784 },
    { nominal: 0.9, observed: 0.9026 },
    { nominal: 0.95, observed: 0.9551 },
  ],

  // late-prediction safety, from the baseline artifact's late callout + challenger PHM
  late: {
    lateSideMissRateAt90: 0.008, // baseline conformal late-side miss rate at 90% (≈0.8%)
    phmReductionPct: 48, // CNN-LSTM PHM 742 vs GBM 1423
  },
} as const;

export type CalibrationPoint = {
  cycle: number;
  trueRul: number;
  predRul: number;
  lo80: number;
  hi80: number;
  lo90: number;
  hi90: number;
};

// Representative FD001 engine trajectory (REPLAY fixture). True RUL declines linearly to 0 and is
// piecewise-capped at RUL_CAP=125 (the training convention). The prediction tracks truth with a
// realistic ~17-cycle-scale wobble; the bands are pred minus/plus the REAL conformal quantiles, so
// the interval geometry on screen is the model's actual calibrated width, not a guess.
function buildTrajectory(): CalibrationPoint[] {
  const RUL_CAP = 125;
  const I = CALIBRATION_EVIDENCE.intervals;
  const lifeStart = 175; // engine observed from cycle 1; fails at ~cycle 200
  const failCycle = 200;
  // deterministic pseudo-noise (no Math.random) so the chart is identical every render/build
  const wobble = [4, -6, 9, -3, 7, -11, 5, 2, -8, 12, -4, 6, -9, 3, -5, 8, -2, 10, -7, 1];
  const pts: CalibrationPoint[] = [];
  let i = 0;
  for (let cycle = lifeStart; cycle <= failCycle; cycle += 1) {
    const trueRulRaw = failCycle - cycle; // 25 -> 0
    const trueRul = Math.min(trueRulRaw, RUL_CAP);
    // model is slightly optimistic early then tightens near failure (typical RUL behavior)
    const bias = trueRul > 15 ? 6 : 0;
    const predRaw = trueRul + bias + (wobble[i % wobble.length] ?? 0) * (trueRul > 12 ? 1 : 0.3);
    const predRul = Math.max(0, Math.min(predRaw, RUL_CAP));
    pts.push({
      cycle,
      trueRul,
      predRul: Math.round(predRul * 10) / 10,
      lo80: Math.max(0, predRul - I["80"].qLower),
      hi80: Math.min(RUL_CAP, predRul + I["80"].qUpper),
      lo90: Math.max(0, predRul - I["90"].qLower),
      hi90: Math.min(RUL_CAP, predRul + I["90"].qUpper),
    });
    i += 1;
  }
  return pts;
}

export const CALIBRATION_TRAJECTORY: CalibrationPoint[] = buildTrajectory();
export const TRAJECTORY_ENGINE_LABEL = "FD001 · representative engine (replay)";
