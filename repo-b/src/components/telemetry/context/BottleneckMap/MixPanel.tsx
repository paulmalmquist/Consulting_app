"use client";

// Panel 3: commercial vs government share of orbital attempts, with the time brush that windows
// the KPI strip and dims out-of-window bubbles on the map.
import React from "react";
import {
  Area, Brush, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";

import { RS, RS_MONO } from "../../rsTokens";
import { YEAR_SERIES } from "./data";
import PanelShell, { yearFromChartState } from "./PanelShell";
import type { YearPoint } from "./types";

function MixTip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload as YearPoint | undefined;
  if (!d || d.commercialPct == null || d.governmentPct == null) return null;
  return (
    <div style={{ background: RS.panel, border: `1px solid ${RS.line}`, borderRadius: 6,
      padding: "8px 10px", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
      <div style={{ fontFamily: RS_MONO, fontSize: 10, color: RS.faint }}>{d.year} · {d.attempts} attempts</div>
      <div style={{ fontSize: 11, color: RS.green, fontFamily: RS_MONO, marginTop: 2 }}>{Math.round(d.commercialPct)}% commercial</div>
      <div style={{ fontSize: 11, color: RS.blue, fontFamily: RS_MONO }}>{Math.round(d.governmentPct)}% government</div>
    </div>
  );
}

export default function MixPanel({ hoveredYear, focused, dimmed, onHoverYear, onBrush }: {
  hoveredYear: number | null;
  focused: boolean;
  dimmed: boolean;
  onHoverYear: (year: number | null) => void;
  onBrush: (range: { startIndex?: number; endIndex?: number }) => void;
}) {
  return (
    <PanelShell title="Who flies: commercial vs government" accent={RS.green}
      sub="share of orbital attempts · drag below to brush"
      focused={focused} dimmed={dimmed}>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={YEAR_SERIES} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          onMouseMove={(s) => onHoverYear(yearFromChartState(s))} onMouseLeave={() => onHoverYear(null)}>
          <CartesianGrid stroke={RS.line} strokeDasharray="2 6" vertical={false} />
          <XAxis type="number" dataKey="year" domain={[1955, 2031]}
            ticks={[1957, 1981, 2005, 2025]}
            tick={{ fill: RS.faint, fontSize: 9, fontFamily: RS_MONO }}
            stroke={RS.line} tickLine={false} allowDataOverflow />
          <YAxis type="number" domain={[0, 100]} ticks={[0, 50, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: RS.faint, fontSize: 9, fontFamily: RS_MONO }}
            width={42} stroke={RS.line} tickLine={false} />
          <Tooltip content={<MixTip />} cursor={false} />
          {hoveredYear != null && (
            <ReferenceLine x={hoveredYear} stroke={RS.crosshair} strokeDasharray="2 4" strokeOpacity={0.8} />
          )}
          <Area dataKey="commercialPct" stackId="mix" stroke={RS.green} strokeWidth={1}
            fill={RS.green} fillOpacity={0.25} connectNulls isAnimationActive={false} />
          <Area dataKey="governmentPct" stackId="mix" stroke={RS.blue} strokeWidth={1}
            fill={RS.blue} fillOpacity={0.12} connectNulls isAnimationActive={false} />
          <Brush dataKey="year" height={18} travellerWidth={8}
            stroke={RS.crosshair} fill={RS.bg} onChange={onBrush}
            tickFormatter={() => ""} />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ padding: "0 12px 8px", fontFamily: RS_MONO, fontSize: 9, color: RS.faint }}>
        green = commercial share. 2022-2025 reported (~55% to ~70%); earlier values are coarse estimates
      </div>
    </PanelShell>
  );
}
