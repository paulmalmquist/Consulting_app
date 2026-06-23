"use client";

// Panel 2: cost to LEO on a log scale. Two lines from the same points: nominal dollars and
// approximate 2025 dollars; the inflation toggle decides which one is emphasized.
import React from "react";
import {
  CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { LineProps, TooltipProps } from "recharts";

import { RS, RS_MONO } from "../../rsTokens";
import { YEAR_SERIES } from "./data";
import PanelShell, { yearFromChartState } from "./PanelShell";
import type { YearPoint } from "./types";

interface CostDotProps {
  key?: string;
  cx?: number;
  cy?: number;
  payload?: YearPoint;
}

function CostTip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload as YearPoint | undefined;
  if (!d?.costMeta || d.costNominal == null || d.costAdj == null) return null;
  return (
    <div style={{ background: RS.panel, border: `1px solid ${RS.line}`, borderRadius: 6,
      padding: "8px 10px", maxWidth: 260, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
      <div style={{ fontSize: 12, color: RS.text, fontWeight: 600 }}>{d.costMeta.v}</div>
      <div style={{ fontSize: 11, color: RS.faint, fontFamily: RS_MONO, marginTop: 3 }}>${d.costNominal.toLocaleString()}/kg nominal</div>
      <div style={{ fontSize: 11, color: RS.amber, fontFamily: RS_MONO }}>${d.costAdj.toLocaleString()}/kg in 2025 $</div>
      <div style={{ fontSize: 9.5, color: RS.faint, marginTop: 4, lineHeight: 1.4 }}>{d.costMeta.basis}</div>
    </div>
  );
}

export default function CostPanel({ inflationAdjusted, hoveredYear, focused, dimmed, onHoverYear }: {
  inflationAdjusted: boolean;
  hoveredYear: number | null;
  focused: boolean;
  dimmed: boolean;
  onHoverYear: (year: number | null) => void;
}) {
  const emphasizedKey: "costAdj" | "costNominal" = inflationAdjusted ? "costAdj" : "costNominal";
  const mutedKey: "costAdj" | "costNominal" = inflationAdjusted ? "costNominal" : "costAdj";

  // Vehicle label on the emphasized line's dots only.
  const renderCostDot = (props: CostDotProps): React.ReactElement => {
    const { cx, cy, payload } = props;
    const val = payload?.[emphasizedKey];
    if (cx == null || cy == null || !payload?.costMeta || val == null) return <g key={props.key} />;
    return (
      <g key={props.key}>
        <circle cx={cx} cy={cy} r={3.5} fill={RS.amber} stroke={RS.bg} strokeWidth={1.5} />
        <text x={cx} y={cy - 8} textAnchor="middle" fill={RS.amber} fontSize={8.5} fontFamily={RS_MONO}>
          {payload.costMeta.v} ${val >= 10000 ? (val / 1000).toFixed(0) + "k" : val.toLocaleString()}
        </text>
      </g>
    );
  };

  return (
    <PanelShell title="Cost to LEO" accent={RS.amber}
      sub={`Cost per kilogram to orbit fell ~94% since Apollo · log scale · ${inflationAdjusted ? "2025 $" : "nominal $"} emphasized`}
      focused={focused} dimmed={dimmed}>
      <ResponsiveContainer width="100%" height={460}>
        <ComposedChart data={YEAR_SERIES} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}
          onMouseMove={(s) => onHoverYear(yearFromChartState(s))} onMouseLeave={() => onHoverYear(null)}>
          <CartesianGrid stroke={RS.line} strokeDasharray="2 6" vertical={false} />
          <XAxis type="number" dataKey="year" domain={[1955, 2031]}
            ticks={[1969, 1988, 2005, 2018, 2026]}
            tick={{ fill: RS.faint, fontSize: 9, fontFamily: RS_MONO }}
            stroke={RS.line} tickLine={false} allowDataOverflow />
          <YAxis type="number" scale="log" domain={[900, 60000]}
            ticks={[1000, 10000, 50000]} tickFormatter={(v: number) => `$${v / 1000}k`}
            tick={{ fill: RS.faint, fontSize: 9, fontFamily: RS_MONO }}
            width={42} stroke={RS.line} tickLine={false} />
          <Tooltip content={<CostTip />} cursor={false} />
          {hoveredYear != null && (
            <ReferenceLine x={hoveredYear} stroke={RS.crosshair} strokeDasharray="2 4" strokeOpacity={0.8} />
          )}
          <Line dataKey={mutedKey} connectNulls stroke={RS.faint} strokeWidth={1}
            strokeOpacity={0.5} strokeDasharray="3 4" dot={{ r: 2, fill: RS.faint, strokeWidth: 0 }}
            activeDot={false} isAnimationActive={false} />
          <Line dataKey={emphasizedKey} connectNulls stroke={RS.amber} strokeWidth={1.6}
            strokeOpacity={0.85} dot={renderCostDot as LineProps["dot"]}
            activeDot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ padding: "0 12px 8px", fontFamily: RS_MONO, fontSize: 9, color: RS.faint }}>
        gap between the lines = the inflation illusion. Widest at Saturn V (8.7x), near zero today
      </div>
    </PanelShell>
  );
}
