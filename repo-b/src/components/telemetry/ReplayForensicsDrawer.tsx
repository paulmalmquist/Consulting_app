"use client";

// Replay forensics drawer — turns the verdict screen into an inspectable, challengeable packet.
//
// Five tabs separate the four concepts the page used to blur together, plus lineage:
//   Signal   — what physically changed (the focused tick's raw facts; what D-4 is / isn't)
//   Model    — what fired the verdict + why-champion evidence (real registry metrics, fail-closed)
//   Evidence — replay-feed agreement (NOT validation) + the honest fire-vs-label timing
//   Operator — verdict ladder, required action, and the existing grounded AI explanation
//   Lineage  — the reproducibility chain (source table → champion → MLflow run → fixture)
//
// Honesty is load-bearing: every unavailable field renders its exact "Not available — <reason>"
// string (NaRow, amber), the in-sample confusion matrix always carries its caveat, the degenerate
// score is never drawn as a threshold, and the pre-label fires are framed as false alarms, not lead
// time. All arithmetic lives in the pure adapter (replayDiagnostics.ts); this file only renders.

import { useEffect, useMemo, useRef, useState } from "react";

import type { ReplayFeed, ReplayTick, ModelRun, ConformalBudget } from "@/lib/telemetry/api";
import {
  getModelPerformance,
  getMonitoring,
  TELEMETRY_DEMO_BUSINESS_ID,
  TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import {
  computeReplayDiagnostics,
  inspectTick,
  NA_REASONS,
  type ReplayDiagnostics,
} from "@/lib/telemetry/replayDiagnostics";
import { mlflowRunLink, mlflowExperimentLink, deltaTableLink, type ExternalEvidenceLink } from "@/lib/lab/factoryEvidenceLinks";
import { DrawerWrapper, DrawerHeader, FieldRow } from "./drawerPrimitives";
import { C, Tag, StatusDot, MetricRow, ErrorState, Loading, SectionTabButton } from "./primitives";
import { CopilotExplanationPanel } from "./Copilot";

type TabKey = "signal" | "model" | "evidence" | "operator" | "lineage";

const TABS: { key: TabKey; label: string }[] = [
  { key: "signal", label: "Signal" },
  { key: "model", label: "Model" },
  { key: "evidence", label: "Evidence" },
  { key: "operator", label: "Operator action" },
  { key: "lineage", label: "Lineage" },
];

export interface ReplayForensicsDrawerProps {
  open: boolean;
  onClose: () => void;
  feed: ReplayFeed;
  /** The currently-revealed tick (or null before replay starts). */
  cursorTick: ReplayTick | null;
  /** Verdict state lifted from the page: has any revealed tick fired (model_pred==1). */
  fired: boolean;
  initialTab?: TabKey;
}

// ── small render helpers (telemetry-native, C palette) ─────────────────────────

function fmt(v: number | null | undefined, digits = 4): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (Number.isInteger(v)) return String(v);
  return Number(v.toFixed(digits)).toString();
}

// External evidence link (Databricks/MLflow). Renders a real hyperlink when the workspace + identifier
// resolve (live by default), else the builder's fail-closed reason via NaRow — never a dead link.
function LinkRow({ label, link }: { label: string; link: ExternalEvidenceLink }) {
  if (!link.href) {
    return (
      <NaRow
        label={label}
        reason={`Link unavailable — ${link.unavailableReason ?? "missing identifier"}${link.copyText ? ` (copy: ${link.copyText})` : ""}`}
      />
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(96px,0.8fr) minmax(0,1.5fr)", gap: 12,
      padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase" }}>{label}</div>
      <a href={link.href} target="_blank" rel="noopener noreferrer"
        style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, textDecoration: "underline", overflowWrap: "anywhere" }}>
        {link.label} ↗
      </a>
    </div>
  );
}

// Section sub-heading inside a tab.
function Sub({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.13em", textTransform: "uppercase",
      color: C.dim, margin: "18px 0 8px" }}>{children}</div>
  );
}

// Fail-closed row for a field the payload genuinely cannot supply. Amber dot + the precise reason —
// never blank, never a fabricated value (and never styled as if "present", unlike FieldRow).
function NaRow({ label, reason }: { label: string; reason: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(96px,0.8fr) minmax(0,1.5fr)", gap: 12,
      padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
        <span style={{ marginTop: 3 }}><StatusDot color={C.amber} size={6} /></span>
        <span style={{ color: C.amber, fontFamily: C.mono, fontSize: 10.5, lineHeight: 1.5, overflowWrap: "anywhere" }}>{reason}</span>
      </div>
    </div>
  );
}

// 0/1 flag chip for model_pred / is_anomaly.
function FlagChip({ on, onColor, label }: { on: boolean; onColor: string; label: string }) {
  return <Tag color={on ? onColor : C.faint}>{label}: {on ? "1" : "0"}</Tag>;
}

// Copyable id (telemetry-native; jsdom-safe — guards navigator.clipboard).
function CopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, overflowWrap: "anywhere" }}>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{value}</span>
      <button type="button" aria-label={`Copy ${value}`}
        onClick={() => {
          if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
          }
        }}
        style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase",
          color: copied ? C.green : C.cyan, background: "transparent", border: `1px solid ${C.border}`,
          borderRadius: 5, padding: "2px 7px", cursor: "pointer", flexShrink: 0 }}>
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(96px,0.8fr) minmax(0,1.5fr)", gap: 12,
      padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase" }}>{label}</div>
      <CopyId value={value} />
    </div>
  );
}

// ── Evidence: 2x2 confusion grid (replay-feed agreement only) ──────────────────
function ConfusionGrid({ d }: { d: ReplayDiagnostics }) {
  const c = d.confusion;
  const cell = (label: string, n: number, tone: string) => (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }}>{label}</div>
      <div style={{ fontFamily: C.sans, fontSize: 22, fontWeight: 700, color: tone, marginTop: 4 }}>{n}</div>
    </div>
  );
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {cell("True positive (fired · labeled)", c.tp, C.green)}
        {cell("False positive (fired · unlabeled)", c.fp, C.red)}
        {cell("False negative (missed · labeled)", c.fn, C.amber)}
        {cell("True negative (quiet · unlabeled)", c.tn, C.dim)}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>precision {c.precision == null ? "—" : `${(c.precision * 100).toFixed(1)}%`}</span>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>recall {c.recall == null ? "—" : `${(c.recall * 100).toFixed(1)}%`}</span>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>F1 {c.f1 == null ? "—" : c.f1.toFixed(3)}</span>
      </div>
      <div style={{ marginTop: 10, border: `1px solid ${C.amber}33`, background: `${C.amber}0d`, borderRadius: 7,
        padding: "8px 11px", display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ marginTop: 3 }}><StatusDot color={C.amber} size={6} /></span>
        <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.amber, lineHeight: 1.5 }}>{c.caveat}</span>
      </div>
    </div>
  );
}

// ── Model tab evidence (lazy, fail-closed fetch of the real registry) ──────────
interface ModelState {
  loading: boolean;
  loaded: boolean;
  champ: ModelRun | null;
  nullReason: string | null;
  conformal: ConformalBudget | null;
}
const EMPTY_MODEL: ModelState = { loading: false, loaded: false, champ: null, nullReason: null, conformal: null };

// ── tab panels ─────────────────────────────────────────────────────────────────

function SignalPanel({ feed, diag, cursorTick }: { feed: ReplayFeed; diag: ReplayDiagnostics; cursorTick: ReplayTick | null }) {
  const insp = useMemo(() => inspectTick(feed, cursorTick?.t ?? null), [feed, cursorTick]);
  return (
    <div>
      <p style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.55, margin: "0 0 4px" }}>
        D-4 is an anonymized NASA SMAP/MSL telemetry channel. <span style={{ color: C.text }}>value</span> is a
        pre-normalized analog reading; <span style={{ color: C.text }}>rmean</span> is its 50-tick rolling mean;
        the deviation the detector thresholds is the raw residual <span style={{ color: C.text }}>|value − rmean|</span>.
      </p>
      <Sub>Focused tick</Sub>
      {insp ? (
        <>
          <FieldRow label="tick (index)" value={insp.t} />
          <FieldRow label="value (normalized)" value={fmt(insp.value, 6)} />
          <FieldRow label="rolling mean (rmean)" value={fmt(insp.rmean, 6)} />
          <FieldRow label="residual |value−rmean|" value={fmt(insp.residual, 6)} />
          <FieldRow label="deviation" value={`${insp.direction} the rolling mean`} />
          <div style={{ display: "flex", gap: 8, padding: "10px 0", flexWrap: "wrap" }}>
            <FlagChip on={insp.modelPred === 1} onColor={C.red} label="model_pred" />
            <FlagChip on={insp.isAnomaly === 1} onColor={C.amber} label="is_anomaly (NASA label)" />
            <Tag color={insp.coverage === "dense" ? C.cyan : C.faint}>coverage: {insp.coverage}</Tag>
          </div>
          <FieldRow label="fixture score" value={`${fmt(insp.score, 4)}  ·  degenerate — not comparable across ticks`} />
        </>
      ) : (
        <p style={{ fontFamily: C.mono, fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>
          No tick focused yet — run the replay (or scrub the cursor) to inspect a tick. Channel summary below.
        </p>
      )}
      <Sub>Channel summary</Sub>
      <FieldRow label="channel" value={`${diag.channel} (${diag.spacecraft})`} />
      <FieldRow label="ticks (fixture)" value={`${diag.fixtureTicks} of ${diag.totalTicksSource} source · ${diag.samplingFraction != null ? `${(diag.samplingFraction * 100).toFixed(2)}%` : "—"} retained`} />
      <Sub>Not available from this payload</Sub>
      <NaRow label="physical unit / sensor" reason={NA_REASONS.d4PhysicalUnit} />
      <NaRow label="sample rate (Hz)" reason={NA_REASONS.sampleRateHz} />
      <NaRow label="wall-clock time" reason={NA_REASONS.wallClockTimestamp} />
      <NaRow label="nominal envelope / redline" reason={NA_REASONS.redlineBand} />
    </div>
  );
}

function ModelPanel({ diag }: { diag: ReplayDiagnostics }) {
  const [st, setSt] = useState<ModelState>(EMPTY_MODEL);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setSt((s) => ({ ...s, loading: true }));
    Promise.allSettled([
      getModelPerformance(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID),
      getMonitoring(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID),
    ]).then(([mp, mon]) => {
      let champ: ModelRun | null = null;
      let nullReason: string | null = null;
      let conformal: ConformalBudget | null = null;
      if (mp.status === "fulfilled") {
        const models = mp.value.models ?? [];
        champ =
          models.find((m) => m.mlflow_run_id === diag.championMlflowRunId) ??
          models.find((m) => m.model_kind === "anomaly" && m.promotion_state === "promoted") ??
          null;
        nullReason = champ ? null : mp.value.null_reason ?? "model_not_promoted";
      } else {
        nullReason = "model_performance_unavailable";
      }
      if (mon.status === "fulfilled") conformal = mon.value.conformal_budget ?? null;
      setSt({ loading: false, loaded: true, champ, nullReason, conformal });
    });
  }, [diag.championMlflowRunId]);

  const championShort = diag.championModel.split(".").pop() || diag.championModel;
  const metrics = st.champ ? Object.entries(st.champ.metrics || {}).filter(([, v]) => typeof v === "number") : [];

  return (
    <div>
      <p style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.55, margin: "0 0 4px" }}>
        The verdict flips on the model&apos;s own <span style={{ color: C.text }}>model_pred</span> flag — a single-channel
        residual (MAD-style) crossing on D-4 — not a hand-authored anomaly flag. The firing threshold itself is not carried
        in the replay payload.
      </p>
      <Sub>Champion identity (from replay provenance)</Sub>
      <FieldRow label="model" value={championShort} />
      <FieldRow label="alias" value={diag.championModel.includes("@") ? diag.championModel.split("@").pop() : "champion"} />
      <CopyRow label="MLflow run" value={diag.championMlflowRunId} />
      <CopyRow label="source table" value={diag.sourceTable} />
      <FieldRow label="provenance note" value={diag.provenanceNote} />

      <Sub>Why this model is champion (model registry · /api/telemetry/model-performance)</Sub>
      {st.loading && <Loading label="Fetching the promoted model's registry record…" />}
      {!st.loading && st.champ && (
        <>
          <FieldRow label="model kind" value={st.champ.model_kind} />
          <FieldRow label="version" value={st.champ.model_version} />
          <FieldRow label="promotion state" value={st.champ.promotion_state} />
          <FieldRow label="experiment id" value={st.champ.experiment_id ?? undefined} />
          {st.champ.mlflow_run_id && st.champ.mlflow_run_id !== diag.championMlflowRunId && (
            <NaRow label="run id mismatch" reason={`Heads-up — the fixture's recorded champion run (${diag.championMlflowRunId.slice(0, 10)}…) differs from the live registry run (${st.champ.mlflow_run_id.slice(0, 10)}…). Both are real; the fixture was scored by its recorded run. Surfaced, never silently reconciled.`} />
          )}
          {metrics.length > 0 ? (
            <>
              <Sub>Registered metrics (model registry · tel_model_runs — not this replay)</Sub>
              {metrics.map(([k, v]) => (
                <MetricRow key={k} label={k} value={fmt(v as number, 4)} />
              ))}
              <p style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
                Verbatim from the promoted row&apos;s metrics; each key carries its own meaning. SMAP/MSL point-adjusted
                F1 is a reference metric (it inflates) — read keys named accordingly as reference, not validated rigor.
              </p>
            </>
          ) : (
            <NaRow label="validation metrics" reason={NA_REASONS.heldOutMetrics} />
          )}
        </>
      )}
      {!st.loading && !st.champ && (
        <NaRow label="champion record" reason={`Not available — the model registry returned no promoted anomaly model (null_reason: ${st.nullReason ?? "unknown"}). Held-out metrics are served by /api/telemetry/model-performance when a promoted model exists.`} />
      )}

      <Sub>False-alarm budget (conformal diagnostic · /api/telemetry/monitoring)</Sub>
      {st.loading && <Loading label="Fetching the conformal false-alarm diagnostic…" />}
      {!st.loading && st.conformal ? (
        <>
          <FieldRow label="target α" value={fmt(st.conformal.alpha, 4)} />
          <FieldRow label="measured false-alarm rate" value={fmt(st.conformal.measured_false_alarm_rate, 4)} />
          <FieldRow label="frozen k" value={fmt(st.conformal.frozen_k, 4)} />
          <FieldRow label="status" value={st.conformal.status ?? undefined} />
        </>
      ) : (
        !st.loading && (
          <NaRow label="false-alarm budget" reason="Not available — the promoted champion row carries no conformal false-alarm diagnostic (Track A). The live GO/NO-GO bands are unchanged; this is a calibration diagnostic only." />
        )
      )}

      <Sub>Detector threshold &amp; firing divergence (serving MAD rule · /api/telemetry/replay)</Sub>
      {diag.scoringAvailable ? (
        <>
          <FieldRow label="serving threshold (residual units)" value={`${fmt(diag.threshold, 6)}  ·  k=${fmt(diag.madK, 1)} MAD on |value−rmean| (global-scale fallback)`} />
          <FieldRow label="fired ticks above threshold" value={diag.firedTicksScored != null ? `${diag.firedAboveThreshold} of ${diag.firedTicksScored}` : undefined} />
          <FieldRow label="max fired residual" value={diag.maxFiredResidual != null ? `${fmt(diag.maxFiredResidual, 6)} (${diag.thresholdReproducesFiring ? "above" : "below"} the serving threshold)` : undefined} />
          {diag.perChannelCaveat ? (
            <p style={{ fontFamily: C.mono, fontSize: 10, color: C.amber, marginTop: 6, lineHeight: 1.5 }}>
              {diag.perChannelCaveat}
            </p>
          ) : (
            <p style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
              Serving global-scale fallback threshold (the value /score applies); on this channel it reproduces the champion&apos;s firing.
            </p>
          )}
        </>
      ) : (
        <>
          <NaRow label="threshold (score units)" reason={NA_REASONS.detectorThreshold} />
          <NaRow label="margin to threshold" reason={NA_REASONS.marginToThreshold} />
        </>
      )}
    </div>
  );
}

function EvidencePanel({ feed, diag }: { feed: ReplayFeed; diag: ReplayDiagnostics }) {
  const fireInsp = useMemo(() => inspectTick(feed, diag.firstModelFireT), [feed, diag.firstModelFireT]);
  return (
    <div>
      <Sub>Replay-feed agreement (model_pred vs NASA is_anomaly)</Sub>
      <ConfusionGrid d={diag} />

      <Sub>First fire vs labeled anomaly (the honest timing)</Sub>
      <FieldRow label="model first fire" value={diag.firstModelFireT != null ? `t=${diag.firstModelFireT}` : undefined} />
      <FieldRow label="NASA-labeled window" value={diag.labeledWindow ? `t=${diag.labeledWindow.start} → ${diag.labeledWindow.end}` : undefined} />
      <FieldRow label="fire − label start" value={diag.detectionLatencyTicks != null ? `${diag.detectionLatencyTicks} ticks` : undefined} />
      <FieldRow label="pre-label fires" value={`${diag.preLabelFalseAlarms}`} />
      <div style={{ border: `1px solid ${(diag.isPreLabel ? C.red : C.cyan)}33`, background: `${(diag.isPreLabel ? C.red : C.cyan)}0d`,
        borderRadius: 7, padding: "9px 11px", margin: "8px 0 4px", display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ marginTop: 3 }}><StatusDot color={diag.isPreLabel ? C.red : C.cyan} size={6} /></span>
        <span style={{ fontFamily: C.mono, fontSize: 10.5, color: diag.isPreLabel ? C.red : C.dim, lineHeight: 1.5 }}>{diag.latencyFraming}</span>
      </div>

      <Sub>Triggering row (first fire)</Sub>
      {fireInsp ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 360 }}>
            <thead>
              <tr>{["tick", "value", "residual", "model_pred", "is_anomaly", "coverage"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontFamily: C.mono, fontSize: 9, letterSpacing: "0.06em",
                  textTransform: "uppercase", color: C.faint, padding: "6px 10px 6px 0", borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              <tr>
                {[String(fireInsp.t), fmt(fireInsp.value, 4), fmt(fireInsp.residual, 4), String(fireInsp.modelPred), String(fireInsp.isAnomaly), fireInsp.coverage].map((v, i) => (
                  <td key={i} style={{ fontFamily: C.mono, fontSize: 11, color: i === 3 ? C.red : C.dim, padding: "7px 10px 7px 0", borderBottom: `1px solid ${C.border}` }}>{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>No fired tick in the payload.</p>
      )}
      <p style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
        residual = |value − rmean| (the quantity the MAD rule thresholds). The fixture <code>score</code> is degenerate on
        this near-constant channel (~1e12 at fire ticks) and is never used as a threshold axis.
      </p>

      <Sub>Counts &amp; coverage</Sub>
      <FieldRow label="model-fired ticks" value={diag.modelFiredTicks} />
      <FieldRow label="labeled ticks" value={diag.labelAnomalyTicks} />
      <FieldRow label="residual at fire" value={fmt(diag.residualAtFire, 6)} />
      <FieldRow label="sampling fraction" value={diag.samplingFraction != null ? `${(diag.samplingFraction * 100).toFixed(2)}%` : undefined} />

      {diag.scoringAvailable && (
        <>
          <Sub>Serving threshold vs champion firing (real — from /api/telemetry/replay)</Sub>
          <FieldRow label="serving threshold (residual units)" value={fmt(diag.threshold, 6)} />
          <FieldRow label="fired ticks above threshold" value={diag.firedTicksScored != null ? `${diag.firedAboveThreshold} of ${diag.firedTicksScored}` : undefined} />
          <FieldRow label="max fired residual" value={fmt(diag.maxFiredResidual, 6)} />
          {diag.perChannelCaveat ? (
            <p style={{ fontFamily: C.mono, fontSize: 10, color: C.amber, marginTop: 6, lineHeight: 1.5 }}>
              {diag.perChannelCaveat}
            </p>
          ) : (
            <p style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
              The serving global-scale fallback threshold reproduces the champion&apos;s firing on this channel.
            </p>
          )}
        </>
      )}

      <Sub>Not available from this payload</Sub>
      <NaRow label="held-out P / R / F1" reason={NA_REASONS.heldOutMetrics} />
      <NaRow label="nearest analog replay" reason="Not available — the replay payload contains a single recorded D-4 run; no nominal/anomalous comparison replay is carried alongside it." />
    </div>
  );
}

const LADDER: { key: string; label: string; color: string }[] = [
  { key: "nominal", label: "Nominal", color: C.green },
  { key: "advisory", label: "Advisory", color: C.cyan },
  { key: "review", label: "Review", color: C.amber },
  { key: "hold", label: "Hold", color: C.amber },
  { key: "nogo", label: "No-Go / Abort", color: C.red },
];

function OperatorPanel({ diag, fired }: { diag: ReplayDiagnostics; fired: boolean }) {
  const active = fired ? "nogo" : "nominal";
  return (
    <div>
      <Sub>Verdict ladder</Sub>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {LADDER.map((s) => {
          const isActive = s.key === active;
          // Only the two endpoints the payload supports are reachable here; the middle policy states
          // (advisory/review/hold) would require phase context or per-tick score bands — not applied.
          const reachable = s.key === "nominal" || s.key === "nogo";
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 9,
              border: `1px solid ${isActive ? s.color + "88" : C.border}`, background: isActive ? s.color + "1a" : "transparent",
              borderRadius: 7, padding: "7px 11px" }}>
              <StatusDot color={isActive ? s.color : C.faint} size={7} glow={isActive} />
              <span style={{ fontFamily: C.mono, fontSize: 12, color: isActive ? s.color : C.dim, fontWeight: isActive ? 700 : 400 }}>{s.label}</span>
              {isActive && <Tag color={s.color}>current</Tag>}
              {!reachable && <span style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint, marginLeft: "auto" }}>not applied (no phase / per-tick bands)</span>}
            </div>
          );
        })}
      </div>

      <Sub>Why this maps to {fired ? "NO-GO" : "GO"}</Sub>
      <p style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.6, margin: 0 }}>
        {fired
          ? `Channel D-4 crossed the frozen detector at t=${diag.firstModelFireT ?? "—"}; the verdict is the champion model's own model_pred, not a hand-authored flag. Bands are fixed (frozen detector). Phase-conditioned thresholds were NOT applied — stage context is unavailable in this payload.`
          : "No revealed tick has fired (model_pred==1). The channel is within the frozen detector's bound for the ticks shown."}
      </p>

      <Sub>Required action</Sub>
      <ul style={{ margin: 0, paddingLeft: 18, fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.7 }}>
        <li>Hold the run packet for review (human confirmation required — this is advisory, not authoritative).</li>
        <li>Inspect channel D-4 around t={diag.firstModelFireT ?? "—"} and the labeled window {diag.labeledWindow ? `[${diag.labeledWindow.start}–${diag.labeledWindow.end}]` : "—"}.</li>
        <li>Weigh the {diag.preLabelFalseAlarms} pre-label fires — confirm whether t={diag.firstModelFireT ?? "—"} is an early deviation or a false alarm.</li>
        <li>Confirm the model version + validation packet (Model tab) before accepting.</li>
        <li>Record disposition (accept / override / defer) below — measured, not self-reported.</li>
      </ul>

      <Sub>Grounded AI explanation (draft for human review)</Sub>
      {fired ? (
        <CopilotExplanationPanel
          runKey={`smap_msl:${diag.channel}:test`}
          fireTick={diag.firstModelFireT ?? 728}
          channel={diag.channel}
        />
      ) : (
        <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>
          The grounded explanation is available once the verdict has flipped to NO-GO (a fired tick exists to explain).
        </p>
      )}

      <Sub>Per-tick severity bands</Sub>
      {diag.scoringAvailable && diag.perChannelCaveat ? (
        <div style={{ border: `1px solid ${C.amber}33`, background: `${C.amber}0d`, borderRadius: 7, padding: "8px 10px", display: "flex", gap: 8 }}>
          <span style={{ marginTop: 3 }}><StatusDot color={C.amber} size={6} /></span>
          <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.amber, lineHeight: 1.5 }}>
            No per-tick GO/REVIEW/NO_GO ladder is derivable — {diag.perChannelCaveat} The operational verdict flips on the model&apos;s binary model_pred.
          </span>
        </div>
      ) : (
        <NaRow label="per-tick GO/REVIEW/NO_GO" reason={NA_REASONS.perTickVerdict} />
      )}
    </div>
  );
}

function LineagePanel({ diag, feed }: { diag: ReplayDiagnostics; feed: ReplayFeed }) {
  const chain = [
    { label: "Source table", value: diag.sourceTable, copy: true },
    { label: "Champion model", value: diag.championModel, copy: true },
    { label: "MLflow run", value: diag.championMlflowRunId, copy: true },
    { label: "Replay fixture", value: `${diag.fixtureTicks} ticks (downsampled from ${diag.totalTicksSource})`, copy: false },
    { label: "Backend route", value: "GET /api/telemetry/replay", copy: false },
  ];
  return (
    <div>
      <p style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.55, margin: "0 0 6px" }}>
        The reproducibility chain — Databricks scoring table → promoted champion → MLflow run → the committed replay
        fixture this page serves. The verdict is reproducible from these ids.
      </p>
      {chain.map((c) => (
        c.copy
          ? <CopyRow key={c.label} label={c.label} value={c.value} />
          : <FieldRow key={c.label} label={c.label} value={c.value} />
      ))}
      <Sub>Workspace links (live by default)</Sub>
      <LinkRow label="MLflow run" link={mlflowRunLink(diag.championMlflowRunId)} />
      <LinkRow label="MLflow experiment" link={mlflowExperimentLink()} />
      <LinkRow label="Delta scoring table" link={deltaTableLink(diag.sourceTable)} />
      {feed.lineage?.databricks_catalog && <FieldRow label="catalog" value={feed.lineage.databricks_catalog} />}
      {feed.lineage?.scoring_notebook && <FieldRow label="scoring notebook" value={feed.lineage.scoring_notebook} />}
      <Sub>Not available from this payload</Sub>
      <NaRow label="stage / phase boundaries" reason={NA_REASONS.stageBoundaries} />
      <NaRow label="top contributing channels" reason={NA_REASONS.topContributingChannels} />
    </div>
  );
}

// ── drawer shell ────────────────────────────────────────────────────────────────

export default function ReplayForensicsDrawer({ open, onClose, feed, cursorTick, fired, initialTab = "signal" }: ReplayForensicsDrawerProps) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const diag = useMemo(() => computeReplayDiagnostics(feed), [feed]);

  // Re-sync to the requested opening tab each time the drawer is opened.
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);

  return (
    <DrawerWrapper open={open} onClose={onClose}>
      <DrawerHeader
        title={`Replay forensics${cursorTick ? ` · tick ${cursorTick.t}` : ""}`}
        description={`Channel ${diag.channel} (${diag.spacecraft}) · precomputed real champion outputs — nothing hand-authored. Public NASA SMAP/MSL anomaly telemetry as an aerospace stand-in, not proprietary rocket data.`}
      />
      {!diag.available ? (
        <div style={{ marginTop: 16 }}>
          <ErrorState message={diag.nullReason ?? "data_not_ingested"} />
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", margin: "16px 0 12px" }} role="tablist" aria-label="Replay forensics sections">
            {TABS.map((t) => (
              <SectionTabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</SectionTabButton>
            ))}
          </div>
          <div>
            {tab === "signal" && <SignalPanel feed={feed} diag={diag} cursorTick={cursorTick} />}
            {tab === "model" && <ModelPanel diag={diag} />}
            {tab === "evidence" && <EvidencePanel feed={feed} diag={diag} />}
            {tab === "operator" && <OperatorPanel diag={diag} fired={fired} />}
            {tab === "lineage" && <LineagePanel diag={diag} feed={feed} />}
          </div>
        </>
      )}
    </DrawerWrapper>
  );
}
