"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  CHART_COLORS,
  TOOLTIP_STYLE,
  AXIS_TICK_STYLE,
  GRID_STYLE,
  fmtCompact,
} from "./chart-theme";

export interface BarDef {
  key: string;
  label: string;
  color?: string;
  stackId?: string;
}

interface Props {
  /** Array of objects with a `quarter` key and numeric metric keys. */
  data: Record<string, unknown>[];
  /** Bar definitions — which keys to render and how. */
  bars: BarDef[];
  /** Height in pixels. Default 300. */
  height?: number;
  /** Value prefix for axis/tooltip formatting. Default "$". */
  valuePrefix?: string;
  /** Show legend. Default true. */
  showLegend?: boolean;
}

const DEFAULT_COLORS: Record<string, string> = {
  revenue: CHART_COLORS.revenue,
  opex: CHART_COLORS.opex,
  noi: CHART_COLORS.noi,
};

export default function QuarterlyBarChart({
  data,
  bars,
  height = 300,
  valuePrefix = "$",
  showLegend = true,
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
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
          tickFormatter={(v: number) => fmtCompact(v, valuePrefix)}
          width={64}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value: number, name: string) => [
            fmtCompact(value, valuePrefix),
            name,
          ]}
          labelStyle={{ color: "hsl(210, 24%, 94%)", fontWeight: 600 }}
        />
        {showLegend && (
          <Legend
            wrapperStyle={{ fontSize: 11, color: "hsl(215, 12%, 72%)" }}
          />
        )}
        {bars.map((b) => (
          <Bar
            key={b.key}
            dataKey={b.key}
            name={b.label}
            fill={b.color ?? DEFAULT_COLORS[b.key] ?? CHART_COLORS.revenue}
            stackId={b.stackId}
            radius={[2, 2, 0, 0]}
            maxBarSize={40}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
