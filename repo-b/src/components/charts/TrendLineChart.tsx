"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import {
  CHART_COLORS,
  TOOLTIP_STYLE,
  AXIS_TICK_STYLE,
  GRID_STYLE,
  fmtCompact,
  fmtPct,
} from "./chart-theme";

export interface LineDef {
  key: string;
  label: string;
  color?: string;
  dashed?: boolean;
}

export interface RefLineDef {
  y: number;
  label?: string;
  color?: string;
}

export interface HighlightDef {
  quarter: string;
  value: number;
  label?: string;
  color?: string;
}

interface Props {
  /** Array of objects with a `quarter` key and numeric metric keys. */
  data: Record<string, unknown>[];
  /** Line definitions. */
  lines: LineDef[];
  /** Optional horizontal reference lines (e.g. 95% occupancy target). */
  referenceLines?: RefLineDef[];
  /** Optional highlighted points or annotations. */
  highlights?: HighlightDef[];
  /** Height in pixels. Default 280. */
  height?: number;
  /** "dollar" → fmtCompact, "percent" → fmtPct, "number" → raw. Default "dollar". */
  format?: "dollar" | "percent" | "number";
  /** Show legend. Default true. */
  showLegend?: boolean;
  /** Recharts syncId for crosshair syncing across charts. */
  syncId?: string;
}

function tickFmt(format: Props["format"]) {
  switch (format) {
    case "percent":
      return (v: number) => fmtPct(v, 0);
    case "number":
      return (v: number) => v.toLocaleString();
    default:
      return (v: number) => fmtCompact(v);
  }
}

function tooltipFmt(format: Props["format"]) {
  switch (format) {
    case "percent":
      return (v: number, name: string) => [fmtPct(v), name];
    case "number":
      return (v: number, name: string) => [v.toLocaleString(), name];
    default:
      return (v: number, name: string) => [fmtCompact(v), name];
  }
}

export default function TrendLineChart({
  data,
  lines,
  referenceLines,
  highlights,
  height = 280,
  format = "dollar",
  showLegend = true,
  syncId,
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
        syncId={syncId}
      >
        <CartesianGrid vertical={false} {...GRID_STYLE} />
        <XAxis
          dataKey="quarter"
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={tickFmt(format)}
          width={64}
          domain={format === "percent" ? [0, 1] : ["auto", "auto"]}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={tooltipFmt(format)}
          labelStyle={{ color: "hsl(210, 24%, 94%)", fontWeight: 600 }}
        />
        {showLegend && lines.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 11, color: "hsl(215, 12%, 72%)" }}
          />
        )}
        {referenceLines?.map((rl, i) => (
          <ReferenceLine
            key={i}
            y={rl.y}
            stroke={rl.color ?? CHART_COLORS.warning}
            strokeDasharray="6 4"
            label={
              rl.label
                ? {
                    value: rl.label,
                    position: "right",
                    fill: CHART_COLORS.warning,
                    fontSize: 10,
                  }
                : undefined
            }
          />
        ))}
        {highlights?.map((highlight, index) => (
          <ReferenceDot
            key={`${highlight.quarter}-${index}`}
            x={highlight.quarter}
            y={highlight.value}
            r={4}
            fill={highlight.color ?? CHART_COLORS.warning}
            stroke="white"
            strokeWidth={2}
            label={
              highlight.label
                ? {
                    value: highlight.label,
                    position: "top",
                    fill: highlight.color ?? CHART_COLORS.warning,
                    fontSize: 10,
                  }
                : undefined
            }
          />
        ))}
        {lines.map((l, i) => (
          <Line
            key={l.key}
            dataKey={l.key}
            name={l.label}
            stroke={
              l.color ?? CHART_COLORS.scenario[i % CHART_COLORS.scenario.length]
            }
            strokeWidth={2}
            strokeDasharray={l.dashed ? "6 3" : undefined}
            connectNulls
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
