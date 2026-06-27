"use client";

// Dual-axis live chart: melt-pool temperature (left, degC) and arm vibration
// (right, g) for the selected printer, with the 5s windowed average overlaid
// (Flink output in cloud mode, the labeled local emulation otherwise),
// threshold reference lines at the anomaly constants, and translucent red
// bands where anomalies were routed.

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { C } from "../primitives";
import type { AggRow, AnomalyRow, TelemetryPoint } from "@/lib/lab/stargateStream";

const WINDOW_MS = 60_000;
const TEMP_THRESHOLD_C = 1400;
const VIBRATION_THRESHOLD_G = 0.08;

type Row = { ts: number; temp?: number; vib?: number; aggTemp?: number };

function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

// Collapse adjacent per-anomaly micro-bands (each a ±400ms paint at one routed ts) into contiguous
// windows, so a burst of co-occurring anomalies reads as ONE labeled window instead of 40 stacked
// labels. gapMs coalesces samples a tick apart while keeping genuinely separate incidents distinct.
type Band = { x1: number; x2: number };
function clusterBands(tsList: number[], halfWidthMs = 400, gapMs = 800): Band[] {
  if (!tsList.length) return [];
  const sorted = [...tsList].sort((a, b) => a - b);
  const out: Band[] = [];
  let cur: Band = { x1: sorted[0] - halfWidthMs, x2: sorted[0] + halfWidthMs };
  for (let i = 1; i < sorted.length; i++) {
    const x1 = sorted[i] - halfWidthMs, x2 = sorted[i] + halfWidthMs;
    if (x1 <= cur.x2 + gapMs) cur.x2 = Math.max(cur.x2, x2);
    else { out.push(cur); cur = { x1, x2 }; }
  }
  out.push(cur);
  return out;
}

// Line-swatch legend item (a thin rect reads as a line series; a dot would misrepresent it).
function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 14, height: 2, borderRadius: 2, display: "inline-block",
        background: dashed ? "none" : color,
        backgroundImage: dashed ? `repeating-linear-gradient(to right, ${color} 0 4px, transparent 4px 7px)` : undefined,
        opacity: dashed ? 0.7 : 1 }} />
      <span>{label}</span>
    </span>
  );
}

export default function TempVibrationChart({
  points,
  agg,
  anomalies,
  highlight,
}: {
  points: TelemetryPoint[];
  agg: AggRow[];
  anomalies: AnomalyRow[];
  // Optional "surrounding 60 seconds" window (ms) highlighted from the inspection drawer.
  highlight?: { start: number; end: number } | null;
}) {
  if (!points.length) {
    return <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, padding: 12 }}>Waiting for stream…</div>;
  }

  const newestTs = points[points.length - 1].ts_us / 1000;
  const cutoff = newestTs - WINDOW_MS;

  const rows: Row[] = points
    .filter((p) => p.ts_us / 1000 >= cutoff)
    .map((p) => ({ ts: p.ts_us / 1000, temp: p.melt_pool_temp_c, vib: p.arm_vibration_g }));
  for (const a of agg) {
    if (a.window_end_ms >= cutoff && a.window_end_ms <= newestTs) {
      rows.push({ ts: a.window_end_ms, aggTemp: a.avg_temp_c });
    }
  }
  rows.sort((a, b) => a.ts - b.ts);

  const bands = anomalies
    .filter((a) => a.ts_us / 1000 >= cutoff)
    .slice(-40)
    .map((a) => a.ts_us / 1000);
  const bandClusters = clusterBands(bands);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center",
        marginBottom: 8, fontFamily: C.mono, fontSize: 10, color: C.dim }}>
        <LegendItem color={C.cyan} label="melt pool temp (degC, left)" />
        <LegendItem color={C.green} label="arm vibration (g, right)" />
        <LegendItem color={C.cyan} label="5s avg temp (degC, left)" dashed />
        <LegendItem color={C.red} label="anomaly band (temp<1400 AND vib>0.08)" />
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginBottom: 8, lineHeight: 1.5 }}>
        Anomaly rule: a cold melt pool (&lt;1400degC) AND high arm vibration (&gt;0.08g), together.
        Red bands mark routed anomalies.
      </div>
      <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={C.border} strokeDasharray="3 4" />
        <XAxis
          dataKey="ts"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={fmtClock}
          tick={{ fontFamily: C.mono, fontSize: 10, fill: C.faint }}
          stroke={C.border}
        />
        <YAxis
          yAxisId="temp"
          domain={[1280, 1640]}
          tick={{ fontFamily: C.mono, fontSize: 10, fill: C.faint }}
          stroke={C.border}
          label={{ value: "degC", angle: -90, position: "insideLeft", fill: C.faint, fontSize: 10 }}
        />
        <YAxis
          yAxisId="vib"
          orientation="right"
          domain={[0, 0.16]}
          tick={{ fontFamily: C.mono, fontSize: 10, fill: C.faint }}
          stroke={C.border}
          label={{ value: "g", angle: 90, position: "insideRight", fill: C.faint, fontSize: 10 }}
        />
        <Tooltip
          contentStyle={{ background: C.panelHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
            fontFamily: C.mono, fontSize: 11 }}
          labelFormatter={(ts) => fmtClock(Number(ts))}
          formatter={(value: number, name: string, entry: { dataKey?: string | number }) =>
            [Number(value).toFixed(entry?.dataKey === "vib" ? 4 : 1), name]}
        />
        {bandClusters.map((b, i) => (
          <ReferenceArea key={b.x1} yAxisId="temp" x1={b.x1} x2={b.x2}
            fill={C.red} fillOpacity={0.16} stroke="none"
            label={i === 0 ? { value: "anomaly: temp<1400 AND vib>0.08", position: "insideTop",
              fill: C.red, fontSize: 9, fontFamily: C.mono } : undefined} />
        ))}
        {highlight && (
          <ReferenceArea yAxisId="temp" x1={highlight.start} x2={highlight.end}
            fill={C.cyan} fillOpacity={0.1} stroke={C.cyan} strokeOpacity={0.5} strokeDasharray="4 3" />
        )}
        <ReferenceLine yAxisId="temp" y={TEMP_THRESHOLD_C} stroke={C.red} strokeDasharray="5 4"
          label={{ value: "1400degC floor", position: "insideBottomLeft", fill: C.red, fontSize: 10, fontFamily: C.mono }} />
        <ReferenceLine yAxisId="vib" y={VIBRATION_THRESHOLD_G} stroke={C.amber} strokeDasharray="5 4"
          label={{ value: "0.08g ceiling", position: "insideTopRight", fill: C.amber, fontSize: 10, fontFamily: C.mono }} />
        <Line yAxisId="temp" dataKey="temp" stroke={C.cyan} dot={false} strokeWidth={1.4}
          isAnimationActive={false} connectNulls name="melt pool temp" />
        <Line yAxisId="vib" dataKey="vib" stroke={C.green} dot={false} strokeWidth={1.1}
          isAnimationActive={false} connectNulls name="arm vibration" />
        <Line yAxisId="temp" dataKey="aggTemp" stroke={C.cyan} strokeOpacity={0.55}
          strokeWidth={1.4} strokeDasharray="6 3" dot={false}
          isAnimationActive={false} connectNulls name="5s avg temp" />
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  );
}
