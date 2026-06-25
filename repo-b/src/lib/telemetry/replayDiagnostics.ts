// Pure, testable diagnostics adapter over the telemetry replay payload (ReplayFeed).
//
// WHY THIS EXISTS: the replay page must become scientifically inspectable WITHOUT inventing
// aerospace data. All honesty-sensitive math lives here — not in the React component — so it can be
// unit-tested in isolation (mirrors the evidence-JSON pattern the telemetry card tests already use)
// and so the component carries no metric constants (the telemetry env rule).
//
// HARD HONESTY RULES encoded here:
//  1. Everything is derived from the real payload fields (model_pred, is_anomaly, value, rmean) or
//     declared Not-available with a specific reason — never fabricated.
//  2. feed[].score is numerically degenerate on this channel (|value-rmean|/median(resid) blows up to
//     ~1e12 at fire ticks). It is NEVER a threshold axis. We expose `scoreIsDegenerate` and provide NO
//     threshold value in score units. Deviation visuals use the raw residual abs(value-rmean).
//  3. The model first fires at t=728 but the NASA-labeled anomaly window starts at t=5232, so the
//     "detection latency" is NEGATIVE — those early fires are pre-label false alarms on this public
//     benchmark, not lead time. We report the sign and frame it honestly.
//  4. The confusion matrix is computed on the SAME strided, single-channel fixture the demo replays —
//     it is replay-feed AGREEMENT, not held-out validation. The caveat travels with the numbers.

import type { ReplayFeed, ReplayTick } from "./api";

// Exact "Not available — <reason>" strings. Shared by the component and the tests so the rendered copy
// and the assertions never drift. Each reason is specific to why THIS payload cannot supply the field.
export const NA_REASONS = {
  d4PhysicalUnit:
    "Not available — the payload carries only the channel label “D-4” (spacecraft MSL); no engineering unit or sensor description exists in the fixture or serving service. value is a pre-normalized analog reading, so the trace cannot be labeled with a physical unit.",
  sampleRateHz:
    "Not available — t is an integer tick index, not a timestamp; no tick-to-seconds mapping or acquisition rate is present in the payload, so a per-second rate is not derivable.",
  wallClockTimestamp:
    "Not available — feed[].t is an integer index only; no ts_source/ts_ingest/datetime field exists in the replay fixture, so absolute time-of-day for this tick is unavailable.",
  detectorThreshold:
    "Not available — the firing flag comes from the champion model's MAD rule on raw residual (k=4), not from feed[].score, and the fixture's score uses a different, numerically degenerate denominator. No single score value separates fired from not-fired, so a threshold line in score units cannot be drawn. The real threshold lives in telemetry_serving.py constants, not in this payload.",
  marginToThreshold:
    "Not available — margin requires a per-tick detector statistic and its threshold in the same units; the payload exposes neither in firing-rule units (model_pred is a 0/1 flag and score is in a different, degenerate scale).",
  heldOutMetrics:
    "Not available in the replay payload — it is in-sample (single channel D-4, strided fixture), so any precision/recall/F1 from it is replay-feed agreement, not held-out validation. Promoted-model F1 is served separately via /api/telemetry/model-performance.",
  stageBoundaries:
    "Not available — the replay feed carries no test-stage, phase, segment, or regime boundary fields; ticks are one undifferentiated sequence, so stage/phase shading cannot be rendered from this payload.",
  topContributingChannels:
    "Not available — the replay fixture is a single channel (D-4); feed[] has no per-channel breakdown or attribution field, so a multi-channel contribution ranking cannot be shown here.",
  redlineBand:
    "Not available — the fixture has no redline_low/redline_high, control limits, or confidence band per tick; redline bounds exist only on tel_telemetry_channels, not in the replay payload, so the trace cannot show a redline envelope.",
  perTickVerdict:
    "Not available — GO/REVIEW/NO_GO bands operate on the serving anomaly_score (peak residual ÷ threshold), which is not the same field as fixture score and is not present per-tick here; verdicts live on tel_predictions rows, not on replay ticks.",
} as const;

export const AGREEMENT_CAVEAT =
  "replay-feed agreement, NOT held-out validation — single channel D-4, strided fixture, in-sample";

export type CoverageSegment = "dense" | "strided";

export interface ConfusionMatrix {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  // Point-wise on the replay feed only — read under AGREEMENT_CAVEAT, never as generalization.
  precision: number | null;
  recall: number | null;
  f1: number | null;
  caveat: string;
}

export interface TickInspection {
  t: number;
  value: number;
  rmean: number;
  // The quantity the MAD rule actually thresholds — trustworthy, unlike the degenerate score.
  residual: number;
  direction: "above" | "below" | "at";
  modelPred: number; // 0 | 1
  isAnomaly: number; // 0 | 1 (NASA label)
  score: number; // raw fixture score — degenerate, display-only
  coverage: CoverageSegment; // is this tick in a dense (gap==1) or strided neighborhood
}

export interface ReplayDiagnostics {
  available: boolean;
  nullReason: string | null;

  // Identity / provenance (verbatim from the payload).
  channel: string;
  spacecraft: string;
  sourceTable: string;
  championModel: string;
  championMlflowRunId: string;
  provenanceNote: string;

  // Counts (top-level scalars; each cross-checked against the feed).
  tickCount: number;
  fixtureTicks: number;
  totalTicksSource: number;
  samplingFraction: number | null; // fixture_ticks / total_ticks_source
  firstModelFireT: number | null;
  modelFiredTicks: number;
  labelAnomalyTicks: number;

  // Derived: labeled window + fire-vs-label timing (the credibility centerpiece).
  labeledWindow: { start: number; end: number } | null;
  detectionLatencyTicks: number | null; // firstFire - labeledStart (SIGNED; negative => pre-label)
  isPreLabel: boolean;
  preLabelFalseAlarms: number; // model_pred==1 & t < labeledStart
  latencyFraming: string;

  // Derived agreement on the replay feed (NOT validation).
  confusion: ConfusionMatrix;

  // Residual/score at the first fire (real residual; degenerate score flagged).
  residualAtFire: number | null;
  scoreAtFire: number | null;
  scoreIsDegenerate: boolean;

  // Scoring provenance from the backend scoringDiagnostics block (DB-free). The threshold is the frozen
  // serving global-fallback (MAD_K * GLOBAL_TRAIN_SCALE — the SAME value /score applies). The divergence
  // fields are the HONEST headline: for D-4 the threshold does NOT reproduce the champion's firing (every
  // fired tick is below it), so model_pred is authoritative and no per-tick verdict is derivable. All
  // null / false when the payload carries no scoringDiagnostics — the drawer keeps its fail-closed rows.
  scoringAvailable: boolean;
  threshold: number | null; // residual units (MAD_K * GLOBAL_TRAIN_SCALE) — serving global-scale fallback
  madK: number | null;
  thresholdSource: string | null;
  firedTicksScored: number | null; // model_pred==1 ticks the backend scored against the threshold
  firedAboveThreshold: number | null; // how many of those exceed the threshold (0 for D-4 => divergence)
  maxFiredResidual: number | null; // largest residual among fired ticks (below the threshold for D-4)
  thresholdReproducesFiring: boolean | null; // false => the model fired below the serving threshold
  perChannelCaveat: string | null; // the divergence explanation; null when the threshold does reproduce firing

  // Cross-checks: do the recomputed values match the payload's top-level summary scalars?
  crosscheck: { firstFire: boolean; fired: boolean; labeled: boolean };
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

function residualOf(tick: ReplayTick): number {
  return Math.abs(tick.value - tick.rmean);
}

function directionOf(tick: ReplayTick): "above" | "below" | "at" {
  const d = tick.value - tick.rmean;
  if (d > 0) return "above";
  if (d < 0) return "below";
  return "at";
}

// The frozen detector threshold from the backend scoringDiagnostics block (residual units), or null
// when the payload predates Ticket 2. Never hard-coded in the frontend — the backend owns the constant.
function thresholdOf(feed: ReplayFeed): number | null {
  const t = feed.scoringDiagnostics?.threshold_residual_units;
  return typeof t === "number" && t > 0 ? t : null;
}

// Inspect a single tick by its t-index. Returns null when t is not present in the (downsampled) feed.
export function inspectTick(feed: ReplayFeed, t: number | null): TickInspection | null {
  if (t == null || !feed.feed?.length) return null;
  const ticks = feed.feed;
  const i = ticks.findIndex((p) => p.t === t);
  if (i < 0) return null;
  const tick = ticks[i];
  const prevGap = i > 0 ? tick.t - ticks[i - 1].t : Infinity;
  const nextGap = i < ticks.length - 1 ? ticks[i + 1].t - tick.t : Infinity;
  // Dense = at least one immediate neighbor is the very next source tick (the export keeps the onset
  // window at gap==1 and strides calm regions up to ~12). Rates must not be read off strided regions.
  const coverage: CoverageSegment = Math.min(prevGap, nextGap) <= 1 ? "dense" : "strided";
  return {
    t: tick.t,
    value: tick.value,
    rmean: tick.rmean,
    residual: residualOf(tick),
    direction: directionOf(tick),
    modelPred: tick.model_pred,
    isAnomaly: tick.is_anomaly,
    score: tick.score,
    coverage,
  };
}

// Compute the full diagnostics packet from the replay payload. Fails closed (available:false) when the
// payload is the fail-closed shape (null_reason set or empty feed) — the drawer then renders ErrorState.
export function computeReplayDiagnostics(feed: ReplayFeed): ReplayDiagnostics {
  const ticks = feed.feed ?? [];
  const provenance = feed.provenance ?? {
    source_table: "",
    champion_model: "",
    champion_mlflow_run_id: "",
    note: "",
  };

  const base = {
    channel: feed.channel ?? "",
    spacecraft: feed.spacecraft ?? "",
    sourceTable: provenance.source_table ?? "",
    championModel: provenance.champion_model ?? "",
    championMlflowRunId: provenance.champion_mlflow_run_id ?? "",
    provenanceNote: provenance.note ?? "",
    tickCount: ticks.length,
    fixtureTicks: feed.fixture_ticks ?? ticks.length,
    totalTicksSource: feed.total_ticks_source ?? 0,
  };

  if (feed.null_reason || ticks.length === 0) {
    return {
      available: false,
      nullReason: feed.null_reason ?? "data_not_ingested",
      ...base,
      samplingFraction: null,
      firstModelFireT: feed.first_model_fire_t ?? null,
      modelFiredTicks: feed.model_fired_ticks ?? 0,
      labelAnomalyTicks: feed.label_anomaly_ticks ?? 0,
      labeledWindow: null,
      detectionLatencyTicks: null,
      isPreLabel: false,
      preLabelFalseAlarms: 0,
      latencyFraming: "Not available — no ticks in the replay payload.",
      confusion: { tp: 0, fp: 0, fn: 0, tn: 0, precision: null, recall: null, f1: null, caveat: AGREEMENT_CAVEAT },
      residualAtFire: null,
      scoreAtFire: null,
      scoreIsDegenerate: true,
      scoringAvailable: false,
      threshold: null,
      madK: null,
      thresholdSource: null,
      firedTicksScored: null,
      firedAboveThreshold: null,
      maxFiredResidual: null,
      thresholdReproducesFiring: null,
      perChannelCaveat: null,
      crosscheck: { firstFire: false, fired: false, labeled: false },
    };
  }

  // Recompute the summary scalars from the feed so the UI can validate (not just trust) the payload.
  const firedTicks = ticks.filter((p) => p.model_pred === 1);
  const labelTicks = ticks.filter((p) => p.is_anomaly === 1);
  const firstFireRecomputed = firedTicks.length ? Math.min(...firedTicks.map((p) => p.t)) : null;
  const firstModelFireT = feed.first_model_fire_t ?? firstFireRecomputed;

  const labeledWindow = labelTicks.length
    ? { start: Math.min(...labelTicks.map((p) => p.t)), end: Math.max(...labelTicks.map((p) => p.t)) }
    : null;

  // Confusion matrix over the fixture ticks (model_pred vs is_anomaly). Replay-feed agreement only.
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const p of ticks) {
    const fired = p.model_pred === 1;
    const labeled = p.is_anomaly === 1;
    if (fired && labeled) tp += 1;
    else if (fired && !labeled) fp += 1;
    else if (!fired && labeled) fn += 1;
    else tn += 1;
  }
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 =
    precision != null && recall != null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;

  const labeledStart = labeledWindow?.start ?? null;
  const preLabelFalseAlarms =
    labeledStart != null ? firedTicks.filter((p) => p.t < labeledStart).length : 0;
  const detectionLatencyTicks =
    firstModelFireT != null && labeledStart != null ? firstModelFireT - labeledStart : null;
  const isPreLabel = detectionLatencyTicks != null && detectionLatencyTicks < 0;

  const latencyFraming =
    detectionLatencyTicks == null
      ? "Not available — the replay payload has no labeled-anomaly window to time against."
      : isPreLabel
        ? `Model first fires ${Math.abs(detectionLatencyTicks)} ticks BEFORE the NASA-labeled window opens. On this public benchmark those are ${preLabelFalseAlarms} pre-label false alarms on D-4 — not lead time. Surfaced, not hidden.`
        : `Model first fires ${detectionLatencyTicks} ticks after the labeled window opens.`;

  const fireTick = firstModelFireT != null ? ticks.find((p) => p.t === firstModelFireT) ?? null : null;

  const samplingFraction =
    base.totalTicksSource > 0 ? base.fixtureTicks / base.totalTicksSource : null;

  // Scoring provenance: the frozen serving threshold (from the backend, DB-free) AND the honest divergence
  // the backend computed from the fixture. For D-4 the threshold does NOT reproduce the champion's firing
  // (every fired tick is below it), so we surface the divergence instead of deriving a per-tick verdict
  // that would contradict model_pred. All null/false when the payload carries no scoringDiagnostics.
  const sd = feed.scoringDiagnostics ?? null;
  const threshold = thresholdOf(feed);
  const residAtFire = fireTick ? residualOf(fireTick) : null;

  return {
    available: true,
    nullReason: null,
    ...base,
    samplingFraction,
    firstModelFireT,
    modelFiredTicks: feed.model_fired_ticks ?? firedTicks.length,
    labelAnomalyTicks: feed.label_anomaly_ticks ?? labelTicks.length,
    labeledWindow,
    detectionLatencyTicks,
    isPreLabel,
    preLabelFalseAlarms,
    latencyFraming,
    confusion: { tp, fp, fn, tn, precision, recall, f1, caveat: AGREEMENT_CAVEAT },
    residualAtFire: residAtFire,
    scoreAtFire: fireTick ? fireTick.score : null,
    // The fixture score is |value-rmean|/median(resid); on this near-constant channel it is degenerate
    // (~1e12 at fire ticks). Always flagged so the UI never treats it as a calibrated/comparable axis.
    scoreIsDegenerate: true,
    scoringAvailable: threshold != null,
    threshold,
    madK: sd?.mad_k ?? null,
    thresholdSource: sd?.threshold_source ?? null,
    firedTicksScored: sd?.fired_ticks ?? null,
    firedAboveThreshold: sd?.fired_ticks_above_threshold ?? null,
    maxFiredResidual: sd?.max_fired_residual ?? null,
    thresholdReproducesFiring: sd?.threshold_reproduces_firing ?? null,
    perChannelCaveat: sd?.per_channel_caveat ?? null,
    crosscheck: {
      firstFire: feed.first_model_fire_t == null || feed.first_model_fire_t === firstFireRecomputed,
      fired: feed.model_fired_ticks == null || feed.model_fired_ticks === firedTicks.length,
      labeled: feed.label_anomaly_ticks == null || feed.label_anomaly_ticks === labelTicks.length,
    },
  };
}

// ── Residual-vs-threshold chart model (Ticket 6) ─────────────────────────────
// The residual `|value - rmean|` is the quantity the MAD rule actually thresholds (unlike the degenerate
// feed[].score). This pure model plots it against the frozen serving threshold so the divergence the
// scoringDiagnostics block reports is also *visible*: on D-4 every model-fired tick sits BELOW the
// serving global-fallback redline (the champion fires on a tighter per-channel scale). Pure + testable;
// the component only renders it. `threshold` is null when the payload predates Ticket 2 (chart hides the redline).

export interface ResidualPoint {
  idx: number;
  t: number;
  residual: number; // abs(value - rmean)
  fired: boolean; // model_pred === 1
}

export interface ResidualSeries {
  points: ResidualPoint[];
  threshold: number | null; // serving threshold in residual units, or null when unavailable
  yMax: number; // chart y-axis ceiling: max(threshold, maxResidual) * 1.12, never 0
  firedCount: number;
  firedAboveThreshold: number; // model-fired ticks whose residual exceeds the threshold
  allFiredBelowThreshold: boolean; // true => the visible divergence (fired, yet under the serving redline)
}

export function residualSeries(feed: ReplayFeed): ResidualSeries {
  const ticks = feed.feed ?? [];
  const threshold = thresholdOf(feed);
  const points: ResidualPoint[] = ticks.map((p, idx) => ({
    idx,
    t: p.t,
    residual: residualOf(p),
    fired: p.model_pred === 1,
  }));
  const maxResidual = points.length ? Math.max(...points.map((p) => p.residual)) : 0;
  const yMax = Math.max(threshold ?? 0, maxResidual) * 1.12 || 1;
  const fired = points.filter((p) => p.fired);
  const firedAboveThreshold =
    threshold != null ? fired.filter((p) => p.residual > threshold).length : 0;
  return {
    points,
    threshold,
    yMax,
    firedCount: fired.length,
    firedAboveThreshold,
    allFiredBelowThreshold: threshold != null && fired.length > 0 && firedAboveThreshold === 0,
  };
}
