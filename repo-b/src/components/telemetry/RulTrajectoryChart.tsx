"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { C } from "./primitives";
import { TelemetryChartFrame } from "./chartPrimitives";
import {
  buildRulChartPointDrawerTarget,
  RUL_LATE_RISK_RUL,
  type RulChartPointTarget,
} from "@/lib/telemetry/rulCalibrationEvidence";
import type { CalibrationPoint } from "@/lib/telemetry/calibrationEvidence";

// Trajectory chart on recharts (the house pattern — see stargate/TempVibrationChart). True vs predicted
// RUL with shaded 80/90% conformal bands, a custom hover tooltip, click-to-inspect on each cycle, and a
// late-risk reference zone near low true RUL. Bands are drawn as range Areas ([lower, upper] pairs); the
// 90% band renders first/faint, the 80% band on top. Click builds the drawer target via the shared pure
// helper so the interaction is testable without simulating recharts hover.

type Row = CalibrationPoint & { band80: [number, number]; band90: [number, number] };

function toRows(pts: CalibrationPoint[]): Row[] {
  return pts.map((p) => ({ ...p, band80: [p.lo80, p.hi80], band90: [p.lo90, p.hi90] }));
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Row }> }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  const t = buildRulChartPointDrawerTarget(row);
  return (
    <div style={{ background: C.panelHi, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "9px 11px",
      fontFamily: C.mono, fontSize: 11, color: C.text, lineHeight: 1.55, maxWidth: 240 }}>
      <div style={{ color: C.dim, marginBottom: 4 }}>cycle {t.cycle}</div>
      <Line2 label="true RUL" value={`${t.trueRul}`} color={C.green} />
      <Line2 label="predicted" value={`${t.predRul}`} color={C.cyan} />
      <Line2 label="error" value={`${t.error > 0 ? "+" : ""}${t.error}`} color={t.late ? C.amber : C.dim} />
      <Line2 label="80% band" value={`[${t.lo80}, ${t.hi80}] ${t.inside80 ? "✓" : "✗"}`} color={C.dim} />
      <Line2 label="90% band" value={`[${t.lo90}, ${t.hi90}] ${t.inside90 ? "✓" : "✗"}`} color={C.dim} />
      {t.lateRisk && <div style={{ color: C.red, marginTop: 4 }}>late prediction near failure — operational risk</div>}
      <div style={{ color: C.faint, marginTop: 5 }}>click to inspect this cycle</div>
    </div>
  );
}

function Line2({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
      <span style={{ color: C.faint }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );
}

export function RulTrajectoryChart({
  pts,
  engineLabel,
  onPointClick,
}: {
  pts: CalibrationPoint[];
  engineLabel: string;
  onPointClick: (t: RulChartPointTarget) => void;
}) {
  const rows = toRows(pts);
  const yMax = Math.max(...pts.map((p) => p.hi90)) * 1.05;
  // The dangerous region: low true RUL (near failure), where a late prediction matters most.
  const lateZone = rows.filter((r) => r.trueRul <= RUL_LATE_RISK_RUL);
  const lateX1 = lateZone.length ? lateZone[0].cycle : null;
  const lateX2 = lateZone.length ? lateZone[lateZone.length - 1].cycle : null;

  const handleClick = (state: { activePayload?: Array<{ payload: Row }> } | null) => {
    const row = state?.activePayload?.[0]?.payload;
    if (row) onPointClick(buildRulChartPointDrawerTarget(row));
  };

  return (
    <TelemetryChartFrame
      title={`Trajectory · ${engineLabel}`}
      right={<span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>true · predicted · 80/90% bands</span>}
      legend={[
        { label: "True RUL", color: C.green, dashed: true },
        { label: "Predicted RUL", color: C.cyan },
        { label: "80% / 90% interval", color: C.cyan },
      ]}
      ariaLabel="RUL trajectory with 80% and 90% calibrated intervals; click a cycle to inspect it"
      caption="Replay fixture — one representative FD001 engine, not live serving. Hover a cycle for detail, click to inspect."
    >
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 24, left: 8 }} onClick={handleClick}>
          <CartesianGrid stroke={C.border} strokeDasharray="3 4" />
          <XAxis
            dataKey="cycle"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fontFamily: C.mono, fontSize: 10, fill: C.faint }}
            stroke={C.border}
            label={{ value: "Cycle", position: "insideBottom", offset: -12, fill: C.faint, fontSize: 11, fontFamily: C.mono }}
          />
          <YAxis
            domain={[0, Math.ceil(yMax / 25) * 25]}
            tick={{ fontFamily: C.mono, fontSize: 10, fill: C.faint }}
            stroke={C.border}
            label={{ value: "RUL cycles", angle: -90, position: "insideLeft", fill: C.faint, fontSize: 11, fontFamily: C.mono }}
          />
          {lateX1 !== null && lateX2 !== null && (
            <ReferenceArea
              x1={lateX1}
              x2={lateX2}
              fill={C.red}
              fillOpacity={0.07}
              stroke={C.red}
              strokeOpacity={0.35}
              strokeDasharray="4 3"
              label={{ value: "late-risk zone", position: "insideTopRight", fill: C.red, fontSize: 9, fontFamily: C.mono }}
            />
          )}
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: C.borderHi, strokeWidth: 1 }} />
          {/* 90% band first (faint), 80% band over it (a touch stronger) */}
          <Area dataKey="band90" stroke="none" fill={C.cyan} fillOpacity={0.08} isAnimationActive={false} activeDot={false} name="90% interval" />
          <Area dataKey="band80" stroke="none" fill={C.cyan} fillOpacity={0.16} isAnimationActive={false} activeDot={false} name="80% interval" />
          <Line dataKey="predRul" stroke={C.cyan} strokeWidth={2} dot={false} isAnimationActive={false} name="predicted RUL" />
          <Line dataKey="trueRul" stroke={C.green} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} name="true RUL" />
        </ComposedChart>
      </ResponsiveContainer>
    </TelemetryChartFrame>
  );
}
