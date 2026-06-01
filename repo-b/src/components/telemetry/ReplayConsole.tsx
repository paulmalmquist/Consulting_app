"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getReplayFeed, type ReplayFeed, type ReplayTick } from "@/lib/telemetry/api";
import { Card, ErrorState, Loading, PublicDataFooter } from "./primitives";

// Plain-SVG trace: reliable, no chart-library friction on the demo's load-bearing moment.
const W = 900;
const H = 280;
const PAD = 28;
const TICKS_PER_SECOND = 80; // playback speed; the fixture is pre-warmed so this never stalls

type Verdict = "GO" | "NO_GO";

function pathFor(points: ReplayTick[], vMin: number, vMax: number, n: number): string {
  if (points.length === 0) return "";
  const span = vMax - vMin || 1;
  const x = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - vMin) / span) * (H - 2 * PAD);
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
}

export default function ReplayConsole() {
  const [feed, setFeed] = useState<ReplayFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0); // index into feed.feed currently revealed
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getReplayFeed()
      .then((f) => setFeed(f))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!playing || !feed) return;
    timer.current = setInterval(() => {
      setCursor((c) => {
        if (c >= feed.feed.length - 1) {
          if (timer.current) clearInterval(timer.current);
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 1000 / TICKS_PER_SECOND);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, feed]);

  const ticks = feed?.feed ?? [];
  const revealed = useMemo(() => ticks.slice(0, cursor + 1), [ticks, cursor]);
  const current = revealed[revealed.length - 1];

  // The verdict is the model's own output: NO_GO once the champion has fired at or before the cursor.
  const firedSoFar = useMemo(() => revealed.some((p) => p.model_pred === 1), [revealed]);
  const verdict: Verdict = firedSoFar ? "NO_GO" : "GO";
  const firstFireIdx = useMemo(() => ticks.findIndex((p) => p.model_pred === 1), [ticks]);

  const vMin = useMemo(() => (ticks.length ? Math.min(...ticks.map((p) => p.value)) : 0), [ticks]);
  const vMax = useMemo(() => (ticks.length ? Math.max(...ticks.map((p) => p.value)) : 1), [ticks]);

  if (error) return <ErrorState message={error} />;
  if (!feed) return <Loading label="Loading replay feed…" />;
  if (feed.null_reason) return <ErrorState message={feed.null_reason} />;

  const start = () => {
    setCursor(0);
    setPlaying(true);
  };
  const reset = () => {
    setPlaying(false);
    setCursor(0);
  };

  // Redline band: the champion fires when the standardized residual crosses threshold. We mark the
  // first-fire tick position on the x-axis so the reviewer sees where the model called it.
  const fireX =
    firstFireIdx >= 0
      ? PAD + (firstFireIdx / Math.max(ticks.length - 1, 1)) * (W - 2 * PAD)
      : -1;
  const cursorX = PAD + (cursor / Math.max(ticks.length - 1, 1)) * (W - 2 * PAD);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={start}
          disabled={playing}
          className="rounded-md bg-bm-accent px-4 py-2 text-sm font-semibold text-[hsl(220_18%_10%)] hover:opacity-90 disabled:opacity-50"
        >
          {playing ? "Replaying…" : "Replay test feed"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-bm-border/70 px-3 py-2 text-sm text-bm-muted hover:text-bm-text"
        >
          Reset
        </button>
        <span className="text-xs text-bm-muted2">
          Channel {feed.channel} ({feed.spacecraft}) · tick{" "}
          <span className="tabular-nums text-bm-text">{current?.t ?? 0}</span> /{" "}
          {ticks[ticks.length - 1]?.t ?? 0}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
        {/* Trace */}
        <Card className="overflow-hidden p-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
               aria-label="Telemetry trace with detected anomaly">
            {/* anomaly region: shade from first fire to the end once revealed past it */}
            {fireX >= 0 && cursorX >= fireX ? (
              <rect x={fireX} y={PAD} width={Math.max(cursorX - fireX, 0)} height={H - 2 * PAD}
                    fill="hsl(0 84% 60% / 0.12)" />
            ) : null}
            {/* first-fire marker */}
            {fireX >= 0 && cursorX >= fireX ? (
              <line x1={fireX} y1={PAD} x2={fireX} y2={H - PAD}
                    stroke="hsl(0 84% 60% / 0.7)" strokeDasharray="4 3" strokeWidth={1.5} />
            ) : null}
            {/* the trace itself */}
            <path d={pathFor(revealed, vMin, vMax, ticks.length)} fill="none"
                  stroke={verdict === "NO_GO" ? "hsl(0 84% 65%)" : "hsl(200 89% 60%)"}
                  strokeWidth={1.6} />
            {/* playback head */}
            {revealed.length > 0 ? (
              <circle cx={cursorX}
                      cy={H - PAD - ((current!.value - vMin) / ((vMax - vMin) || 1)) * (H - 2 * PAD)}
                      r={3} fill={verdict === "NO_GO" ? "hsl(0 84% 65%)" : "hsl(200 89% 60%)"} />
            ) : null}
          </svg>
          <p className="mt-1 text-center text-[11px] text-bm-muted2">
            D-4 telemetry value · red dashed line = first autonomous model detection
          </p>
        </Card>

        {/* Go / No-Go */}
        <div className="space-y-3">
          <div
            className={
              "rounded-lg border p-5 text-center transition-colors " +
              (verdict === "NO_GO"
                ? "border-rose-400/50 bg-rose-500/15"
                : "border-emerald-400/50 bg-emerald-500/15")
            }
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-bm-muted2">
              Automated verdict
            </p>
            <p
              className={
                "mt-1 text-4xl font-bold tabular-nums " +
                (verdict === "NO_GO" ? "text-rose-300" : "text-emerald-300")
              }
            >
              {verdict === "NO_GO" ? "NO-GO" : "GO"}
            </p>
            <p className="mt-2 text-xs text-bm-muted">
              {verdict === "NO_GO"
                ? "Off-nominal: channel D-4 crossed the detector redline."
                : "Nominal: all channels within bounds."}
            </p>
          </div>

          {/* Attribution / rationale */}
          <Card className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-bm-muted2">
              Sensor attribution
            </p>
            {firedSoFar ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-bm-text">D-4</span>
                  <span className="tabular-nums text-rose-300">
                    fired @ t={ticks[firstFireIdx]?.t}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-bm-surface">
                  <div className="h-full rounded-full bg-rose-400" style={{ width: "100%" }} />
                </div>
                <p className="text-[11px] text-bm-muted">
                  Detected by {feed.provenance.champion_model.split(".").pop()} (MLflow run{" "}
                  <span className="font-mono">
                    {feed.provenance.champion_mlflow_run_id.slice(0, 10)}
                  </span>
                  ).
                </p>
              </>
            ) : (
              <p className="text-sm text-bm-muted">No contributing channels yet.</p>
            )}
          </Card>
        </div>
      </div>

      <Card className="text-[11px] leading-relaxed text-bm-muted2">
        <span className="font-semibold text-bm-muted">Provenance.</span> Replay reads precomputed real
        champion outputs from{" "}
        <span className="font-mono">{feed.provenance.source_table}</span>. The flag the verdict flips
        on is the model&apos;s own <span className="font-mono">model_pred</span> — not a hand-authored
        anomaly flag. {feed.fixture_ticks} ticks (downsampled from {feed.total_ticks_source}); first
        autonomous fire at t={feed.first_model_fire_t}.
      </Card>

      <PublicDataFooter />
    </div>
  );
}
