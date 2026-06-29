// Typed evidence layer for the RUL Calibration page (evidence-surface redesign).
//
// Every metric, pipeline artifact, reliability bin, and chart point on the page maps to one of the
// typed records below so the right-drawer can show provenance, method, interpretation, and limitations
// for anything the viewer clicks. Nothing here invents a value: scalars are read from the committed
// CALIBRATION_EVIDENCE artifact, the trajectory from the deterministic CALIBRATION_TRAJECTORY fixture.
//
// Honest-provenance rule: the ONLY real provenance we hold is the challenger run id, the baseline run
// id, the three committed evidence markdown paths, and "this is a replay fixture". Table names, model
// registry ids, dataset row/engine counts, and per-bin sample counts are genuinely not stored on this
// fixture — those fields stay null and carry a specific nullReason. We never emit a placeholder id.

import {
  CALIBRATION_EVIDENCE as E,
  type CalibrationPoint,
} from "./calibrationEvidence";

// ---------------------------------------------------------------------------
// Provenance + evidence shapes
// ---------------------------------------------------------------------------

export type EvidenceProvenanceKind =
  | "computed_artifact"
  | "replay_fixture"
  | "model_registry"
  | "dataset_snapshot"
  | "unavailable";

export type EvidenceProvenance = {
  sourceKind: EvidenceProvenanceKind;
  artifactId?: string | null;
  runId?: string | null;
  table?: string | null;
  path?: string | null;
  createdAt?: string | null;
  note?: string;
};

export type RulEvidenceStatus = "passed" | "warning" | "not_sota" | "artifact" | "unavailable";

export type RulMetricEvidence = {
  id: string;
  label: string;
  value: string;
  /** Displayed below the value (baseline comparison). Kept verbatim so existing tests still match. */
  baselineSub?: string;
  baselineLabel?: string;
  baselineValue?: string;
  deltaLabel?: string;
  status: RulEvidenceStatus;
  /** Accent for the metric value (telemetry C token). */
  accent?: string;
  tooltip: string;
  formula?: string;
  /** Of {RMSE, PHM08, reliability}; what the metric was measured on. */
  dataUsed: string;
  interpretation: string;
  limitations: string[];
  provenance: EvidenceProvenance;
  /** Downstream surfaces that consume this number, when known. */
  downstream?: string[];
};

export type RulArtifactKind = "dataset" | "model" | "evaluation" | "calibration" | "replay";
// Honesty status for an evidence-trail step. NOT a runtime-pipeline status — these are evidence states.
export type RulArtifactStatus = "available" | "computed" | "fixture" | "unavailable";

export type RulArtifactStep = {
  id: string;
  index: number;
  label: string;
  kind: RulArtifactKind;
  status: RulArtifactStatus;
  /** Short honesty chip text, e.g. "known run", "fixture", "unavailable". */
  statusTag: string;
  summary: string;
  /** Visible key/value details; a null value renders as a null reason, never a placeholder. */
  details: Record<string, string | number | null>;
  nullReasons?: Record<string, string>;
  provenance: EvidenceProvenance;
};

export type RulReliabilityBin = {
  id: string;
  nominal: number;
  observed: number;
  delta: number;
  tolerance: number;
  sampleCount: number | null;
  status: "passed" | "warning" | "failed";
  nullReason?: string;
};

// ---------------------------------------------------------------------------
// Discriminated drawer target — one union for every drill-through on the page.
// ---------------------------------------------------------------------------

export type RulChartPointTarget = {
  kind: "chart-point";
  cycle: number;
  trueRul: number;
  predRul: number;
  error: number; // predicted - true
  absError: number;
  lo80: number;
  hi80: number;
  lo90: number;
  hi90: number;
  inside80: boolean;
  inside90: boolean;
  /** late = the model claims more remaining life than there is, near failure. */
  late: boolean;
  lateRisk: boolean;
  provenance: EvidenceProvenance;
};

// Drawer targets nest their payload (artifact/metric/bin carry their own `kind` field, so we cannot
// spread them next to the drawer discriminant). The chart-point target is self-discriminating.
export type RulDrawerTarget =
  | { kind: "metric"; metric: RulMetricEvidence }
  | { kind: "artifact"; artifact: RulArtifactStep }
  | RulChartPointTarget
  | { kind: "reliability-bin"; bin: RulReliabilityBin }
  | { kind: "model-card"; provenance: EvidenceProvenance }
  | {
      kind: "source-row";
      title: string;
      provenance: EvidenceProvenance;
      nullReason?: string;
    };

// ---------------------------------------------------------------------------
// Known provenance constants (the only real ids we hold).
// ---------------------------------------------------------------------------

const CHALLENGER_RUN = "1000196687230771";
const BASELINE_RUN = "1048860487972876";

const REPLAY_PROVENANCE: EvidenceProvenance = {
  sourceKind: "replay_fixture",
  runId: CHALLENGER_RUN,
  path: E.evidence.challenger,
  table: null,
  artifactId: null,
  createdAt: null,
  note: "One representative FD001 engine. Bands use the model's real conformal quantiles; the per-cycle path is a deterministic replay, not live serving.",
};

const COMPUTED_PROVENANCE: EvidenceProvenance = {
  sourceKind: "computed_artifact",
  runId: CHALLENGER_RUN,
  path: E.evidence.challenger,
  table: null,
  artifactId: null,
  createdAt: null,
  note: "Scalar copied verbatim from the committed challenger evidence artifact.",
};

// ---------------------------------------------------------------------------
// Metric evidence (5 cards). Values are formatted identically to the prior page
// so the locked test assertions (17.33, 742, GBM 20.32, GBM 1423, …) still hold.
// ---------------------------------------------------------------------------

const i80 = E.intervals["80"];
const i90 = E.intervals["90"];

export const RUL_METRICS: RulMetricEvidence[] = [
  {
    id: "rmse",
    label: "RMSE",
    value: E.cnnlstm.rmse.toFixed(2), // "17.33"
    baselineSub: `GBM ${E.gbm.rmse.toFixed(2)}`, // "GBM 20.32"
    baselineLabel: "GBM baseline",
    baselineValue: E.gbm.rmse.toFixed(2),
    deltaLabel: `${(E.gbm.rmse - E.cnnlstm.rmse).toFixed(2)} cycles better than GBM`,
    status: "not_sota",
    accent: "cyan",
    tooltip:
      "Root mean squared error in RUL cycles. Lower is better. Penalizes large errors more heavily than MAE.",
    formula: "RMSE = sqrt( mean( (predicted_RUL - true_RUL)^2 ) )",
    dataUsed: "FD001 test split, all engines, per-cycle predictions.",
    interpretation:
      "17.33 cycles of typical error. Better than the GBM baseline, but above the ~13-cycle FD001 literature bar — useful as a calibrated artifact, not a SOTA benchmark.",
    limitations: [
      "Above the FD001 literature bar (~13 RMSE); not a competitive leaderboard number.",
      "Aggregate over the test set — says nothing about where in the life cycle the error concentrates.",
    ],
    provenance: COMPUTED_PROVENANCE,
    downstream: ["Calibration gate (RMSE↓ requirement)", "Model card status line"],
  },
  {
    id: "phm08",
    label: "PHM08 Score",
    value: E.cnnlstm.phm.toFixed(0), // "742"
    baselineSub: `GBM ${E.gbm.phm.toFixed(0)}`, // "GBM 1423"
    baselineLabel: "GBM baseline",
    baselineValue: E.gbm.phm.toFixed(0),
    deltaLabel: `${E.late.phmReductionPct}% lower than GBM`,
    status: "passed",
    accent: "cyan",
    tooltip:
      "NASA PHM08 asymmetric score. Late predictions are penalized more heavily because missing a failure window is operationally worse than early maintenance.",
    formula:
      "PHM08 = sum( exp(d/13) - 1 ) for late errors (d>0), exp(-d/10) - 1 for early errors (d<0). Lower is better.",
    dataUsed: "FD001 test split. d = predicted_RUL - true_RUL per prediction.",
    interpretation:
      "The safety-weighted metric. The CNN-LSTM nearly halved the GBM baseline's PHM08, so its errors lean less dangerously late.",
    limitations: [
      "Unbounded above — a few very-late predictions can dominate the score.",
      "Asymmetry constants (13/10) are the published PHM08 convention, not tuned here.",
    ],
    provenance: COMPUTED_PROVENANCE,
    downstream: ["Calibration gate (PHM↓ requirement)", "Late-prediction risk panel"],
  },
  {
    id: "picp80",
    label: "80% PICP",
    value: i80.picp.toFixed(3), // "0.778"
    baselineSub: "nominal 0.80",
    deltaLabel: `Δ ${((i80.picp - 0.8) * 100).toFixed(1)}% vs nominal`,
    status: "passed",
    accent: "green",
    tooltip:
      "Prediction interval coverage probability. Measures how often the true RUL fell inside the nominal 80% interval.",
    formula: "PICP = fraction of test points where lo80 ≤ true_RUL ≤ hi80",
    dataUsed: "FD001 test split, split-conformal 80% intervals.",
    interpretation:
      "77.8% observed against an 80% target — inside the ±0.03 tolerance, so the 80% band is honestly calibrated.",
    limitations: [
      "Coverage alone says nothing about sharpness — see interval width.",
      "Slightly under target (−2.2 pts); within tolerance but not over-covering.",
    ],
    provenance: COMPUTED_PROVENANCE,
    downstream: ["Calibration gate (PICP ±0.03)", "Reliability bins"],
  },
  {
    id: "picp90",
    label: "90% PICP",
    value: i90.picp.toFixed(3), // "0.903"
    baselineSub: "nominal 0.90",
    deltaLabel: `Δ +${((i90.picp - 0.9) * 100).toFixed(1)}% vs nominal`,
    status: "passed",
    accent: "green",
    tooltip:
      "Prediction interval coverage probability for the 90% band — how often the true RUL fell inside the nominal 90% interval.",
    formula: "PICP = fraction of test points where lo90 ≤ true_RUL ≤ hi90",
    dataUsed: "FD001 test split, split-conformal 90% intervals.",
    interpretation:
      "90.3% observed against a 90% target — essentially on the nominal line and inside the ±0.03 gate.",
    limitations: [
      "On-target coverage comes at the cost of a wide interval (see MPIW).",
      "Marginal coverage; not conditional on RUL level.",
    ],
    provenance: COMPUTED_PROVENANCE,
    downstream: ["Calibration gate (PICP ±0.03)", "Reliability bins"],
  },
  {
    id: "mpiw",
    label: "Interval width (MPIW)",
    value: `${i80.mpiw.toFixed(1)} / ${i90.mpiw.toFixed(1)}`, // "37.4 / 49.1"
    baselineSub: `GBM ${E.gbmIntervals["80"].mpiw} / ${E.gbmIntervals["90"].mpiw}`,
    baselineLabel: "GBM 80% / 90% width",
    baselineValue: `${E.gbmIntervals["80"].mpiw} / ${E.gbmIntervals["90"].mpiw}`,
    deltaLabel: "Narrower than GBM at both levels",
    status: "warning",
    accent: "amber",
    tooltip:
      "Median width of the calibrated prediction interval. Narrower is more useful only if coverage remains valid.",
    formula: "MPIW = median( upper - lower ) over the test set, at each nominal level.",
    dataUsed: "FD001 test split, split-conformal 80% and 90% intervals.",
    interpretation:
      "37.4 cycles wide at 80%, 49.1 at 90% — narrower than the GBM baseline, but still wide relative to a ~17-cycle RMSE. Honest coverage, limited sharpness.",
    limitations: [
      "Wide bands limit operational usefulness even though coverage passes.",
      "Asymmetric conformal quantiles — the band is wider on the low (late-risk) side.",
    ],
    provenance: COMPUTED_PROVENANCE,
    downstream: ["Calibration gate (MPIW↓ requirement)", "Trajectory band rendering"],
  },
];

// ---------------------------------------------------------------------------
// Evidence artifact trail (5 steps). Framed as an evidence trail, not a live
// pipeline — labels are evidence states, not orchestration states.
// ---------------------------------------------------------------------------

export const RUL_ARTIFACT_TRAIL: RulArtifactStep[] = [
  {
    id: "dataset",
    index: 1,
    label: "Dataset snapshot",
    kind: "dataset",
    status: "available",
    statusTag: "public dataset",
    summary: "NASA C-MAPSS FD001 turbofan degradation — the public RUL analog this model trains on.",
    details: {
      dataset: "C-MAPSS FD001",
      "train/test": "train_FD001 / test_FD001 (standard split)",
      "row count": null,
      "engine count": null,
      "snapshot id": null,
    },
    nullReasons: {
      "row count": "row count not stored in current fixture",
      "engine count": "engine count not stored in current fixture",
      "snapshot id": "dataset snapshot id not stored in current fixture",
    },
    provenance: {
      sourceKind: "dataset_snapshot",
      table: null,
      artifactId: null,
      runId: null,
      path: null,
      note: "Public NASA C-MAPSS analog. Standard FD001 train/test split.",
    },
  },
  {
    id: "model",
    index: 2,
    label: "Model checkpoint",
    kind: "model",
    status: "available",
    statusTag: "known run",
    summary: "CNN-LSTM champion (Conv1D×2 → LSTM → Dense). Promoted over the GBM baseline.",
    details: {
      model: "CNN-LSTM (Conv1D×2 → LSTM → Dense)",
      champion: "yes",
      "training run id": CHALLENGER_RUN,
      "model version": null,
      "registry id": null,
    },
    nullReasons: {
      "model version": "model version not stored in current fixture",
      "registry id": "model registry endpoint is not configured for this environment",
    },
    provenance: {
      sourceKind: "model_registry",
      runId: CHALLENGER_RUN,
      path: E.evidence.challenger,
      table: null,
      artifactId: null,
      note: "Champion challenger run. Registry id unavailable — not stored on this fixture.",
    },
  },
  {
    id: "evaluation",
    index: 3,
    label: "Evaluation run",
    kind: "evaluation",
    status: "computed",
    statusTag: "computed artifact",
    summary: "RMSE and PHM08 for the champion against the reproduced GBM baseline on the FD001 test split.",
    details: {
      "CNN-LSTM RMSE": E.cnnlstm.rmse.toFixed(2),
      "CNN-LSTM PHM08": E.cnnlstm.phm.toFixed(1),
      "GBM RMSE": E.gbm.rmse.toFixed(2),
      "GBM PHM08": E.gbm.phm.toFixed(1),
      "test window": "FD001 test split",
      "baseline run id": BASELINE_RUN,
    },
    provenance: {
      sourceKind: "computed_artifact",
      runId: BASELINE_RUN,
      path: E.evidence.baseline,
      table: null,
      artifactId: null,
      note: "Baseline reproduced and calibrated alongside the challenger.",
    },
  },
  {
    id: "calibration",
    index: 4,
    label: "Conformal calibration",
    kind: "calibration",
    status: "computed",
    statusTag: "computed artifact",
    summary: "Split-conformal intervals at 80% and 90%, gated on coverage within ±0.03 of nominal.",
    details: {
      method: "asymmetric split conformal",
      "q80 (lower/upper)": `−${i80.qLower.toFixed(3)} / +${i80.qUpper.toFixed(3)}`,
      "q90 (lower/upper)": `−${i90.qLower.toFixed(3)} / +${i90.qUpper.toFixed(3)}`,
      "80% coverage": i80.picp.toFixed(3),
      "90% coverage": i90.picp.toFixed(3),
      "coverage gate": "±0.03 — passed",
    },
    provenance: COMPUTED_PROVENANCE,
  },
  {
    id: "replay",
    index: 5,
    label: "Replay fixture",
    kind: "replay",
    status: "fixture",
    statusTag: "fixture",
    summary:
      "One representative FD001 engine trajectory, replayed per-cycle. Not live serving — a deterministic fixture.",
    details: {
      engine: "FD001 representative",
      cycles: "26 (cycle 175 → 200)",
      bands: "real conformal quantiles",
      serving: "replay fixture — not live",
      "source row id": null,
    },
    nullReasons: {
      "source row id": "source row id is not stored on this replay fixture",
    },
    provenance: REPLAY_PROVENANCE,
  },
];

// ---------------------------------------------------------------------------
// Reliability bins — derived from the challenger reliability table.
// ---------------------------------------------------------------------------

const RELIABILITY_TOLERANCE = 0.03;

export const RUL_RELIABILITY_BINS: RulReliabilityBin[] = E.reliability.map((r) => {
  const delta = r.observed - r.nominal;
  const abs = Math.abs(delta);
  const status: RulReliabilityBin["status"] =
    abs <= RELIABILITY_TOLERANCE ? "passed" : abs <= RELIABILITY_TOLERANCE * 2 ? "warning" : "failed";
  return {
    id: `bin-${Math.round(r.nominal * 100)}`,
    nominal: r.nominal,
    observed: r.observed,
    delta,
    tolerance: RELIABILITY_TOLERANCE,
    sampleCount: null,
    status,
    nullReason: "sample count not included in current static evidence artifact",
  };
});

// ---------------------------------------------------------------------------
// Pure, testable chart-point → drawer-target helper.
// This is the single seam the chart-point test exercises; the chart's onClick
// passes the hovered/clicked CalibrationPoint straight through it, so the
// interaction is testable regardless of chart library.
// ---------------------------------------------------------------------------

const LATE_RISK_RUL = 15; // "near failure" threshold for the late-risk zone

export function buildRulChartPointDrawerTarget(point: CalibrationPoint): RulChartPointTarget {
  const error = Math.round((point.predRul - point.trueRul) * 10) / 10;
  const late = error > 0; // predicted more remaining life than there is
  return {
    kind: "chart-point",
    cycle: point.cycle,
    trueRul: point.trueRul,
    predRul: point.predRul,
    error,
    absError: Math.abs(error),
    lo80: Math.round(point.lo80 * 10) / 10,
    hi80: Math.round(point.hi80 * 10) / 10,
    lo90: Math.round(point.lo90 * 10) / 10,
    hi90: Math.round(point.hi90 * 10) / 10,
    inside80: point.trueRul >= point.lo80 && point.trueRul <= point.hi80,
    inside90: point.trueRul >= point.lo90 && point.trueRul <= point.hi90,
    late,
    lateRisk: late && point.trueRul <= LATE_RISK_RUL,
    provenance: REPLAY_PROVENANCE,
  };
}

export const RUL_LATE_RISK_RUL = LATE_RISK_RUL;

export const MODEL_CARD_PROVENANCE: EvidenceProvenance = {
  sourceKind: "computed_artifact",
  runId: CHALLENGER_RUN,
  path: E.evidence.challenger,
  table: null,
  artifactId: null,
  note: `Champion run ${CHALLENGER_RUN} + baseline run ${BASELINE_RUN}. Registry id unavailable on this fixture.`,
};
