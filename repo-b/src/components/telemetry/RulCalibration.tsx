"use client";

import { useState } from "react";

import { C, Tag, Panel, SplitGrid, StatGrid, DisclosureFooter, TelemetryActionButton } from "./primitives";
import { TelemetryPageHeader } from "./TelemetryPageHeader";
import { MetricInspectorDrawer } from "./drawerPrimitives";
import { SourceRowsTable } from "./drill";
import { RulInfoTooltip } from "./RulInfoTooltip";
import { RulMetricCard } from "./RulMetricCard";
import { RulArtifactTrail } from "./RulArtifactTrail";
import { RulTrajectoryChart } from "./RulTrajectoryChart";
import { RulEvidenceDrawer } from "./RulEvidenceDrawer";
import {
  CALIBRATION_EVIDENCE as E,
  CALIBRATION_TRAJECTORY as TRAJ,
  TRAJECTORY_ENGINE_LABEL,
} from "@/lib/telemetry/calibrationEvidence";
import {
  RUL_METRICS,
  RUL_ARTIFACT_TRAIL,
  RUL_RELIABILITY_BINS,
  MODEL_CARD_PROVENANCE,
  type RulDrawerTarget,
  type RulReliabilityBin,
} from "@/lib/telemetry/rulCalibrationEvidence";

// Unit-level rows for the drill/export: one row per cycle of the representative engine. point/bounds/
// true are the displayed values; covered_80/90 is the per-point calibration hit (derived from the
// shown bands, not fabricated). The 100-unit gate-flip status lives on the Evidence RUL conformal card.
const DRILL_COLS = ["unit", "cycle", "true_rul", "point_pred", "lo80", "hi80", "lo90", "hi90", "covered_80", "covered_90"];
const r1 = (v: number) => Math.round(v * 10) / 10;
function drillRows(): Array<Record<string, unknown>> {
  return TRAJ.map((p) => ({
    unit: "FD001-representative",
    cycle: p.cycle,
    true_rul: p.trueRul,
    point_pred: p.predRul,
    lo80: r1(p.lo80), hi80: r1(p.hi80), lo90: r1(p.lo90), hi90: r1(p.hi90),
    covered_80: p.trueRul >= p.lo80 && p.trueRul <= p.hi80,
    covered_90: p.trueRul >= p.lo90 && p.trueRul <= p.hi90,
  }));
}

// CSS-generated hero backdrop: gradient wash + soft grid + ghosted RUL arcs descending toward failure.
// Pure CSS/SVG, no external image and no <img> (no broken-image state); a dark scrim keeps text readable.
function HeroBackdrop() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 12, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0,
        background: `radial-gradient(120% 140% at 85% -10%, ${C.cyan}1f 0%, transparent 45%), radial-gradient(90% 120% at 5% 110%, ${C.green}14 0%, transparent 50%)` }} />
      <div style={{ position: "absolute", inset: 0, opacity: 0.5,
        backgroundImage: `linear-gradient(${C.border} 1px, transparent 1px), linear-gradient(90deg, ${C.border} 1px, transparent 1px)`,
        backgroundSize: "40px 40px", maskImage: "linear-gradient(to right, black, transparent 70%)" }} />
      <svg viewBox="0 0 900 240" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.55 }}>
        {/* ghosted descending RUL curves toward a failure point at the right */}
        <path d="M0,40 C 280,55 560,150 900,225" fill="none" stroke={C.cyan} strokeOpacity={0.22} strokeWidth={1.5} />
        <path d="M0,80 C 300,95 600,175 900,232" fill="none" stroke={C.green} strokeOpacity={0.16} strokeWidth={1.5} strokeDasharray="5 4" />
        <path d="M0,20 C 260,40 540,135 900,218" fill="none" stroke={C.cyan} strokeOpacity={0.10} strokeWidth={1} />
      </svg>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${C.bg}cc 0%, ${C.bg}e6 100%)` }} />
    </div>
  );
}

function ContractItem({ label, value, tip, tone = C.dim }: { label: string; value: string; tip: string; tone?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: C.faint }}>
        {label}
        <RulInfoTooltip label={tip} triggerLabel={`About ${label}`} width={220} />
      </span>
      <span style={{ fontFamily: C.mono, fontSize: 12, color: tone }}>{value}</span>
    </div>
  );
}

function CoverageRow({ bin, onOpen }: { bin: RulReliabilityBin; onOpen: () => void }) {
  const pass = Math.abs(bin.delta) <= bin.tolerance;
  return (
    <button type="button" onClick={onOpen}
      aria-label={`Inspect the ${Math.round(bin.nominal * 100)}% coverage bin`}
      style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer",
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "center",
        fontFamily: C.mono, fontSize: 12, color: C.text, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.dim }}>{Math.round(bin.nominal * 100)}% nominal</span>
      <span style={{ fontWeight: 600 }}>{(bin.observed * 100).toFixed(1)}% observed</span>
      <span style={{ color: pass ? C.green : C.amber }}>Δ {(bin.delta >= 0 ? "+" : "")}{(bin.delta * 100).toFixed(1)}%</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Tag color={pass ? C.green : C.amber}>{pass ? "within ±0.03" : "outside ±0.03"}</Tag>
        <span aria-hidden style={{ color: C.faint, fontSize: 13 }}>›</span>
      </span>
    </button>
  );
}

function Note({ children, accent = C.dim }: { children: React.ReactNode; accent?: string }) {
  return <p style={{ fontFamily: C.sans, fontSize: 13, color: accent, lineHeight: 1.55, margin: 0 }}>{children}</p>;
}

function EvidenceLink({ label, path }: { label: string; path: string }) {
  return (
    <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
      <span style={{ color: C.cyan }}>▸</span> {label}
      <span style={{ display: "block", color: C.faint, marginLeft: 14 }}>{path}</span>
    </div>
  );
}

function Field({ label, value, tone, onOpen }: { label: string; value: string; tone?: string; onOpen?: () => void }) {
  const body = (
    <>
      <div style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: tone || C.text, marginTop: 4, lineHeight: 1.4 }}>{value}</div>
    </>
  );
  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} aria-label={`Inspect ${label}`}
        style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", width: "100%" }}>
        {body}
      </button>
    );
  }
  return <div>{body}</div>;
}

const bin80 = RUL_RELIABILITY_BINS.find((b) => b.nominal === 0.8)!;
const bin90 = RUL_RELIABILITY_BINS.find((b) => b.nominal === 0.9)!;

export default function RulCalibration() {
  const i80 = E.intervals["80"], i90 = E.intervals["90"];
  const [drillOpen, setDrillOpen] = useState(false);
  const [drawer, setDrawer] = useState<RulDrawerTarget | null>(null);

  return (
    <div>
      {/* 1 — Hero / evidence contract */}
      <div style={{ position: "relative", borderRadius: 12, border: `1px solid ${C.border}`, padding: "22px 22px 20px", marginBottom: 16, overflow: "hidden" }}>
        <HeroBackdrop />
        <div style={{ position: "relative" }}>
          <TelemetryPageHeader
            variant="hero"
            eyebrow="Telemetry · Calibration"
            title="RUL Calibration"
            description="How the remaining-useful-life model behaves as an engine approaches failure, and whether its uncertainty bands contain the truth often enough to be trusted. Click any metric, artifact, chart point, or reliability bin to inspect its evidence."
            actions={
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Tag color={C.green}>Champion: CNN-LSTM</Tag>
                <Tag color={C.green}>Gate: Passed</Tag>
                <Tag color={C.amber}>Not SOTA</Tag>
                <Tag color={C.faint}>Replay / evidence artifact</Tag>
              </div>
            }
          />
          {/* evidence contract strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px 20px",
            marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <ContractItem label="Dataset" value="C-MAPSS FD001" tip="Public NASA turbofan degradation analog (FD001 subset). Not proprietary data." />
            <ContractItem label="Model" value="CNN-LSTM champion" tip="Conv1D×2 → LSTM → Dense. Promoted over a GBM baseline." />
            <ContractItem label="Calibration" value="split conformal" tip="Asymmetric split-conformal prediction intervals at 80% and 90%." />
            <ContractItem label="Serving" value="replay artifact" tip="The per-cycle trajectory is a deterministic replay fixture, not live serving." tone={C.amber} />
            <ContractItem label="Gate" value="coverage ±0.03 passed" tip="Coverage must land within ±0.03 of nominal at 80% and 90%. It does." tone={C.green} />
            <ContractItem label="Claim" value="not SOTA" tip="17.33 RMSE is above the ~13-cycle FD001 literature bar. A calibrated artifact, not a leaderboard claim." tone={C.amber} />
          </div>
          {/* why this page exists */}
          <div style={{ marginTop: 16, background: `${C.cyan}0d`, border: `1px solid ${C.cyan}26`, borderRadius: 9, padding: "11px 14px" }}>
            <Note accent={C.dim}>
              <span style={{ color: C.cyan, fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 8 }}>Why this page exists</span>
              This page is not claiming the best possible RUL model. It proves the system can train, evaluate, calibrate,
              replay, and inspect an ML artifact with traceable evidence.
            </Note>
          </div>
        </div>
      </div>

      {/* 2 — metric cards (clickable, tooltip'd) + baseline comparison */}
      <StatGrid cols={5} style={{ marginBottom: 12 }}>
        {RUL_METRICS.map((m) => (
          <RulMetricCard key={m.id} metric={m} onOpen={() => setDrawer({ kind: "metric", metric: m })} />
        ))}
      </StatGrid>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 0 14px" }}>
        <Tag color={C.amber}>computed artifact</Tag>
        <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>
          FD001 scalars + conformal bands are a computed evidence artifact · the per-cycle trajectory is a replay fixture · not live serving
        </span>
      </div>

      {/* 3 — evidence artifact trail (before the graph) */}
      <div style={{ marginBottom: 12 }}>
        <RulArtifactTrail steps={RUL_ARTIFACT_TRAIL} onOpen={(step) => setDrawer({ kind: "artifact", artifact: step })} />
      </div>

      <SplitGrid variant="two-one" style={{ marginBottom: 12 }}>
        {/* 4 — trajectory chart (recharts, hover tooltip + click-to-inspect + late-risk zone) */}
        <Panel pad={14}>
          <RulTrajectoryChart
            pts={TRAJ}
            engineLabel={TRAJECTORY_ENGINE_LABEL}
            onPointClick={(t) => setDrawer(t)}
          />
          <Note accent={C.faint}>
            <span style={{ display: "block", marginTop: 12 }}>
              The shaded bands are the model&apos;s real split-conformal quantiles (q₈₀ = −{i80.qLower.toFixed(1)}/+{i80.qUpper.toFixed(1)},
              q₉₀ = −{i90.qLower.toFixed(1)}/+{i90.qUpper.toFixed(1)} cycles). Late predictions near low true RUL are the operational concern — the shaded late-risk zone.
            </span>
          </Note>
          <div style={{ marginTop: 14 }}>
            <TelemetryActionButton variant="secondary" onClick={() => setDrillOpen(true)}
              aria-label="Inspect the unit-level calibration rows and export">
              Unit-level rows + export ›
            </TelemetryActionButton>
          </div>
        </Panel>

        {/* 5 — calibration summary (clickable coverage rows + reliability bins) */}
        <Panel title="Calibration · coverage vs nominal"
          right={<RulInfoTooltip label="Coverage = how often the true RUL fell inside the nominal band. The gate passes if observed coverage is within ±0.03 of nominal at both 80% and 90%." triggerLabel="About coverage" />}>
          <div>
            <CoverageRow bin={bin80} onOpen={() => setDrawer({ kind: "reliability-bin", bin: bin80 })} />
            <CoverageRow bin={bin90} onOpen={() => setDrawer({ kind: "reliability-bin", bin: bin90 })} />
          </div>
          <div style={{ marginTop: 14 }}>
            <Note>
              Coverage passes the ±0.03 gate, but the calibrated intervals remain wide. This is honest
              calibration, not a SOTA claim — not a leaderboard claim.
            </Note>
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Reliability bins (all levels)
              <RulInfoTooltip label="Each bin compares observed coverage to a nominal confidence level. Sample counts are not stored on this fixture. Click a bin to inspect it." triggerLabel="About reliability bins" />
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, marginTop: 8 }}>
              {RUL_RELIABILITY_BINS.map((b) => {
                const tone = b.status === "passed" ? C.green : b.status === "warning" ? C.amber : C.red;
                return (
                  <button key={b.id} type="button" onClick={() => setDrawer({ kind: "reliability-bin", bin: b })}
                    aria-label={`Inspect the ${Math.round(b.nominal * 100)}% reliability bin`}
                    style={{ textAlign: "left", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7,
                      padding: "6px 9px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>
                      {Math.round(b.nominal * 100)}→{(b.observed * 100).toFixed(0)}%
                    </span>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: tone, boxShadow: `0 0 6px ${tone}99` }} />
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>
      </SplitGrid>

      <SplitGrid variant="halves" style={{ marginBottom: 12 }}>
        {/* 6a — late prediction risk */}
        <Panel title="Late-prediction risk · why PHM08 matters"
          right={<RulInfoTooltip label="Late = the model says more life remains than there is. Near failure that is the dangerous direction, so PHM08 weights late errors harder than early ones." triggerLabel="About late risk" />}>
          <Note>
            Late predictions (the model says more life remains than there is) are more dangerous than
            early ones — a part runs past its safe window. The PHM08 score penalizes late errors harder
            than early ones, so it is the safety-weighted metric here.
          </Note>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14 }}>
            <div>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>PHM08 reduction vs GBM</div>
              <div style={{ fontFamily: C.sans, fontSize: 22, fontWeight: 600, color: C.green, marginTop: 4 }}>−{E.late.phmReductionPct}%</div>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 3 }}>{E.gbm.phm.toFixed(0)} → {E.cnnlstm.phm.toFixed(0)}</div>
            </div>
            <div>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>90% late-side miss rate</div>
              <div style={{ fontFamily: C.sans, fontSize: 22, fontWeight: 600, color: C.green, marginTop: 4 }}>{(E.late.lateSideMissRateAt90 * 100).toFixed(1)}%</div>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 3 }}>band catches ~99% of optimistic cases</div>
            </div>
          </div>
          <Note accent={C.faint}>
            <span style={{ display: "block", marginTop: 12 }}>
              The CNN-LSTM nearly halved PHM08 versus the GBM baseline, so its errors lean less dangerously
              late. Stated as measured — no overstatement.
            </span>
          </Note>
        </Panel>

        {/* 6b — negative result bridge */}
        <Panel title="Context · what this screen is not" style={{ borderColor: C.amber + "33" }}>
          <Note>
            The earlier embedding-distance <em>Trust Layer</em> was killed by Gate 0 because distance
            anti-correlated with RUL error across predicted-RUL bands. This screen does not revive that
            claim; it shows calibrated uncertainty for the surviving RUL model.
          </Note>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <EvidenceLink label="Negative-result writeup (the kill)" path={E.evidence.negativeResult} />
            <EvidenceLink label="CNN-LSTM challenger (this champion)" path={E.evidence.challenger} />
            <EvidenceLink label="GBM baseline (reproduced + calibrated)" path={E.evidence.baseline} />
          </div>
        </Panel>
      </SplitGrid>

      {/* 7 — model card / evidence (clickable) */}
      <Panel title="Model card · evidence"
        right={<RulInfoTooltip label="The model identity behind every number on this page. Click any field to open the model-card drawer." triggerLabel="About the model card" />}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Field label="Model" value="CNN-LSTM (Conv1D×2 → LSTM → Dense)" onOpen={() => setDrawer({ kind: "model-card", provenance: MODEL_CARD_PROVENANCE })} />
          <Field label="Dataset" value="C-MAPSS FD001 (public NASA analog)" onOpen={() => setDrawer({ kind: "model-card", provenance: MODEL_CARD_PROVENANCE })} />
          <Field label="Uncertainty" value="asymmetric split-conformal" />
          <Field label="Gate" value="RMSE↓ · PHM↓ · PICP ±0.03 · MPIW↓" />
          <Field label="Status" value="Champion — NOT literature-competitive (>13 RMSE bar)" tone={C.amber} onOpen={() => setDrawer({ kind: "model-card", provenance: MODEL_CARD_PROVENANCE })} />
          <Field label="Provenance" value={E.source} />
        </div>
      </Panel>

      {/* unit-level rows drawer (unchanged behavior) */}
      <MetricInspectorDrawer
        open={drillOpen}
        onClose={() => setDrillOpen(false)}
        title="RUL calibration — unit-level rows"
        description="Per-cycle calibration for the representative FD001 engine: point prediction, the 80/90% conformal bounds, the true label, and the per-point coverage hit. Computed-artifact + replay fixture, not live serving."
        fields={[
          { label: "Unit", value: "FD001-representative (replay)" },
          { label: "Source kind", value: "computed-artifact (conformal bands) + fixture (per-cycle replay)" },
          { label: "Cycles", value: TRAJ.length },
          { label: "Flip status / gate decision (per cycle)", value: "not applicable here — the 100-unit gate-flip aggregate is on the Evidence RUL conformal card" },
        ]}
      >
        <div style={{ marginTop: 14 }}>
          <SourceRowsTable
            kind="fixture"
            columns={DRILL_COLS}
            rows={drillRows()}
            sourceLabel="FD001 representative engine (replay) · bands = real conformal quantiles"
            filterContext="one representative engine, all observed cycles"
            exportName="rul_calibration_unit_rows"
          />
        </div>
      </MetricInspectorDrawer>

      {/* the one evidence drawer for metrics / artifacts / chart points / reliability bins / model card */}
      <RulEvidenceDrawer target={drawer} onClose={() => setDrawer(null)} />

      <DisclosureFooter />
    </div>
  );
}
