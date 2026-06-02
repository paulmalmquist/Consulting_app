"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getReplayFeed, type ReplayFeed, type ReplayTick } from "@/lib/telemetry/api";
import { C, Tag, Panel, Loading, ErrorState, PageHeading, DisclosureFooter } from "./primitives";
import { CopilotExplanationPanel } from "./Copilot";

const W = 900, H = 280, PAD = 28;
const TICKS_PER_SECOND = 80;

function pathFor(points: ReplayTick[], vMin: number, vMax: number, n: number): string {
  if (points.length === 0) return "";
  const span = vMax - vMin || 1;
  const x = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - vMin) / span) * (H - 2 * PAD);
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
}

export default function ReplayConsole() {
  const [feed, setFeed] = useState<ReplayFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [explain, setExplain] = useState(false);
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

  const ticks = feed?.feed ?? [];
  const revealed = useMemo(() => ticks.slice(0, cursor + 1), [ticks, cursor]);
  const current = revealed[revealed.length - 1];
  const firedSoFar = useMemo(() => revealed.some((p) => p.model_pred === 1), [revealed]);
  const firstFireIdx = useMemo(() => ticks.findIndex((p) => p.model_pred === 1), [ticks]);
  const vMin = useMemo(() => (ticks.length ? Math.min(...ticks.map((p) => p.value)) : 0), [ticks]);
  const vMax = useMemo(() => (ticks.length ? Math.max(...ticks.map((p) => p.value)) : 1), [ticks]);

  const heading = (
    <PageHeading eyebrow="Replay test feed" title="Hot-fire replay → automated go/no-go"
      blurb="Replay a recorded test run in accelerated time. The promoted anomaly model scores each tick; when it detects off-nominal behavior the verdict flips on its own. Nothing here is hand-authored; the flag is the model's output." />
  );
  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!feed) return <>{heading}<Loading label="Loading replay feed…" /></>;
  if (feed.null_reason) return <>{heading}<ErrorState message={feed.null_reason} /></>;

  const verdict = firedSoFar ? "NO_GO" : "GO";
  const vcol = firedSoFar ? C.red : C.green;
  const fireX = firstFireIdx >= 0 ? PAD + (firstFireIdx / Math.max(ticks.length - 1, 1)) * (W - 2 * PAD) : -1;
  const cursorX = PAD + (cursor / Math.max(ticks.length - 1, 1)) * (W - 2 * PAD);

  return (
    <>
      {heading}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={() => { setCursor(0); setPlaying(true); }} disabled={playing}
          style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.bg, background: C.cyan,
            border: "none", borderRadius: 8, padding: "10px 18px", cursor: playing ? "default" : "pointer", opacity: playing ? 0.6 : 1 }}>
          {playing ? "Replaying…" : "Replay test feed"}
        </button>
        <button onClick={() => { setPlaying(false); setCursor(0); }}
          style={{ fontFamily: C.mono, fontSize: 13, color: C.dim, background: "transparent",
            border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>Reset</button>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>
          channel {feed.channel} ({feed.spacecraft}) · tick <span style={{ color: C.text }}>{current?.t ?? 0}</span> / {ticks[ticks.length - 1]?.t ?? 0}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <Panel title="Telemetry trace" pad={12}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} role="img" aria-label="Telemetry trace with detected anomaly">
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
          <p style={{ textAlign: "center", fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 4 }}>
            D-4 telemetry value · red dashed line = first autonomous model detection
          </p>
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ borderRadius: 10, padding: 20, textAlign: "center",
            border: `1px solid ${vcol}55`, background: vcol + "1a", transition: "all 220ms" }}>
            <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.18em", color: C.faint, textTransform: "uppercase" }}>Automated verdict</div>
            <div style={{ fontFamily: C.sans, fontSize: 40, fontWeight: 700, color: vcol, lineHeight: 1, marginTop: 6,
              textShadow: `0 0 18px ${vcol}55` }}>{firedSoFar ? "NO-GO" : "GO"}</div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 10 }}>
              {firedSoFar ? "Off-nominal: channel D-4 crossed the detector redline." : "Nominal: channel within bounds."}
            </div>
            {firedSoFar && (
              <button onClick={() => setExplain((e) => !e)}
                style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: C.bg, background: C.cyan,
                  border: "none", borderRadius: 8, padding: "9px 14px", marginTop: 14, cursor: "pointer", width: "100%" }}>
                {explain ? "Hide explanation" : "Explain this verdict →"}
              </button>
            )}
          </div>
          <Panel title="Sensor attribution" pad={14}>
            {firedSoFar ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 12 }}>
                  <span style={{ color: C.text }}>D-4</span>
                  <span style={{ color: C.red }}>fired @ t={ticks[firstFireIdx]?.t}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: C.panelHi, marginTop: 8, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "100%", background: C.red }} />
                </div>
                <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 1.4 }}>
                  Detected by {feed.provenance.champion_model.split(".").pop()} (MLflow run{" "}
                  <span style={{ color: C.dim }}>{feed.provenance.champion_mlflow_run_id.slice(0, 10)}</span>).
                </p>
              </>
            ) : <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>No contributing channels yet.</span>}
          </Panel>
        </div>
      </div>

      {explain && firedSoFar && (
        <div style={{ marginTop: 16 }}>
          <CopilotExplanationPanel
            runKey={`smap_msl:${feed.channel}:test`}
            fireTick={ticks[firstFireIdx]?.t ?? 728}
            channel={feed.channel} />
        </div>
      )}

      <Panel style={{ marginTop: 16 }} pad={14}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
          <span style={{ color: C.dim, fontWeight: 600 }}>Provenance. </span>
          Replay reads precomputed real champion outputs from <span style={{ color: C.dim }}>{feed.provenance.source_table}</span>.
          The flag the verdict flips on is the model&apos;s own model_pred, not a hand-authored anomaly flag.
          {feed.fixture_ticks} ticks (downsampled from {feed.total_ticks_source}); first autonomous fire at t={feed.first_model_fire_t}.
        </span>
      </Panel>
      <DisclosureFooter />
    </>
  );
}
