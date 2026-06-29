"use client";

// Panel 1: the Bottleneck Map. Bubbles are milestone events on capability bands; bars are world
// orbital launch attempts per year. Bubble opacity transitions give presenter mode its motion.
import React, { useState } from "react";
import {
  Area, Bar, CartesianGrid, Cell, ComposedChart, ReferenceLine, ResponsiveContainer, Scatter,
  XAxis, YAxis,
} from "recharts";
import type { ScatterProps } from "recharts";

import { RS, RS_MONO } from "../../rsTokens";
import styles from "./BottleneckMap.module.css";
import { BANDS, YEAR_SERIES, eventYearStats } from "./data";
import PanelShell from "./PanelShell";
import type { DecoratedEvent, TimeWindow } from "./types";

// TODO(P1 backlog): connecting arc between the Terran 1 and Terran R bubbles (pathfinder-to-scale
// lineage), drawn on selection of either.

interface BubblePointProps {
  cx?: number;
  cy?: number;
  payload?: DecoratedEvent;
}

// The thesis, made explicit: each era solved a hardware constraint and created a new data burden the
// modern platform has to carry. Qualitative framing only — no fabricated telemetry-volume numbers.
const DATA_BURDEN_RAIL: { era: string; burden: string; color: string }[] = [
  { era: "Orbit proof", burden: "tracking & mission logs", color: RS.blue },
  { era: "Operations", burden: "vehicle telemetry", color: RS.blue },
  { era: "Commercial scale", burden: "cadence, provider & ops data", color: RS.green },
  { era: "Reuse", burden: "post-flight inspection & component history", color: RS.amber },
  { era: "Production", burden: "sensor streams, NCRs, model evidence, lineage, operator decisions", color: RS.violet },
];

// Tooltip body for a hovered/selected milestone. Pure + exported so a unit test can assert the launch-
// attempt and commercial/government rows render (and fail closed) without driving SVG hover. The
// year-context row reads only from eventYearStats() — never fabricated; out-of-range years show
// "Year context: not available".
export function MapTipBody({ event }: { event: DecoratedEvent }) {
  const stats = eventYearStats(event);
  return (
    <div style={{ background: RS.panel, border: `1px solid ${event.color}55`, borderRadius: 7,
      padding: "10px 12px", width: 250, boxShadow: "0 10px 28px rgba(0,0,0,0.55)" }}>
      <div style={{ color: event.color, fontFamily: RS_MONO, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>
        {event.date} · {event.dimLabel}
      </div>
      <div style={{ color: RS.text, fontWeight: 600, fontSize: 13, marginTop: 4 }}>{event.name}</div>
      <div style={{ color: RS.dim, fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>Solved: {event.bottleneckSolved}</div>
      {stats ? (
        <div style={{ marginTop: 7, fontFamily: RS_MONO, fontSize: 10.5, color: RS.dim, lineHeight: 1.5 }}>
          <div><span style={{ color: RS.faint }}>World attempts {stats.year}: </span><span style={{ color: RS.text }}>{stats.attempts}</span></div>
          <div>
            <span style={{ color: RS.green }}>Commercial {Math.round(stats.commercialPct)}%</span>
            <span style={{ color: RS.faint }}>  ·  </span>
            <span style={{ color: RS.blue }}>Government {Math.round(stats.governmentPct)}%</span>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 7, fontFamily: RS_MONO, fontSize: 10, color: RS.faint }}>
          Year context: not available
        </div>
      )}
      <div style={{ color: RS.faint, fontSize: 9.5, marginTop: 7, fontFamily: RS_MONO, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {event.outcome} · click to pin
      </div>
    </div>
  );
}

interface HoverState { event: DecoratedEvent; cx: number; cy: number; }

export default function MapPanel({
  events, selectedId, presenting, revealedIds, presenterYear, timeWindow,
  sizeModeLabel, focused, dimmed, onSelect,
}: {
  events: DecoratedEvent[];
  selectedId: string | null;
  presenting: boolean;
  revealedIds: ReadonlySet<string>;
  presenterYear: number;
  timeWindow: TimeWindow | null;          // null when the full range is active
  sizeModeLabel: string;
  focused: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
}) {
  // Bubble-driven hover: the milestone under the cursor owns the tooltip + the x-axis mark (replacing
  // recharts' shared cross-series tooltip, whose active index could land the mark on a stale year).
  const [hover, setHover] = useState<HoverState | null>(null);

  const renderBubble = (props: BubblePointProps): React.ReactElement => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload) return <g />;
    const r = Math.max(6, Math.sqrt(payload.sizeValue) * 2.4);
    const color = payload.color;
    const isSelected = selectedId === payload.id;
    const isHovered = hover?.event.id === payload.id;
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
        onMouseEnter={() => { if (!presenting) setHover({ event: payload, cx, cy }); }}
        onMouseLeave={() => { if (!presenting) setHover((h) => (h?.event.id === payload.id ? null : h)); }}
      >
        {/* selected = persistent ring; hovered = temporary brighter ring (visually distinct) */}
        {isSelected && presenting && (
          <circle className={styles.pulse} cx={cx} cy={cy} r={r + 5} fill="none" stroke={color} strokeWidth={2} />
        )}
        {isSelected && !presenting && (
          <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke={color} strokeOpacity={0.4} strokeWidth={2} />
        )}
        {isHovered && !isSelected && (
          <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke={color} strokeOpacity={0.7} strokeWidth={1.5} />
        )}
        <circle
          cx={cx} cy={cy} r={r}
          fill={color} fillOpacity={isSelected ? 0.45 : isHovered ? 0.34 : 0.22}
          stroke={color} strokeWidth={isSelected || isHovered ? 2 : 1.5}
          strokeDasharray={dash}
        />
        <circle cx={cx} cy={cy} r={2.5} fill={color} />
      </g>
    );
  };

  // The active milestone for the x-axis mark: hovered (temporary) or, if none, the pinned selection.
  // Uses the event's own (fractional) year so the mark sits directly under its bubble.
  const activeEvent = hover?.event ?? events.find((e) => e.id === selectedId) ?? null;
  const markYear = activeEvent?.year ?? null;

  // Place the tooltip above the bubble, flipping below when near the top edge so it never clips.
  const tipBelow = hover != null && hover.cy < 150;

  return (
    <PanelShell title="Bottleneck Map: Hardware Limits → Data Limits" accent={RS.blue}
      sub="Each era solved one constraint and created a larger burden of telemetry, testing, manufacturing evidence, and operational interpretation · bubbles: milestones · bars: world orbital attempts/yr · green wave: commercial share of attempts (context)"
      focused={focused} dimmed={dimmed}>
      <div className="h-[460px] lg:h-[560px]" style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={YEAR_SERIES} margin={{ top: 12, right: 28, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={RS.line} strokeDasharray="2 6" vertical={false} />
            <XAxis type="number" dataKey="year" domain={[1955, 2031]}
              ticks={[1957, 1969, 1981, 1998, 2010, 2015, 2023, 2026, 2030]}
              tick={{ fill: RS.faint, fontSize: 10, fontFamily: RS_MONO }}
              stroke={RS.line} tickLine={false} allowDataOverflow />
            <YAxis yAxisId="band" type="number" domain={[0.4, 5.6]} ticks={[1, 2, 3, 4, 5]}
              tickFormatter={(v: number) => BANDS.find((b) => b.y === v)?.label || ""}
              tick={{ fill: RS.text, fontSize: 12.5, fontFamily: RS_MONO }}
              width={210} stroke={RS.line} tickLine={false} />
            <YAxis yAxisId="cadence" orientation="right" type="number" domain={[0, 347]}
              ticks={[0, 165, 330]}
              tick={{ fill: RS.crosshair, fontSize: 9, fontFamily: RS_MONO }}
              width={34} stroke={RS.line} tickLine={false} />
            {/* Commercial-share underlay axis: a TRUE 0-100% scale (0% bottom, 100% top). */}
            <YAxis yAxisId="share" hide type="number" domain={[0, 100]} />
            {/* No shared recharts <Tooltip>: it computed an active index across the 70-row YEAR_SERIES
                while the hovered bubble lives in the 16-row Scatter, dropping a stray "active dot" on a
                stale year. Hover is now owned by the bubbles (below) — one accurate mark, one tooltip. */}
            <Area yAxisId="share" dataKey="commercialPct" stroke={RS.green} strokeWidth={1}
              strokeOpacity={0.32} fill={RS.green} fillOpacity={0.06} connectNulls
              isAnimationActive={false} activeDot={false} />
            {[0, 50, 100].map((pct) => (
              <ReferenceLine key={`share-${pct}`} yAxisId="share" y={pct} stroke={RS.green}
                strokeOpacity={pct === 0 ? 0.1 : 0.16} strokeDasharray="2 7"
                label={{ value: `${pct}%`, position: "insideLeft", fill: RS.green, fontSize: 9,
                  fontFamily: RS_MONO, opacity: 0.5 }} />
            ))}
            <Bar yAxisId="cadence" dataKey="attempts" barSize={5} radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {YEAR_SERIES.map((d) => (
                <Cell key={d.year}
                  fill={d.year >= 2021 ? RS.barFillHot : RS.barFill}
                  fillOpacity={presenting && d.year > presenterYear ? 0.08 : 0.5}
                  style={{ transition: "fill-opacity 650ms ease" }} />
              ))}
            </Bar>
            {/* x-axis mark: snaps to the hovered (or, idle, the selected) milestone's year — so the mark
                always corresponds to the bubble in focus, never a stale year. */}
            {markYear != null && (
              <ReferenceLine yAxisId="band" x={markYear} stroke={RS.crosshair}
                strokeDasharray="2 4" strokeOpacity={0.85} />
            )}
            <ReferenceLine yAxisId="band" x={2023.22} stroke={RS.violet} strokeOpacity={0.25} strokeDasharray="3 5" />
            <Scatter yAxisId="band" data={events} dataKey="band"
              shape={renderBubble as ScatterProps["shape"]}
              isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        {/* Custom hover tooltip, anchored to the hovered bubble's pixel position (so content + position
            match exactly). Pointer-events off so it never steals the hover. */}
        {hover && !presenting && (
          <div style={{ position: "absolute", left: hover.cx, top: hover.cy, zIndex: 5, pointerEvents: "none",
            transform: tipBelow ? "translate(-50%, 16px)" : "translate(-50%, calc(-100% - 16px))" }}>
            <MapTipBody event={hover.event} />
          </div>
        )}
      </div>
      {/* Data-burden rail: makes the hardware→data thesis explicit. */}
      <div style={{ padding: "2px 16px 6px" }}>
        <div style={{ fontFamily: RS_MONO, fontSize: 8.5, letterSpacing: 0.8, color: RS.faint,
          textTransform: "uppercase", marginBottom: 6 }}>
          Bottleneck solved → new data burden created
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {DATA_BURDEN_RAIL.map((s, i) => (
            <div key={s.era} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ border: `1px solid ${RS.line}`, borderLeft: `2px solid ${s.color}`,
                borderRadius: 5, padding: "4px 8px", background: `${s.color}0c` }}>
                <div style={{ fontFamily: RS_MONO, fontSize: 9, color: s.color, letterSpacing: 0.3 }}>{s.era}</div>
                <div style={{ fontFamily: RS_MONO, fontSize: 8.5, color: RS.dim, marginTop: 1 }}>{s.burden}</div>
              </div>
              {i < DATA_BURDEN_RAIL.length - 1 && <span style={{ color: RS.faint, fontSize: 10 }}>→</span>}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 16px 8px",
        fontFamily: RS_MONO, fontSize: 9, color: RS.faint }}>
        <span style={{ color: RS.green }}>green wave = commercial share of attempts · true 0–100% axis (observed ≈0–70%) · contextual underlay</span>
        <span>border: solid = flown · dashed = partial · dotted = planned · size = {sizeModeLabel.toLowerCase()}</span>
      </div>
    </PanelShell>
  );
}
