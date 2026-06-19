// Telemetry Spike Inspector — types, constants, and static demo data.
//
// This surface EVALUATES AND RECOMMENDS over telemetry anomalies ("spikes"). It never
// aborts, rolls back, or mutates any system. Missing/stale evidence resolves to
// `insufficient_evidence` (fail closed), never to a success state.
//
// Data here is STATIC DEMO data. No telemetry endpoint serves spikes today; this module
// is shaped so a future `getSpikes(envId, businessId)` fetch can replace DEMO_SPIKES with
// no change to the component.

import { C } from "@/components/telemetry/primitives";

// ---------------------------------------------------------------------------
// Spike taxonomy
// ---------------------------------------------------------------------------

export const SPIKE_TYPES = [
  "threshold_breach",
  "rate_of_change",
  "drift",
  "cross_channel_disagreement",
  "missing_channel",
  "freshness",
  "pipeline_quality",
  "model_scorer",
  "governance_receipt",
  "post_change_degradation",
] as const;

export type SpikeType = (typeof SPIKE_TYPES)[number];

export type SpikeFamily = "signal" | "pipeline" | "model" | "governance" | "watcher";

export const SPIKE_TYPE_META: Record<
  SpikeType,
  { label: string; blurb: string; family: SpikeFamily }
> = {
  threshold_breach: {
    label: "Threshold breach",
    blurb: "A channel crossed a static redline for a sustained window.",
    family: "signal",
  },
  rate_of_change: {
    label: "Rate of change",
    blurb: "Derivative of a channel exceeded its slew limit between samples.",
    family: "signal",
  },
  drift: {
    label: "Distribution drift",
    blurb: "Population stability index moved beyond the watch band vs. baseline.",
    family: "signal",
  },
  cross_channel_disagreement: {
    label: "Cross-channel disagreement",
    blurb: "Redundant channels that should track each other diverged.",
    family: "signal",
  },
  missing_channel: {
    label: "Missing channel",
    blurb: "An expected channel produced no samples in the window.",
    family: "pipeline",
  },
  freshness: {
    label: "Freshness lag",
    blurb: "Newest sample is older than the freshness budget for the stand.",
    family: "pipeline",
  },
  pipeline_quality: {
    label: "Pipeline data quality",
    blurb: "ETL emitted null bursts, schema drift, or duplicate keys.",
    family: "pipeline",
  },
  model_scorer: {
    label: "Model / scorer spike",
    blurb: "Anomaly scorer output or confidence shifted abruptly vs. champion.",
    family: "model",
  },
  governance_receipt: {
    label: "Governance receipt",
    blurb: "A signed receipt failed verification or chain integrity.",
    family: "governance",
  },
  post_change_degradation: {
    label: "Post-change degradation",
    blurb: "Watcher saw metrics degrade across runs following a change.",
    family: "watcher",
  },
};

// ---------------------------------------------------------------------------
// Enums / unions
// ---------------------------------------------------------------------------

export type SpikeSeverity = "critical" | "high" | "medium" | "low";

export type SpikeStatus =
  | "open"
  | "acknowledged"
  | "investigating"
  | "benign"
  | "escalated"
  | "insufficient_evidence";

export type EvidenceFreshness = "fresh" | "stale" | "missing";

export type RiskLevel = "low" | "medium" | "high" | "critical";

// Detector verdicts deliberately avoid the operational "GO" verb so this surface never
// reads like a real go/no-go decision. Use detectorColor() (below), not verdictColor().
export type DetectorVerdict = "nominal" | "review" | "no_go_review" | "not_available";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface Evidence {
  label: string;
  value: string;
  source: string; // mandatory provenance — no source, no claim
  as_of: string | null;
  freshness: EvidenceFreshness;
}

export interface DetectorOutput {
  detector: string;
  score: number | null;
  threshold: number | null;
  verdict: DetectorVerdict;
  note?: string;
}

export interface CorroboratingChannel {
  channel: string;
  agrees: boolean;
  note?: string;
}

export interface TelemetrySpike {
  id: string;
  run_id: string;
  stand_id: string;
  signal: string; // channel
  spike_type: SpikeType;
  severity: SpikeSeverity;
  status: SpikeStatus;
  detected_at: string;
  freshness: EvidenceFreshness; // overall evidence freshness for the spike
  null_reason: string | null; // set when status is insufficient_evidence
  detector_outputs: DetectorOutput[];
  corroborating_channels: CorroboratingChannel[];
  recommended_action: SpikeActionId;
  recommendation_reason: string;
  does_not_do: string[]; // explicit "what this recommendation will NOT do"
  evidence: Evidence[];
  receipt_id?: string;
  incident_id?: string;
  control_tower_run_key?: string;
}

// ---------------------------------------------------------------------------
// Action catalog — the operator's response options for a spike.
//
// Every action is RECOMMEND-ONLY. On this static surface, choosing an action STAGES a
// recommendation into a local, in-memory queue (resets on refresh). Nothing is executed,
// persisted, or sent anywhere. High-risk actions additionally require a human gate.
// ---------------------------------------------------------------------------

export type SpikeActionId =
  | "acknowledge"
  | "request_more_evidence"
  | "create_incident"
  | "link_existing_incident"
  | "escalate_go_no_go_review"
  | "mark_benign_with_evidence"
  | "attach_to_receipt"
  | "suppress_duplicate_for_run"
  | "recommend_rollback_review";

export interface ActionSpec {
  id: SpikeActionId;
  label: string;
  does: string;
  doesNot: string;
  requiredEvidence: string;
  risk: RiskLevel;
  gateRequired: boolean;
}

export const ACTION_CATALOG: Record<SpikeActionId, ActionSpec> = {
  acknowledge: {
    id: "acknowledge",
    label: "Acknowledge",
    does: "Marks the spike as seen by an operator and timestamps the acknowledgement.",
    doesNot: "Does not resolve the spike, change any metric, or suppress future alerts.",
    requiredEvidence: "None — acknowledgement only.",
    risk: "low",
    gateRequired: false,
  },
  request_more_evidence: {
    id: "request_more_evidence",
    label: "Request more evidence",
    does: "Stages a request to widen the sample window or pull adjacent channels before deciding.",
    doesNot: "Does not draw a conclusion, open an incident, or page anyone.",
    requiredEvidence: "A named gap (stale window, missing channel, absent baseline).",
    risk: "low",
    gateRequired: false,
  },
  create_incident: {
    id: "create_incident",
    label: "Open incident artifact (stage recommendation)",
    does: "Stages a recommendation to open an incident artifact and links this spike to it.",
    doesNot: "Does not write a real incident record, page on-call, or trigger any remediation.",
    requiredEvidence: "At least two corroborating detectors or channels, and fresh evidence.",
    risk: "medium",
    gateRequired: false,
  },
  link_existing_incident: {
    id: "link_existing_incident",
    label: "Link to existing incident",
    does: "Associates this spike with an already-open incident artifact for correlation.",
    doesNot: "Does not change the incident's state or close any other spike.",
    requiredEvidence: "An incident id that is currently open.",
    risk: "low",
    gateRequired: false,
  },
  escalate_go_no_go_review: {
    id: "escalate_go_no_go_review",
    label: "Escalate to Go/No-Go review",
    does: "Stages a hand-off to the Control Tower so a human runs the go/no-go gate.",
    doesNot: "Does not set a verdict, abort a run, or promote any decision itself.",
    requiredEvidence: "A run key and the evidence packet that motivates the review.",
    risk: "high",
    gateRequired: true,
  },
  mark_benign_with_evidence: {
    id: "mark_benign_with_evidence",
    label: "Mark benign (with evidence)",
    does: "Records a benign disposition with the evidence that justified it.",
    doesNot: "Does not delete the spike or apply the disposition to other runs.",
    requiredEvidence: "Fresh evidence explaining why the spike is expected/benign.",
    risk: "medium",
    gateRequired: false,
  },
  attach_to_receipt: {
    id: "attach_to_receipt",
    label: "Attach to governance receipt",
    does: "Links the spike and its evidence to a signed governance receipt for the audit trail.",
    doesNot: "Does not sign, alter, or re-verify the receipt, and cannot promote a decision.",
    requiredEvidence: "A receipt id in scope for this stand/run.",
    risk: "medium",
    gateRequired: false,
  },
  suppress_duplicate_for_run: {
    id: "suppress_duplicate_for_run",
    label: "Suppress duplicate (this run only)",
    does: "Stages suppression of repeat firings of this exact spike within the same run.",
    doesNot: "Does not suppress other runs, other channels, or future runs.",
    requiredEvidence: "A prior spike id this one duplicates within the run.",
    risk: "low",
    gateRequired: false,
  },
  recommend_rollback_review: {
    id: "recommend_rollback_review",
    label: "Recommend rollback review",
    does: "Stages a recommendation that a human REVIEW whether a rollback is warranted.",
    doesNot: "Does not execute, schedule, or approve a rollback — review request only.",
    requiredEvidence: "Post-change degradation across runs plus the originating change ref.",
    risk: "critical",
    gateRequired: true,
  },
};

// ---------------------------------------------------------------------------
// Color / display helpers (map to the telemetry Option B palette)
// ---------------------------------------------------------------------------

export function severityColor(sev: SpikeSeverity): string {
  if (sev === "critical") return C.red;
  if (sev === "high") return C.amber;
  if (sev === "medium") return C.cyan;
  return C.dim;
}

export function statusColor(status: SpikeStatus): string {
  if (status === "insufficient_evidence") return C.amber;
  if (status === "escalated") return C.red;
  if (status === "investigating") return C.cyan;
  if (status === "benign") return C.green;
  if (status === "acknowledged") return C.dim;
  return C.text; // open
}

export function freshnessColor(f: EvidenceFreshness): string {
  if (f === "fresh") return C.green;
  if (f === "stale") return C.amber;
  return C.red; // missing
}

export function riskColor(risk: RiskLevel): string {
  if (risk === "critical") return C.red;
  if (risk === "high") return C.amber;
  if (risk === "medium") return C.cyan;
  return C.green;
}

export function detectorColor(v: DetectorVerdict): string {
  if (v === "nominal") return C.green;
  if (v === "review") return C.amber;
  if (v === "no_go_review") return C.red;
  return C.dim; // not_available
}

export function detectorLabel(v: DetectorVerdict): string {
  if (v === "nominal") return "Nominal";
  if (v === "review") return "Review";
  if (v === "no_go_review") return "No-go review";
  return "Not available";
}

export function spikeStatusLabel(status: SpikeStatus): string {
  if (status === "insufficient_evidence") return "Insufficient evidence";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function isInsufficientEvidence(spike: TelemetrySpike): boolean {
  return (
    spike.status === "insufficient_evidence" ||
    spike.freshness === "stale" ||
    spike.freshness === "missing"
  );
}

// ---------------------------------------------------------------------------
// Posture rollup for the top band
// ---------------------------------------------------------------------------

export type Posture = "STABLE" | "WATCH" | "DEGRADED";

export interface PostureSummary {
  posture: Posture;
  total: number;
  open: number;
  critical: number;
  insufficientEvidence: number;
  governanceBlocks: number;
  postChangeDegradations: number;
}

export function posture(spikes: TelemetrySpike[]): PostureSummary {
  const open = spikes.filter((s) =>
    ["open", "investigating", "escalated"].includes(s.status),
  ).length;
  const critical = spikes.filter((s) => s.severity === "critical").length;
  const insufficientEvidence = spikes.filter(isInsufficientEvidence).length;
  const governanceBlocks = spikes.filter(
    (s) => s.spike_type === "governance_receipt",
  ).length;
  const postChangeDegradations = spikes.filter(
    (s) => s.spike_type === "post_change_degradation",
  ).length;

  let p: Posture = "STABLE";
  if (critical > 0 || governanceBlocks > 0) p = "DEGRADED";
  else if (open > 0 || insufficientEvidence > 0) p = "WATCH";

  return {
    posture: p,
    total: spikes.length,
    open,
    critical,
    insufficientEvidence,
    governanceBlocks,
    postChangeDegradations,
  };
}

export function postureColor(p: Posture): string {
  if (p === "DEGRADED") return C.red;
  if (p === "WATCH") return C.amber;
  return C.green;
}

// ---------------------------------------------------------------------------
// Demo receipt shape (mirrors the ADE Ops / governance receipt fields, read-only)
// ---------------------------------------------------------------------------

export interface DemoReceipt {
  receipt_id: string;
  spike_id: string;
  decision_type: string; // e.g. "telemetry_spike"
  actor: string; // "telemetry_spike_inspector"
  outcome: "recorded" | "insufficient_evidence";
  incident_id?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Static demo spikes — one (or more) per spike_type, engineered to demonstrate the
// acceptance criteria. NOT real telemetry.
// ---------------------------------------------------------------------------

export const DEMO_SPIKES: TelemetrySpike[] = [
  {
    id: "spk-001",
    run_id: "run-2026-0619-A",
    stand_id: "stand-07",
    signal: "T-bearing-1",
    spike_type: "threshold_breach",
    severity: "high",
    status: "open",
    detected_at: "2026-06-19T13:42:10Z",
    freshness: "fresh",
    null_reason: null,
    detector_outputs: [
      { detector: "static-redline", score: 118.4, threshold: 110, verdict: "no_go_review", note: "8 consecutive samples above redline" },
      { detector: "ewma-residual", score: 3.1, threshold: 3.0, verdict: "review" },
    ],
    corroborating_channels: [
      { channel: "T-bearing-2", agrees: true, note: "tracks +0.9σ" },
      { channel: "vib-rms-1", agrees: true },
    ],
    recommended_action: "create_incident",
    recommendation_reason:
      "Sustained redline breach corroborated by a redundant thermocouple and the vibration RMS channel. Evidence is fresh and two detectors agree.",
    does_not_do: [
      "Does not abort the run.",
      "Does not change any threshold.",
      "Does not page on-call automatically.",
    ],
    evidence: [
      { label: "peak", value: "118.4°C", source: "stand-07/T-bearing-1", as_of: "2026-06-19T13:42:08Z", freshness: "fresh" },
      { label: "redline", value: "110°C", source: "stand-07/limits", as_of: "2026-06-01T00:00:00Z", freshness: "fresh" },
      { label: "breach window", value: "8 samples / 4.0s", source: "detector/static-redline", as_of: "2026-06-19T13:42:10Z", freshness: "fresh" },
    ],
    receipt_id: "rcpt-7741",
  },
  {
    id: "spk-002",
    run_id: "run-2026-0619-A",
    stand_id: "stand-07",
    signal: "P-manifold",
    spike_type: "rate_of_change",
    severity: "medium",
    status: "acknowledged",
    detected_at: "2026-06-19T13:39:55Z",
    freshness: "fresh",
    null_reason: null,
    detector_outputs: [
      { detector: "slew-limit", score: 42.0, threshold: 35, verdict: "review", note: "psi/s over the configured slew limit" },
    ],
    corroborating_channels: [{ channel: "P-chamber", agrees: false, note: "no matching transient" }],
    recommended_action: "request_more_evidence",
    recommendation_reason:
      "Single-detector slew exceedance with a disagreeing neighbor channel. Widen the window and pull the valve command trace before concluding.",
    does_not_do: [
      "Does not open an incident on one detector.",
      "Does not assume a fault without a corroborating channel.",
    ],
    evidence: [
      { label: "slew", value: "42.0 psi/s", source: "detector/slew-limit", as_of: "2026-06-19T13:39:55Z", freshness: "fresh" },
      { label: "limit", value: "35 psi/s", source: "stand-07/limits", as_of: "2026-06-01T00:00:00Z", freshness: "fresh" },
    ],
  },
  {
    id: "spk-003",
    run_id: "run-2026-0618-C",
    stand_id: "stand-03",
    signal: "scorer:anomaly-f1",
    spike_type: "drift",
    severity: "medium",
    status: "investigating",
    detected_at: "2026-06-19T11:05:00Z",
    freshness: "fresh",
    null_reason: null,
    detector_outputs: [
      { detector: "psi", score: 0.27, threshold: 0.2, verdict: "review", note: "population stability index in watch band" },
    ],
    corroborating_channels: [{ channel: "input:T-bearing-1 dist", agrees: true }],
    recommended_action: "request_more_evidence",
    recommendation_reason:
      "Feature distribution moved into the watch band. Confirm whether the shift is operating-condition driven before treating it as model decay.",
    does_not_do: [
      "Does not retrain or swap the model.",
      "Does not flip the champion/challenger assignment.",
    ],
    evidence: [
      { label: "PSI", value: "0.27", source: "registry/drift/stand-03", as_of: "2026-06-19T11:00:00Z", freshness: "fresh" },
      { label: "baseline window", value: "30d", source: "registry/baseline", as_of: "2026-05-20T00:00:00Z", freshness: "fresh" },
    ],
  },
  {
    id: "spk-004",
    run_id: "run-2026-0619-A",
    stand_id: "stand-07",
    signal: "T-bearing-1 vs T-bearing-2",
    spike_type: "cross_channel_disagreement",
    severity: "high",
    status: "open",
    detected_at: "2026-06-19T13:44:30Z",
    freshness: "fresh",
    null_reason: null,
    detector_outputs: [
      { detector: "redundancy-delta", score: 6.2, threshold: 2.5, verdict: "no_go_review", note: "°C divergence between redundant sensors" },
    ],
    corroborating_channels: [
      { channel: "T-bearing-2", agrees: true, note: "flatlines while -1 climbs" },
    ],
    recommended_action: "escalate_go_no_go_review",
    recommendation_reason:
      "Redundant sensors that must agree have diverged beyond tolerance — a possible sensor fault that affects the run verdict. Hand to the Control Tower for a human go/no-go.",
    does_not_do: [
      "Does not set a go/no-go verdict here.",
      "Does not disable either sensor.",
      "Does not abort the run.",
    ],
    evidence: [
      { label: "delta", value: "6.2°C", source: "detector/redundancy-delta", as_of: "2026-06-19T13:44:28Z", freshness: "fresh" },
      { label: "tolerance", value: "2.5°C", source: "stand-07/limits", as_of: "2026-06-01T00:00:00Z", freshness: "fresh" },
    ],
    control_tower_run_key: "run-2026-0619-A",
  },
  {
    id: "spk-005",
    run_id: "run-2026-0619-B",
    stand_id: "stand-11",
    signal: "flow-ox",
    spike_type: "missing_channel",
    severity: "high",
    status: "insufficient_evidence",
    detected_at: "2026-06-19T12:58:00Z",
    freshness: "missing",
    null_reason: "missing_channel",
    detector_outputs: [
      { detector: "presence-check", score: null, threshold: null, verdict: "not_available", note: "0 samples in window" },
    ],
    corroborating_channels: [],
    recommended_action: "request_more_evidence",
    recommendation_reason:
      "The oxidizer flow channel produced no samples in the window, so no anomaly judgement can be made. Fail closed and request a re-pull or a stand health check.",
    does_not_do: [
      "Does not infer a fault from absence of data.",
      "Does not mark the run pass or fail.",
      "Does not open an incident without evidence.",
    ],
    evidence: [
      { label: "samples", value: "0", source: "stand-11/flow-ox", as_of: null, freshness: "missing" },
      { label: "expected cadence", value: "50 Hz", source: "stand-11/config", as_of: "2026-06-01T00:00:00Z", freshness: "fresh" },
    ],
  },
  {
    id: "spk-006",
    run_id: "run-2026-0619-B",
    stand_id: "stand-11",
    signal: "T-nozzle",
    spike_type: "freshness",
    severity: "medium",
    status: "insufficient_evidence",
    detected_at: "2026-06-19T12:50:00Z",
    freshness: "stale",
    null_reason: "stale_evidence",
    detector_outputs: [
      { detector: "freshness-budget", score: 412, threshold: 120, verdict: "not_available", note: "newest sample age (s) exceeds budget" },
    ],
    corroborating_channels: [],
    recommended_action: "request_more_evidence",
    recommendation_reason:
      "Newest sample is 412s old against a 120s budget. Any spike judgement on stale data would be unreliable; wait for fresh data or check the ingest path.",
    does_not_do: [
      "Does not score anomalies on stale data.",
      "Does not declare the stand healthy or unhealthy.",
    ],
    evidence: [
      { label: "newest sample age", value: "412s", source: "stand-11/T-nozzle", as_of: "2026-06-19T12:43:08Z", freshness: "stale" },
      { label: "freshness budget", value: "120s", source: "stand-11/config", as_of: "2026-06-01T00:00:00Z", freshness: "fresh" },
    ],
  },
  {
    id: "spk-007",
    run_id: "run-2026-0619-A",
    stand_id: "stand-07",
    signal: "etl:stage-2",
    spike_type: "pipeline_quality",
    severity: "high",
    status: "open",
    detected_at: "2026-06-19T13:30:00Z",
    freshness: "fresh",
    null_reason: null,
    detector_outputs: [
      { detector: "null-burst", score: 0.18, threshold: 0.05, verdict: "no_go_review", note: "fraction of null rows in batch" },
      { detector: "dup-key", score: 134, threshold: 0, verdict: "review", note: "duplicate primary keys" },
    ],
    corroborating_channels: [{ channel: "etl:stage-1", agrees: false, note: "clean upstream" }],
    recommended_action: "create_incident",
    recommendation_reason:
      "Stage-2 ETL emitted an 18% null burst with duplicate keys while stage-1 was clean, isolating the fault to the stage-2 transform. Fresh and corroborated by two checks.",
    does_not_do: [
      "Does not reprocess or backfill the batch.",
      "Does not alter the ETL job.",
    ],
    evidence: [
      { label: "null fraction", value: "18%", source: "etl/stage-2/dq", as_of: "2026-06-19T13:30:00Z", freshness: "fresh" },
      { label: "dup keys", value: "134", source: "etl/stage-2/dq", as_of: "2026-06-19T13:30:00Z", freshness: "fresh" },
    ],
    receipt_id: "rcpt-7755",
  },
  {
    id: "spk-008",
    run_id: "run-2026-0618-C",
    stand_id: "stand-03",
    signal: "scorer:rul-rmse",
    spike_type: "model_scorer",
    severity: "high",
    status: "investigating",
    detected_at: "2026-06-18T22:10:00Z",
    freshness: "fresh",
    null_reason: null,
    detector_outputs: [
      { detector: "champion-delta", score: 14.7, threshold: 8.0, verdict: "no_go_review", note: "RMSE cycles above champion" },
      { detector: "confidence-shift", score: 0.22, threshold: 0.15, verdict: "review" },
    ],
    corroborating_channels: [{ channel: "challenger:v7", agrees: true, note: "challenger also degraded" }],
    recommended_action: "escalate_go_no_go_review",
    recommendation_reason:
      "Scorer RMSE jumped well past the champion tolerance and confidence shifted, with the challenger degrading too. Route to a human go/no-go before relying on the scorer.",
    does_not_do: [
      "Does not demote the champion model.",
      "Does not gate deployment by itself.",
    ],
    evidence: [
      { label: "RMSE delta", value: "+14.7 cyc", source: "registry/scorer/stand-03", as_of: "2026-06-18T22:05:00Z", freshness: "fresh" },
      { label: "champion tol", value: "8.0 cyc", source: "registry/gate", as_of: "2026-06-10T00:00:00Z", freshness: "fresh" },
    ],
    control_tower_run_key: "run-2026-0618-C",
  },
  {
    id: "spk-009",
    run_id: "run-2026-0618-C",
    stand_id: "stand-03",
    signal: "receipt:rcpt-7702",
    spike_type: "governance_receipt",
    severity: "critical",
    status: "escalated",
    detected_at: "2026-06-19T09:15:00Z",
    freshness: "fresh",
    null_reason: null,
    detector_outputs: [
      { detector: "signature-verify", score: 0, threshold: 1, verdict: "no_go_review", note: "Ed25519 signature did not verify" },
      { detector: "chain-integrity", score: 0, threshold: 1, verdict: "no_go_review", note: "hash chain broken at prior receipt" },
    ],
    corroborating_channels: [{ channel: "receipt:rcpt-7701", agrees: true, note: "prior hash mismatch" }],
    recommended_action: "attach_to_receipt",
    recommendation_reason:
      "A signed receipt failed both signature verification and chain integrity. Until a human resolves provenance, no decision may be promoted on this run.",
    does_not_do: [
      "Does not promote the Go/No-Go decision for this run.",
      "Does not re-sign or repair the receipt.",
      "Does not delete the broken receipt.",
    ],
    evidence: [
      { label: "signature", value: "INVALID", source: "control-tower/verify/rcpt-7702", as_of: "2026-06-19T09:15:00Z", freshness: "fresh" },
      { label: "chain", value: "BROKEN @ rcpt-7701", source: "control-tower/verify", as_of: "2026-06-19T09:15:00Z", freshness: "fresh" },
    ],
    receipt_id: "rcpt-7702",
    incident_id: "inc-3309",
    control_tower_run_key: "run-2026-0618-C",
  },
  {
    id: "spk-010",
    run_id: "run-2026-0619-D",
    stand_id: "stand-07",
    signal: "watcher:post-change",
    spike_type: "post_change_degradation",
    severity: "critical",
    status: "open",
    detected_at: "2026-06-19T14:02:00Z",
    freshness: "fresh",
    null_reason: null,
    detector_outputs: [
      { detector: "post-change-watcher", score: 4, threshold: 2, verdict: "no_go_review", note: "consecutive degraded runs after change chg-882" },
      { detector: "anomaly-rate", score: 0.31, threshold: 0.12, verdict: "review", note: "anomaly rate vs. pre-change baseline" },
    ],
    corroborating_channels: [
      { channel: "scorer:anomaly-f1", agrees: true, note: "F1 down 0.08 post-change" },
    ],
    recommended_action: "create_incident",
    recommendation_reason:
      "Four consecutive runs degraded after change chg-882, with anomaly rate well above the pre-change baseline. Open an incident artifact so a human can investigate; a rollback, if any, is a separate human decision.",
    does_not_do: [
      "Does not execute or schedule a rollback.",
      "Does not revert change chg-882.",
      "Does not abort the current run.",
    ],
    evidence: [
      { label: "degraded runs", value: "4 consecutive", source: "watcher/post-change/stand-07", as_of: "2026-06-19T14:00:00Z", freshness: "fresh" },
      { label: "anomaly rate", value: "0.31 (base 0.12)", source: "watcher/post-change", as_of: "2026-06-19T14:00:00Z", freshness: "fresh" },
      { label: "change ref", value: "chg-882", source: "deploy/changelog", as_of: "2026-06-19T08:30:00Z", freshness: "fresh" },
    ],
    receipt_id: "rcpt-7760",
    incident_id: "inc-3312",
    control_tower_run_key: "run-2026-0619-D",
  },
];

// Demo governance receipts derived from spikes that carry a receipt_id. Read-only.
export const DEMO_RECEIPTS: DemoReceipt[] = DEMO_SPIKES.filter((s) => s.receipt_id).map((s) => ({
  receipt_id: s.receipt_id as string,
  spike_id: s.id,
  decision_type: "telemetry_spike",
  actor: "telemetry_spike_inspector",
  outcome: isInsufficientEvidence(s) ? "insufficient_evidence" : "recorded",
  incident_id: s.incident_id,
  created_at: s.detected_at,
}));
