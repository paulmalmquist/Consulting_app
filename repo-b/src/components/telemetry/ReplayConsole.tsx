"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getReplayFeed, type ReplayFeed, type ReplayTick } from "@/lib/telemetry/api";
import { computeReplayDiagnostics } from "@/lib/telemetry/replayDiagnostics";
import {
  C, Panel, Loading, ErrorState, PageHeading, DisclosureFooter, SplitGrid,
  Stat, StatGrid, MetricRow, StatusDot, Tag,
} from "./primitives";
import ReplayForensicsDrawer from "./ReplayForensicsDrawer";

const W = 900, H = 280, PAD = 28;
const TICKS_PER_SECOND = 80;

function pathFor(points: ReplayTick[], vMin: number, vMax: number, n: number): string {
  if (points.length === 0) return "";
  const span = vMax - vMin || 1;
  const x = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - vMin) / span) * (H - 2 * PAD);
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
}

type DrawerTab = "signal" | "model" | "evidence" | "operator" | "lineage";

export default function ReplayConsole() {
  const [feed, setFeed] = useState<ReplayFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("signal");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { getReplayFeed().then(setFeed).catch((e) => setError(String(e))); }, []);

  useEffect(() => {
    if (!playing || !feed) return;
    timer.current = setInterval(() => {
      setCursor((c) => {
        if (c >= feed.feed.length - 1) { if (timer.current) clearInterval(timer.current); setPlaying(false); return c; }
        return c + 1;
      });
    }, 1000 / TICKS_PER_SECOND);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, feed]);

  const ticks = useMemo(() => feed?.feed ?? [], [feed]);
  const revealed = useMemo(() => ticks.slice(0, cursor + 1), [ticks, cursor]);
  const current = revealed[revealed.length - 1];
  const firedSoFar = useMemo(() => revealed.some((p) => p.model_pred === 1), [revealed]);
  const firstFireIdx = useMemo(() => ticks.findIndex((p) => p.model_pred === 1), [ticks]);
  // NASA-labeled anomaly window, by array index (x maps from index, not t).
  const labelStartIdx = useMemo(() => ticks.findIndex((p) => p.is_anomaly === 1), [ticks]);
  const labelEndIdx = useMemo(() => { let e = -1; ticks.forEach((p, i) => { if (p.is_anomaly === 1) e = i; }); return e; }, [ticks]);
  const vMin = useMemo(() => (ticks.length ? Math.min(...ticks.map((p) => p.value)) : 0), [ticks]);
  const vMax = useMemo(() => (ticks.length ? Math.max(...ticks.map((p) => p.value)) : 1), [ticks]);
  // All honesty-sensitive math lives in the pure adapter; the component only renders it.
  const diag = useMemo(() => (feed ? computeReplayDiagnostics(feed) : null), [feed]);

  const heading = (
    <PageHeading eyebrow="Replay test feed · NASA SMAP/MSL analog" title="Hot-fire-style replay → automated go/no-go"
      blurb="Replays a recorded run from the public SMAP/MSL anomaly baseline in accelerated time, framed as a hot-fire-style operational flow. The promoted anomaly model scores each tick; when it detects off-nominal behavior the verdict flips on its own. Nothing here is hand-authored; the flag is the model's output. Open the forensics drawer to inspect the signal, model evidence, verdict policy, operator action, and lineage." />
  );
  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!feed) return <>{heading}<Loading label="Loading replay feed…" /></>;
  if (feed.null_reason) return <>{heading}<ErrorState message={feed.null_reason} /></>;

  const vcol = firedSoFar ? C.red : C.green;
  const xAt = (idx: number) => PAD + (idx / Math.max(ticks.length - 1, 1)) * (W - 2 * PAD);
  const fireX = firstFireIdx >= 0 ? xAt(firstFireIdx) : -1;
  const cursorX = xAt(cursor);
  // NASA-labeled window overlay, revealed only up to the cursor (no spoiler ahead of playback).
  const labelStartX = labelStartIdx >= 0 ? xAt(labelStartIdx) : -1;
  const labelRevealedEndIdx = labelEndIdx >= 0 ? Math.min(labelEndIdx, cursor) : -1;
  const labelEndX = labelRevealedEndIdx >= 0 ? xAt(labelRevealedEndIdx) : -1;
  const showLabelBand = labelStartIdx >= 0 && cursor >= labelStartIdx;

  const openDrawer = (tab: DrawerTab) => { setDrawerTab(tab); setInspectOpen(true); };

  const sourceTableShort = diag!.sourceTable || feed.provenance.source_table;

  return (
    <>
      {heading}

      {/* Source-truth banner — the "is this real rocket data?" honesty line, stated before a reviewer reaches for it. */}
      <div style={{ border: `1px solid ${C.cyan}3a`, background: `${C.cyan}10`, borderRadius: 9,
        padding: "12px 15px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <StatusDot color={C.cyan} size={7} />
          <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.13em", textTransform: "uppercase", color: C.cyan }}>Source truth</span>
        </div>
        <p style={{ fontFamily: C.mono, fontSize: 11.5, color: C.dim, lineHeight: 1.6, margin: 0 }}>
          This replay uses <span style={{ color: C.text }}>public NASA SMAP/MSL telemetry anomaly data</span> as an aerospace
          time-series stand-in. The operational frame is hot-fire-style replay: telemetry → champion model → verdict → audit
          receipt. <span style={{ color: C.text }}>This is not proprietary rocket hot-fire data.</span>
        </p>
      </div>

      {/* Launch-stage timeline: fail-closed. The replay feed has no stage boundaries yet. */}
      <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 8, padding: "9px 12px",
        marginBottom: 16, fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
        Launch stages (T-60 · T-30 · Ignition · Max-Q · Stage Sep · Orbit):{" "}
        <span style={{ color: C.amber }}>not available</span> — the replay feed carries no stage boundaries
        (requires a backend stage field). Verdict is based on channel behavior only; phase-conditioned thresholds are not applied.
      </div>

      {/* Run packet — the inspectable facts a data scientist reaches for first. */}
      <Panel title="Run packet" pad={14} style={{ marginBottom: 16 }}>
        <StatGrid cols={4}>
          <Stat label="dataset" value="NASA SMAP/MSL" />
          <Stat label="channels" value={`${diag!.channel} · 1 of 1`} />
          <Stat label="fixture ticks" value={`${diag!.fixtureTicks} / ${diag!.totalTicksSource}`} />
          <Stat label="current tick" value={current?.t ?? 0} />
          <Stat label="first fire" value={diag!.firstModelFireT != null ? `t=${diag!.firstModelFireT}` : "—"} tone={C.red} />
          <Stat label="labeled window" value={diag!.labeledWindow ? `${diag!.labeledWindow.start}–${diag!.labeledWindow.end}` : "—"} tone={C.amber} />
          <Stat label="sampling" value={diag!.samplingFraction != null ? `${(diag!.samplingFraction * 100).toFixed(1)}%` : "—"} />
          <Stat label="stage context" value="not applied" tone={C.amber} />
        </StatGrid>
        <div style={{ marginTop: 12 }}>
          <MetricRow label="source table" value={sourceTableShort} />
          <MetricRow label="champion" value={(diag!.championModel.split(".").pop() || diag!.championModel)} />
          <MetricRow label="known anomaly window" value={diag!.labeledWindow ? `t=${diag!.labeledWindow.start} → ${diag!.labeledWindow.end} (NASA labels)` : "Not available"} divider={false} />
        </div>
      </Panel>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={() => { if (timer.current) clearInterval(timer.current); setCursor(0); setPlaying(true); }} disabled={playing}
          style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.bg, background: C.cyan,
            border: "none", borderRadius: 8, padding: "10px 18px", cursor: playing ? "default" : "pointer", opacity: playing ? 0.6 : 1 }}>
          {playing ? "Replaying…" : "Replay test feed"}
        </button>
        <button onClick={() => { if (timer.current) clearInterval(timer.current); setPlaying(false); setCursor(0); }}
          style={{ fontFamily: C.mono, fontSize: 13, color: C.dim, background: "transparent",
            border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>Reset</button>
        <button onClick={() => openDrawer("signal")}
          style={{ fontFamily: C.mono, fontSize: 13, color: C.cyan, background: "transparent",
            border: `1px solid ${C.cyan}55`, borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>Inspect replay →</button>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>
          channel {feed.channel} ({feed.spacecraft}) · tick <span style={{ color: C.text }}>{current?.t ?? 0}</span> / {ticks[ticks.length - 1]?.t ?? 0}
        </span>
      </div>

      <SplitGrid variant="main-side">
        <Panel title="Telemetry trace" pad={12}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} role="img" aria-label="Telemetry trace with model-fired and NASA-labeled overlays">
            {/* NASA-labeled anomaly window (amber) — what ground truth says is anomalous. */}
            {showLabelBand && labelEndX >= labelStartX && (
              <rect x={labelStartX} y={PAD} width={Math.max(labelEndX - labelStartX, 0)} height={H - 2 * PAD} fill={C.amber + "1c"} />
            )}
            {showLabelBand && (
              <line x1={labelStartX} y1={PAD} x2={labelStartX} y2={H - PAD} stroke={C.amber + "b0"} strokeDasharray="2 3" strokeWidth={1.2} />
            )}
            {/* Model-fired region (red) — where the champion's model_pred==1, revealed up to the cursor. */}
            {fireX >= 0 && cursorX >= fireX && (
              <rect x={fireX} y={PAD} width={Math.max(cursorX - fireX, 0)} height={H - 2 * PAD} fill={C.red + "1f"} />
            )}
            {fireX >= 0 && cursorX >= fireX && (
              <line x1={fireX} y1={PAD} x2={fireX} y2={H - PAD} stroke={C.red + "b0"} strokeDasharray="4 3" strokeWidth={1.5} />
            )}
            <path d={pathFor(revealed, vMin, vMax, ticks.length)} fill="none" stroke={vcol} strokeWidth={1.6} />
            {revealed.length > 0 && (
              <circle cx={cursorX} cy={H - PAD - ((current!.value - vMin) / ((vMax - vMin) || 1)) * (H - 2 * PAD)} r={3} fill={vcol} />
            )}
          </svg>
          {/* Legend — label every overlay directly (no ambiguous "red region"). */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, paddingLeft: 4 }}>
            <LegendSwatch color={C.red} label="model-fired (model_pred=1)" />
            <LegendSwatch color={C.amber} label="NASA-labeled window (is_anomaly=1)" />
            <LegendSwatch color={C.red} dashed label="first autonomous fire" />
          </div>
          <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.5, paddingLeft: 4 }}>
            D-4 channel value (normalized, unitless — no published physical unit).{" "}
            {diag!.isPreLabel && diag!.firstModelFireT != null && diag!.labeledWindow
              ? <span style={{ color: C.dim }}>Model first fires at t={diag!.firstModelFireT}, ~{Math.abs(diag!.detectionLatencyTicks ?? 0)} ticks before the labeled window opens at t={diag!.labeledWindow.start} — those {diag!.preLabelFalseAlarms} early fires are surfaced, not hidden.</span>
              : null}
          </p>
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ borderRadius: 10, padding: 20, textAlign: "center",
            border: `1px solid ${vcol}55`, background: vcol + "1a", transition: "all 220ms" }}>
            <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.18em", color: C.faint, textTransform: "uppercase" }}>Automated verdict</div>
            <div style={{ fontFamily: C.sans, fontSize: 40, fontWeight: 700, color: vcol, lineHeight: 1, marginTop: 6,
              textShadow: `0 0 18px ${vcol}55` }}>{firedSoFar ? "NO-GO" : "GO"}</div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 10 }}>
              {firedSoFar ? "Off-nominal: channel D-4 fired the frozen residual detector (model_pred=1)." : "Nominal: no revealed tick has fired."}
            </div>
            {firedSoFar && (
              <button onClick={() => openDrawer("operator")}
                style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: C.bg, background: C.cyan,
                  border: "none", borderRadius: 8, padding: "9px 14px", marginTop: 14, cursor: "pointer", width: "100%" }}>
                Explain this verdict →
              </button>
            )}
          </div>

          {/* Inspectable "why" — separates model output from verdict policy, with score/threshold honestly null. */}
          <Panel title="Why this verdict" pad={14}>
            <MetricRow label="fired channel" value={firedSoFar ? "D-4" : "—"} tone={firedSoFar ? C.red : C.dim} />
            <MetricRow label="first fire" value={diag!.firstModelFireT != null ? `t=${diag!.firstModelFireT}` : "—"} />
            <MetricRow label="residual at fire" value={diag!.residualAtFire != null ? `${diag!.residualAtFire.toFixed(4)} ( |value−rmean| )` : "—"} />
            <MetricRow label="score / threshold / margin" value="Not available (no calibrated score in payload)" tone={C.amber} />
            <MetricRow label="policy" value="frozen detector · model_pred flip" />
            <MetricRow label="basis" value="model output, not hand-authored" divider={false} />
            <div style={{ marginTop: 10, border: `1px solid ${(diag!.isPreLabel ? C.red : C.cyan)}33`,
              background: `${(diag!.isPreLabel ? C.red : C.cyan)}0d`, borderRadius: 7, padding: "8px 11px",
              display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ marginTop: 3 }}><StatusDot color={diag!.isPreLabel ? C.red : C.cyan} size={6} /></span>
              <span style={{ fontFamily: C.mono, fontSize: 10.5, color: diag!.isPreLabel ? C.red : C.dim, lineHeight: 1.5 }}>{diag!.latencyFraming}</span>
            </div>
          </Panel>

          <p style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, textAlign: "center",
            lineHeight: 1.5, margin: "-2px 4px 0" }}>
            GO/NO-GO bands are fixed (frozen detector). A conformal false-alarm budget diagnostic
            (target α vs measured calibration rate) is in the forensics drawer · Model tab.
          </p>
          <Panel title="Sensor attribution" pad={14}>
            {firedSoFar ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 12 }}>
                  <span style={{ color: C.text }}>D-4</span>
                  <span style={{ color: C.red }}>fired @ t={diag!.firstModelFireT}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: C.panelHi, marginTop: 8, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "100%", background: C.red }} />
                </div>
                <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 1.4 }}>
                  Single-channel detector — the replay feed scores only D-4 (1 of 1 channel), so attribution is
                  univariate; no correlated channels are present in this payload to corroborate.
                </p>
                <button onClick={() => openDrawer("evidence")}
                  style={{ fontFamily: C.mono, fontSize: 11.5, color: C.cyan, background: "transparent",
                    border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px", marginTop: 10, cursor: "pointer", width: "100%" }}>
                  Inspect evidence →
                </button>
              </>
            ) : <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>No contributing channels yet.</span>}
          </Panel>
        </div>
      </SplitGrid>

      <Panel style={{ marginTop: 16 }} pad={14}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
          <span style={{ color: C.dim, fontWeight: 600 }}>Provenance. </span>
          Replay reads precomputed real champion outputs from <span style={{ color: C.dim }}>{feed.provenance.source_table}</span>.
          The flag the verdict flips on is the model&apos;s own model_pred, not a hand-authored anomaly flag.
          {feed.fixture_ticks} ticks (downsampled from {feed.total_ticks_source}); first autonomous fire at t={feed.first_model_fire_t}.
        </span>
      </Panel>
      <DisclosureFooter />

      <ReplayForensicsDrawer
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        feed={feed}
        cursorTick={current ?? null}
        fired={firedSoFar}
        initialTab={drawerTab}
      />
    </>
  );
}

function LegendSwatch({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span aria-hidden style={{ width: 18, height: dashed ? 0 : 9, borderTop: dashed ? `1.5px dashed ${color}` : undefined,
        background: dashed ? undefined : color + "55", border: dashed ? undefined : `1px solid ${color}`, borderRadius: 2, display: "inline-block" }} />
      <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.dim }}>{label}</span>
    </span>
  );
}
