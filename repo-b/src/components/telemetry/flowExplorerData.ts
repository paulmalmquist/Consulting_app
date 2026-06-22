// Static, typed source for the telemetry "How This Works" Flow Explorer (v2).
// Pure data — no React, no palette import — so it is trivially unit-testable.
//
// HONESTY: the Flow Explorer is a VISUAL EXPLANATION of verified system behavior, NOT a simulator.
// Nothing here executes; no live call is made. Each step names its REAL tool/service/table and
// carries the same dual status (impl + verify) as the proof ledger. Not-fully-live branches are
// labeled Partial/Planned/"unit-verified". No new production or numeric claims.

import type { ImplStatus, VerifyStatus } from "./howItWorksData";

export type FlowLaneKind = "input" | "control" | "evidence" | "validation" | "output" | "receipt";

// The real fail-closed reasons used across the system (telemetry copilot + MCP + medallion).
export type NullReason =
  | "unsupported_question"
  | "live_data_not_available"
  | "model_not_promoted"
  | "data_source_not_configured"
  | "write_not_confirmed"
  | "unpermissioned_tool";

export interface FlowStep {
  id: string;
  lane: FlowLaneKind;
  label: string;
  realName: string; // real tool / service / table / route — never invented
  detail: string;
  impl: ImplStatus;
  verify: VerifyStatus;
  nullReason?: NullReason;
  evidenceSlug?: string; // if set, MUST be a real TELEMETRY_NAV slug
}

export interface TraceStep {
  n: number;
  line: string;
}

export interface FailClosed {
  trigger: string;
  nullReason: NullReason;
  outcome: string;
  observed?: string; // honest verification note, e.g. "unit-verified, not production-observed"
}

export interface FlowScenario {
  id: string;
  traceId: string; // operational motif, e.g. "COP-AGG-001"
  label: string;
  summary: string;
  impl: ImplStatus;
  verify: VerifyStatus;
  lanes: FlowStep[]; // length 6, one per FlowLaneKind in lane order
  trace: TraceStep[]; // numbered 0..6
  happyPath: string;
  failClosed: FailClosed;
}

export const FLOW_LANES: { kind: FlowLaneKind; title: string }[] = [
  { kind: "input", title: "Input" },
  { kind: "control", title: "Control" },
  { kind: "evidence", title: "Evidence" },
  { kind: "validation", title: "Validation" },
  { kind: "output", title: "Output" },
  { kind: "receipt", title: "Receipt" },
];

// The disclaimer phrases below ("No live call is made" / "nothing here executes") are asserted by a test.
export const FLOW_EXPLORER_CAPTION =
  "Static trace — a visual explanation of verified system behavior, not a simulator. No live call is made; " +
  "nothing here executes. Each node names its real tool/service/table and carries the same Built/Partial/Planned · " +
  "verify status as the proof ledger below.";

const t = (n: number, line: string): TraceStep => ({ n, line });

export const FLOW_SCENARIOS: FlowScenario[] = [
  {
    id: "aggregate-count",
    traceId: "COP-AGG-001",
    label: "Aggregate count answer",
    summary: "Copilot answers a known aggregate count from structured evidence — and refuses unknown ones.",
    impl: "partial",
    verify: "prod_verified",
    lanes: [
      { id: "agg-input", lane: "input", label: "User question", realName: "intent: inventory_counts",
        detail: "The deterministic classifier routes the question to the inventory-counts intent.", impl: "built", verify: "prod_verified" },
      { id: "agg-control", lane: "control", label: "Tool select", realName: "get_inventory_counts",
        detail: "A typed, allow-listed READ tool — the model never picks tools.", impl: "built", verify: "prod_verified" },
      { id: "agg-evidence", lane: "evidence", label: "Structured fetch", realName: "svc.summary → inventory",
        detail: "Reads recorded counts (e.g. promoted_models = 4) from structured evidence; no free SQL.", impl: "built", verify: "prod_verified", evidenceSlug: "registry" },
      { id: "agg-validation", lane: "validation", label: "Anti-fabrication", realName: "post-validator",
        detail: "Accepts only evidence-backed numbers; entities outside the allow-listed intents are refused.", impl: "partial", verify: "prod_verified", nullReason: "unsupported_question" },
      { id: "agg-output", lane: "output", label: "Cited answer", realName: "grounded response",
        detail: "Returns the count with its evidence citation.", impl: "built", verify: "prod_verified" },
      { id: "agg-receipt", lane: "receipt", label: "Audit log", realName: "ai_decision_audit_log",
        detail: "Redacted decision receipt (decision_type = response).", impl: "built", verify: "prod_verified", evidenceSlug: "governance" },
    ],
    trace: [
      t(0, "RECV   question · intent=inventory_counts"),
      t(1, "TOOL   get_inventory_counts  perm=READ"),
      t(2, "FETCH  svc.summary → inventory  promoted_models=4"),
      t(3, "VALIDATE  evidence_backed=true"),
      t(4, 'ANSWER  "4 promoted models"  +citation'),
      t(5, "RECEIPT  ai_decision_audit_log  type=response"),
      t(6, "DONE   grounded"),
    ],
    happyPath: "Known aggregate → counts answered from structured evidence, with a citation.",
    failClosed: {
      trigger: 'Unknown entity, outside the allow-listed intents (e.g. "how many launches?")',
      nullReason: "unsupported_question",
      outcome: "Refused with unsupported_question — no number is fabricated.",
    },
  },
  {
    id: "live-freshness",
    traceId: "LIVE-FRESH-002",
    label: "Live freshness / unavailable",
    summary: "A live-status question reports stream freshness — or fails closed when the stream is stale.",
    impl: "partial",
    verify: "prod_verified",
    lanes: [
      { id: "live-input", lane: "input", label: "User question", realName: "intent: live_status",
        detail: "Routed to the live-status freshness intent.", impl: "built", verify: "prod_verified" },
      { id: "live-control", lane: "control", label: "Tool select", realName: "get_stream_freshness",
        detail: "A READ tool that reads the stream freshness block.", impl: "built", verify: "prod_verified" },
      { id: "live-evidence", lane: "evidence", label: "Stream block", realName: "svc.monitoring → tel_pipeline_status",
        detail: "Reads stream_status only — never a raw sensor value.", impl: "built", verify: "prod_verified", evidenceSlug: "system-health" },
      { id: "live-validation", lane: "validation", label: "Freshness gate", realName: "freshness check",
        detail: "Fresh → stream_status evidence; stale → null, no value invented.", impl: "partial", verify: "code_verified", nullReason: "live_data_not_available" },
      { id: "live-output", lane: "output", label: "Status answer", realName: "grounded response",
        detail: "Reports freshness without inventing a live value.", impl: "built", verify: "prod_verified" },
      { id: "live-receipt", lane: "receipt", label: "Audit log", realName: "ai_decision_audit_log",
        detail: "Redacted decision receipt.", impl: "built", verify: "prod_verified", evidenceSlug: "governance" },
    ],
    trace: [
      t(0, "RECV   question · intent=live_status"),
      t(1, "TOOL   get_stream_freshness  perm=READ"),
      t(2, "FETCH  svc.monitoring → tel_pipeline_status"),
      t(3, "GATE   fresh ? stream_status : null"),
      t(4, "ANSWER  freshness  (no raw value)"),
      t(5, "RECEIPT  ai_decision_audit_log"),
      t(6, "DONE"),
    ],
    happyPath: "Fresh stream → reports stream_status freshness; never a raw sensor value.",
    failClosed: {
      trigger: "Stream stale or worker disabled",
      nullReason: "live_data_not_available",
      observed: "unit-verified, not production-observed during the last pass",
      outcome: "Returns live_data_not_available; no live value invented.",
    },
  },
  {
    id: "anomaly-verdict",
    traceId: "MODEL-VERDICT-003",
    label: "Anomaly verdict",
    summary: "The frozen champion scores a telemetry window and returns a banded GO / REVIEW / NO_GO verdict.",
    impl: "built",
    verify: "prod_verified",
    lanes: [
      { id: "verdict-input", lane: "input", label: "Window submitted", realName: "score_window request",
        detail: "A telemetry window (run_key + channel) is submitted for scoring.", impl: "built", verify: "prod_verified" },
      { id: "verdict-control", lane: "control", label: "Champion scorer", realName: "telemetry_serving.score_window",
        detail: "Frozen champion rolling-MAD rule (MAD_K = 4.0).", impl: "built", verify: "prod_verified" },
      { id: "verdict-evidence", lane: "evidence", label: "Anomaly score", realName: "tel_predictions (score, threshold, attribution)",
        detail: "Score vs the redline threshold, with channel attribution.", impl: "built", verify: "prod_verified", evidenceSlug: "model-performance" },
      { id: "verdict-validation", lane: "validation", label: "Verdict band", realName: "production threshold policy",
        detail: "Applies the production threshold policy → GO / REVIEW / NO_GO.", impl: "built", verify: "prod_verified", nullReason: "model_not_promoted" },
      { id: "verdict-output", lane: "output", label: "Verdict", realName: "verdict + attribution",
        detail: "Returns the verdict and the contributing channels.", impl: "built", verify: "prod_verified" },
      { id: "verdict-receipt", lane: "receipt", label: "Prediction receipt", realName: "tel_predictions.receipt_id",
        detail: "Persists receipt_id, threshold, and attribution.", impl: "built", verify: "prod_verified", evidenceSlug: "replay" },
    ],
    trace: [
      t(0, "RECV   window  run_key+channel"),
      t(1, "SCORE  telemetry_serving.score_window  MAD_K=4.0"),
      t(2, "EVID   anomaly_score vs threshold  +attribution"),
      t(3, "BAND   production threshold policy → GO|REVIEW|NO_GO"),
      t(4, "VERDICT  +attribution"),
      t(5, "RECEIPT  tel_predictions.receipt_id"),
      t(6, "DONE"),
    ],
    happyPath: "Window scored by the frozen champion → banded verdict + persisted receipt.",
    failClosed: {
      trigger: "No promoted champion for this model kind",
      nullReason: "model_not_promoted",
      outcome: "Refuses to score — model_not_promoted; no verdict invented.",
    },
  },
  {
    id: "medallion-stream",
    traceId: "MEDALLION-004",
    label: "Medallion stream aggregate",
    summary: "A streaming value moves bronze → silver → gold to the serving API and Mission Control.",
    impl: "built",
    verify: "prod_verified",
    lanes: [
      { id: "med-input", lane: "input", label: "Bronze landing", realName: "tel_stream_readings_bronze",
        detail: "Append-only, 2s micro-batch, one batch_id per flush.", impl: "built", verify: "prod_verified", evidenceSlug: "stream" },
      { id: "med-control", lane: "control", label: "Silver conform", realName: "tel_stream_readings",
        detail: "Deduplicated on (env_id, channel_id, ts_source).", impl: "built", verify: "code_verified" },
      { id: "med-evidence", lane: "evidence", label: "Gold aggregate", realName: "tel_stream_minute_agg",
        detail: "1-minute aggregates, guarded by watermarks + tel_dq_assertions.", impl: "built", verify: "prod_verified", evidenceSlug: "system-health" },
      { id: "med-validation", lane: "validation", label: "Freshness watermark", realName: "tel_pipeline_status",
        detail: "Silence > 60s flips to stale; no interpolation.", impl: "built", verify: "prod_verified", nullReason: "data_source_not_configured" },
      { id: "med-output", lane: "output", label: "Serving API", realName: "/api/telemetry/stream/{live,health}",
        detail: "Ring-buffer tail + per-channel freshness.", impl: "built", verify: "code_verified" },
      { id: "med-receipt", lane: "receipt", label: "Mission Control", realName: "MissionControlStream",
        detail: "~1s cadence; flips STALE on silence (governed-metric-registry + lineage-drawer are Planned · REPE-only).", impl: "built", verify: "prod_verified", evidenceSlug: "stream" },
    ],
    trace: [
      t(0, "SRC    tel_stream_readings_bronze  batch_id"),
      t(1, "SILVER tel_stream_readings  dedup"),
      t(2, "GOLD   tel_stream_minute_agg  +DQ"),
      t(3, "WATERMARK  fresh ? serve : stale"),
      t(4, "SERVE  /api/telemetry/stream/{live,health}"),
      t(5, "UI     MissionControlStream"),
      t(6, "DONE   — governed-metric-registry + lineage-drawer: PLANNED · REPE-only"),
    ],
    happyPath: "Bronze → silver → gold → serving → UI, guarded by watermarks + DQ assertions.",
    failClosed: {
      trigger: "Source adapter silent > 60s",
      nullReason: "data_source_not_configured",
      outcome: 'tel_pipeline_status = stale → "Not available"; no interpolation.',
    },
  },
  {
    id: "audited-tool-call",
    traceId: "MCP-AUDIT-005",
    label: "Audited tool call",
    summary: "An MCP tool call is permission-checked, redacted, and recorded as an audit receipt.",
    impl: "built",
    verify: "prod_verified",
    lanes: [
      { id: "mcp-input", lane: "input", label: "Tool request", realName: "MCP ToolDef",
        detail: "The request maps to a typed ToolDef in the MCP registry.", impl: "built", verify: "prod_verified" },
      { id: "mcp-control", lane: "control", label: "Permission", realName: "READ / WRITE_CONFIRMED / ADMIN",
        detail: "Scope is checked; writes route to a confirmation gate.", impl: "built", verify: "prod_verified", nullReason: "unpermissioned_tool" },
      { id: "mcp-evidence", lane: "evidence", label: "Confirmation gate", realName: "confirmation gate",
        detail: "Writes are blocked until explicitly confirmed.", impl: "built", verify: "prod_verified", nullReason: "write_not_confirmed" },
      { id: "mcp-validation", lane: "validation", label: "Redaction", realName: "AuditPolicy",
        detail: "redact_keys + size cap applied before persisting.", impl: "built", verify: "prod_verified" },
      { id: "mcp-output", lane: "output", label: "Record decision", realName: "governance.record_decision",
        detail: "Writes the redacted decision record.", impl: "built", verify: "prod_verified" },
      { id: "mcp-receipt", lane: "receipt", label: "Audit log", realName: "ai_decision_audit_log (decision_type CHECK)",
        detail: "decision_type ∈ tool_call | response | classification | fast_path.", impl: "built", verify: "prod_verified", evidenceSlug: "governance" },
    ],
    trace: [
      t(0, "REQ    MCP ToolDef"),
      t(1, "PERM   READ | WRITE_CONFIRMED | ADMIN"),
      t(2, "GATE   write ? require confirm"),
      t(3, "REDACT  AuditPolicy redact_keys"),
      t(4, "RECORD  governance.record_decision"),
      t(5, "RECEIPT  ai_decision_audit_log  type∈CHECK"),
      t(6, "DONE"),
    ],
    happyPath: "Permitted (and, for writes, confirmed) call → redacted decision receipt.",
    failClosed: {
      trigger: "Write without confirmation, or an unpermissioned tool",
      nullReason: "write_not_confirmed",
      outcome: "Blocked / refused with the policy named — no silent execution.",
    },
  },
];
