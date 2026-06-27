"use client";

import { useState } from "react";

import { C, Tag, Panel, MetricCard, StatGrid, SplitGrid, DisclosureFooter, TelemetryActionButton } from "./primitives";
import { TelemetryPageHeader } from "./TelemetryPageHeader";
import { MetricInspectorDrawer } from "./drawerPrimitives";
import { SourceRowsTable } from "./drill";
import {
  CALIBRATION_EVIDENCE as E,
  CALIBRATION_TRAJECTORY as TRAJ,
  TRAJECTORY_ENGINE_LABEL,
  type CalibrationPoint,
} from "@/lib/telemetry/calibrationEvidence";

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

// ---- Inline-SVG trajectory chart (no chart dependency) ----------------------------------------
function TrajectoryChart({ pts }: { pts: CalibrationPoint[] }) {
  const W = 900, H = 340, padL = 46, padR = 18, padT = 18, padB = 38;
  const xs = pts.map((p) => p.cycle);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const yMax = Math.max(...pts.map((p) => p.hi90)) * 1.05;
  const px = (c: number) => padL + ((c - x0) / (x1 - x0 || 1)) * (W - padL - padR);
  const py = (v: number) => padT + (1 - v / (yMax || 1)) * (H - padT - padB);
  const band = (lo: (p: CalibrationPoint) => number, hi: (p: CalibrationPoint) => number) => {
    const top = pts.map((p) => `${px(p.cycle)},${py(hi(p))}`);
    const bot = pts.slice().reverse().map((p) => `${px(p.cycle)},${py(lo(p))}`);
    return `M${top.join(" L")} L${bot.join(" L")} Z`;
  };
  const line = (f: (p: CalibrationPoint) => number) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.cycle)},${py(f(p))}`).join(" ");
  const yticks = [0, 25, 50, 75, 100, 125].filter((t) => t <= yMax);

  return (
    <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 640, display: "block" }}
        role="img" aria-label="RUL trajectory with 80% and 90% calibrated intervals">
        {yticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={py(t)} y2={py(t)} stroke={C.border} strokeWidth={1} />
            <text x={padL - 6} y={py(t) + 3} textAnchor="end" fontSize={9} fill={C.faint} fontFamily={C.mono}>{t}</text>
          </g>
        ))}
        {/* 90% band (faint), then 80% band (a touch stronger) */}
        <path d={band((p) => p.lo90, (p) => p.hi90)} fill={C.cyan} opacity={0.10} />
        <path d={band((p) => p.lo80, (p) => p.hi80)} fill={C.cyan} opacity={0.16} />
        {/* predicted (cyan) + true (green) */}
        <path d={line((p) => p.predRul)} fill="none" stroke={C.cyan} strokeWidth={2} />
        <path d={line((p) => p.trueRul)} fill="none" stroke={C.green} strokeWidth={2} strokeDasharray="5 3" />
        <text x={W - padR} y={H - 6} textAnchor="end" fontSize={9} fill={C.faint} fontFamily={C.mono}>cycle →</text>
        <text x={padL} y={H - 6} textAnchor="start" fontSize={9} fill={C.faint} fontFamily={C.mono}>RUL (cycles)</text>
      </svg>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, paddingLeft: padL }}>
        <Legend color={C.green} dash label="True RUL" />
        <Legend color={C.cyan} label="Predicted RUL" />
        <Legend color={C.cyan} swatch label="80% / 90% interval" />
      </div>
    </div>
  );
}

function Legend({ color, label, dash, swatch }: { color: string; label: string; dash?: boolean; swatch?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {swatch
        ? <span style={{ width: 16, height: 10, background: color + "28", border: `1px solid ${color}55`, borderRadius: 2 }} />
        : <span style={{ width: 16, height: 0, borderTop: `2px ${dash ? "dashed" : "solid"} ${color}` }} />}
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{label}</span>
    </span>
  );
}

function CoverageRow({ nominal, observed }: { nominal: number; observed: number }) {
  const pass = Math.abs(observed - nominal) <= 0.03;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "center",
      fontFamily: C.mono, fontSize: 12, color: C.text, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.dim }}>{Math.round(nominal * 100)}% nominal</span>
      <span style={{ fontWeight: 600 }}>{(observed * 100).toFixed(1)}% observed</span>
      <span style={{ color: pass ? C.green : C.amber }}>Δ {(observed - nominal >= 0 ? "+" : "")}{((observed - nominal) * 100).toFixed(1)}%</span>
      <Tag color={pass ? C.green : C.amber}>{pass ? "within ±0.03" : "outside ±0.03"}</Tag>
    </div>
  );
}

function Note({ children, accent = C.dim }: { children: React.ReactNode; accent?: string }) {
  return <p style={{ fontFamily: C.sans, fontSize: 13, color: accent, lineHeight: 1.55, margin: 0 }}>{children}</p>;
}

export default function RulCalibration() {
  const i80 = E.intervals["80"], i90 = E.intervals["90"];
  const [drillOpen, setDrillOpen] = useState(false);

  return (
    // Full-bleed left-aligned like every other telemetry page (no centered max-width wrapper) so the
    // left margin matches the rest of the workbench; the shell's main padding owns the gutter.
    <div>
      <TelemetryPageHeader
        variant="standard"
        eyebrow="Telemetry · Calibration"
        title="RUL Calibration"
        description="CNN-LSTM FD001 champion with split-conformal uncertainty intervals. For one engine trajectory: how predicted RUL evolves toward failure, how wide the calibrated 80% and 90% intervals are, and where a late prediction would have been dangerous."
        actions={
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Tag color={C.green}>Champion: CNN-LSTM</Tag>
            <Tag color={C.green}>Gate: Passed</Tag>
            <Tag color={C.amber}>Not SOTA</Tag>
            <Tag color={C.faint}>Replay / evidence artifact</Tag>
          </div>
        }
      />

      {/* 2 — metric cards + baseline comparison */}
      <StatGrid cols={5} style={{ marginBottom: 12 }}>
        <MetricCard label="RMSE" value={E.cnnlstm.rmse.toFixed(2)} accent={C.cyan} sub={`GBM ${E.gbm.rmse.toFixed(2)}`} />
        <MetricCard label="PHM08 Score" value={E.cnnlstm.phm.toFixed(0)} accent={C.cyan} sub={`GBM ${E.gbm.phm.toFixed(0)}`} />
        <MetricCard label="80% PICP" value={i80.picp.toFixed(3)} accent={C.green} sub="nominal 0.80" />
        <MetricCard label="90% PICP" value={i90.picp.toFixed(3)} accent={C.green} sub="nominal 0.90" />
        <MetricCard label="Interval width (MPIW)" value={`${i80.mpiw.toFixed(1)} / ${i90.mpiw.toFixed(1)}`} sub={`GBM ${E.gbmIntervals["80"].mpiw} / ${E.gbmIntervals["90"].mpiw}`} />
      </StatGrid>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 0 14px" }}>
        <Tag color={C.amber}>computed artifact</Tag>
        <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint }}>
          FD001 scalars + conformal bands are a computed evidence artifact · the per-cycle trajectory is a replay fixture · not live serving
        </span>
      </div>

      <SplitGrid variant="two-one" style={{ marginBottom: 12 }}>
        {/* 3 — trajectory chart */}
        <Panel title={`Trajectory · ${TRAJECTORY_ENGINE_LABEL}`}
          right={<span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>true · predicted · 80/90% bands</span>}>
          <TrajectoryChart pts={TRAJ} />
          <Note accent={C.faint}>
            <span style={{ display: "block", marginTop: 12 }}>
              The shaded bands are the model&apos;s real split-conformal quantiles (q₈₀ = −{i80.qLower.toFixed(1)}/+{i80.qUpper.toFixed(1)},
              q₉₀ = −{i90.qLower.toFixed(1)}/+{i90.qUpper.toFixed(1)} cycles). Replay fixture from the committed evidence artifact — not live data.
            </span>
          </Note>
          <div style={{ marginTop: 14 }}>
            <TelemetryActionButton variant="secondary" onClick={() => setDrillOpen(true)}
              aria-label="Inspect the unit-level calibration rows and export">
              Unit-level rows + export ›
            </TelemetryActionButton>
          </div>
        </Panel>

        {/* 4 — calibration summary */}
        <Panel title="Calibration · coverage vs nominal">
          <div>
            <CoverageRow nominal={0.80} observed={E.reliability.find((r) => r.nominal === 0.8)!.observed} />
            <CoverageRow nominal={0.90} observed={E.reliability.find((r) => r.nominal === 0.9)!.observed} />
          </div>
          <div style={{ marginTop: 14 }}>
            <Note>
              Coverage passes the ±0.03 gate, but intervals remain intentionally wide. This is honest
              calibration, not a SOTA claim.
            </Note>
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase" }}>Reliability (all levels)</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 8 }}>
              {E.reliability.map((r) => (
                <div key={r.nominal} style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>
                  {Math.round(r.nominal * 100)}→{(r.observed * 100).toFixed(0)}%
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </SplitGrid>

      <SplitGrid variant="halves" style={{ marginBottom: 12 }}>
        {/* 5 — late prediction risk */}
        <Panel title="Late-prediction risk · why PHM08 matters">
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

        {/* 6 — negative result bridge */}
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

      {/* 7 — model card / evidence */}
      <Panel title="Model card · evidence">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Field label="Model" value="CNN-LSTM (Conv1D×2 → LSTM → Dense)" />
          <Field label="Dataset" value="C-MAPSS FD001 (public NASA analog)" />
          <Field label="Uncertainty" value="asymmetric split-conformal" />
          <Field label="Gate" value="RMSE↓ · PHM↓ · PICP ±0.03 · MPIW↓" />
          <Field label="Status" value="Champion — NOT literature-competitive (>13 RMSE bar)" tone={C.amber} />
          <Field label="Provenance" value={E.source} />
        </div>
      </Panel>

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

      <DisclosureFooter />
    </div>
  );
}

function EvidenceLink({ label, path }: { label: string; path: string }) {
  return (
    <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
      <span style={{ color: C.cyan }}>▸</span> {label}
      <span style={{ display: "block", color: C.faint, marginLeft: 14 }}>{path}</span>
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: tone || C.text, marginTop: 4, lineHeight: 1.4 }}>{value}</div>
    </div>
  );
}
