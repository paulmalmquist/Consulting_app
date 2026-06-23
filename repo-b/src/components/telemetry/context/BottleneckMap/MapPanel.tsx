"use client";

// Panel 1: the Bottleneck Map. Bubbles are milestone events on capability bands; bars are world
// orbital launch attempts per year. Bubble opacity transitions give presenter mode its motion.
import React from "react";
import {
  Bar, CartesianGrid, Cell, ComposedChart, ReferenceLine, ResponsiveContainer, Scatter, Tooltip,
  XAxis, YAxis,
} from "recharts";
import type { ScatterProps, TooltipProps } from "recharts";

import { RS, RS_MONO } from "../../rsTokens";
import styles from "./BottleneckMap.module.css";
import { BANDS, YEAR_SERIES } from "./data";
import PanelShell, { yearFromChartState } from "./PanelShell";
import type { DecoratedEvent, TimeWindow } from "./types";

// TODO(P1 backlog): connecting arc between the Terran 1 and Terran R bubbles (pathfinder-to-scale
// lineage), drawn on selection of either.
// TODO(P1 backlog): bottleneck relay highlighting; selecting an event highlights the event whose
// solved bottleneck matches the selected event's created bottleneck.

interface BubblePointProps {
  cx?: number;
  cy?: number;
  payload?: DecoratedEvent;
}

function MapTip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload.map((p) => p.payload as DecoratedEvent | undefined).find((p) => p?.id != null);
  if (!d) return null;
  return (
    <div style={{ background: RS.panel, border: `1px solid ${d.color}40`, borderRadius: 6,
      padding: "10px 12px", maxWidth: 280, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
      <div style={{ color: d.color, fontFamily: RS_MONO, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
        {d.date} · {d.dimLabel}
      </div>
      <div style={{ color: RS.text, fontWeight: 600, fontSize: 13, marginTop: 4 }}>{d.name}</div>
      <div style={{ color: RS.dim, fontSize: 11, marginTop: 4 }}>Solved: {d.bottleneckSolved}</div>
      <div style={{ color: RS.faint, fontSize: 10, marginTop: 4, fontFamily: RS_MONO, textTransform: "uppercase", letterSpacing: 0.5 }}>{d.outcome}</div>
      <div style={{ color: RS.faint, fontSize: 10, marginTop: 6, fontFamily: RS_MONO }}>Click to pin full record</div>
    </div>
  );
}

export default function MapPanel({
  events, selectedId, presenting, revealedIds, presenterYear, timeWindow, hoveredYear,
  sizeModeLabel, focused, dimmed, onHoverYear, onSelect,
}: {
  events: DecoratedEvent[];
  selectedId: string | null;
  presenting: boolean;
  revealedIds: ReadonlySet<string>;
  presenterYear: number;
  timeWindow: TimeWindow | null;          // null when the full range is active
  hoveredYear: number | null;
  sizeModeLabel: string;
  focused: boolean;
  dimmed: boolean;
  onHoverYear: (year: number | null) => void;
  onSelect: (id: string) => void;
}) {
  const renderBubble = (props: BubblePointProps): React.ReactElement => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload) return <g />;
    const r = Math.max(6, Math.sqrt(payload.sizeValue) * 2.4);
    const color = payload.color;
    const isSelected = selectedId === payload.id;
    const dash =
      payload.outcome === "partial" ? "4 3" :
      payload.outcome === "planned" ? "2 4" : "none";

    let opacity = 1;
    if (presenting) {
      opacity = revealedIds.has(payload.id) ? 1 : 0.07;
    } else if (timeWindow && (payload.year < timeWindow[0] || payload.year > timeWindow[1] + 1)) {
      opacity = 0.12;
    }

    return (
      <g
        style={{ cursor: presenting ? "default" : "pointer", opacity, transition: "opacity 650ms ease" }}
        onClick={() => { if (!presenting) onSelect(payload.id); }}
      >
        {isSelected && presenting && (
          <circle className={styles.pulse} cx={cx} cy={cy} r={r + 5} fill="none" stroke={color} strokeWidth={2} />
        )}
        {isSelected && !presenting && (
          <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={2} />
        )}
        <circle
          cx={cx} cy={cy} r={r}
          fill={color} fillOpacity={isSelected ? 0.45 : 0.22}
          stroke={color} strokeWidth={isSelected ? 2 : 1.5}
          strokeDasharray={dash}
        />
        <circle cx={cx} cy={cy} r={2.5} fill={color} />
      </g>
    );
  };

  return (
    <PanelShell title="Bottleneck Map" accent={RS.blue}
      sub="Each leap solved one bottleneck and exposed the next — now it is decision velocity · bubbles: events · bars: world orbital attempts/yr"
      focused={focused} dimmed={dimmed}>
      <div className="h-[460px] lg:h-[560px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={YEAR_SERIES} margin={{ top: 12, right: 28, bottom: 4, left: 8 }}
            onMouseMove={(s) => onHoverYear(yearFromChartState(s))} onMouseLeave={() => onHoverYear(null)}>
            <CartesianGrid stroke={RS.line} strokeDasharray="2 6" vertical={false} />
            <XAxis type="number" dataKey="year" domain={[1955, 2031]}
              ticks={[1957, 1969, 1981, 1998, 2010, 2015, 2023, 2026, 2030]}
              tick={{ fill: RS.faint, fontSize: 10, fontFamily: RS_MONO }}
              stroke={RS.line} tickLine={false} allowDataOverflow />
            <YAxis yAxisId="band" type="number" domain={[0.4, 5.6]} ticks={[1, 2, 3, 4, 5]}
              tickFormatter={(v: number) => BANDS.find((b) => b.y === v)?.label || ""}
              tick={{ fill: RS.dim, fontSize: 10, fontFamily: RS_MONO }}
              width={210} stroke={RS.line} tickLine={false} />
            <YAxis yAxisId="cadence" orientation="right" type="number" domain={[0, 347]}
              ticks={[0, 165, 330]}
              tick={{ fill: RS.crosshair, fontSize: 9, fontFamily: RS_MONO }}
              width={34} stroke={RS.line} tickLine={false} />
            <Tooltip content={<MapTip />} cursor={false} />
            <Bar yAxisId="cadence" dataKey="attempts" barSize={5} radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {YEAR_SERIES.map((d) => (
                <Cell key={d.year}
                  fill={d.year >= 2021 ? RS.barFillHot : RS.barFill}
                  fillOpacity={presenting && d.year > presenterYear ? 0.08 : 0.5}
                  style={{ transition: "fill-opacity 650ms ease" }} />
              ))}
            </Bar>
            {hoveredYear != null && (
              <ReferenceLine yAxisId="band" x={hoveredYear} stroke={RS.crosshair}
                strokeDasharray="2 4" strokeOpacity={0.8} />
            )}
            <ReferenceLine yAxisId="band" x={2023.22} stroke={RS.violet} strokeOpacity={0.25} strokeDasharray="3 5" />
            <Scatter yAxisId="band" data={events} dataKey="band"
              shape={renderBubble as ScatterProps["shape"]}
              isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 16px 8px",
        fontFamily: RS_MONO, fontSize: 9, color: RS.faint }}>
        <span>border: solid = flown · dashed = partial · dotted = planned · size = {sizeModeLabel.toLowerCase()}</span>
      </div>
    </PanelShell>
  );
}
