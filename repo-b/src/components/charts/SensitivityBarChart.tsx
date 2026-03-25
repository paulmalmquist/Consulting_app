"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  CHART_COLORS,
  TOOLTIP_STYLE,
  AXIS_TICK_STYLE,
  GRID_STYLE,
  fmtCompact,
} from "./chart-theme";

export interface SensitivityRow {
  /** Display label, e.g. "+50 bps" or "4.50%" */
  label: string;
  /** Dollar value */
  value: number;
  /** Whether this row is the baseline / current */
  isBaseline?: boolean;
}

interface Props {
  data: SensitivityRow[];
  /** Height in pixels. Default 280. */
  height?: number;
  /** Value prefix for formatting. Default "$". */
  valuePrefix?: string;
}

export default function SensitivityBarChart({
  data,
  height = 280,
  valuePrefix = "$",
}: Props) {
  const baselineValue = data.find((d) => d.isBaseline)?.value;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} {...GRID_STYLE} />
        <XAxis
          type="number"
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => fmtCompact(v, valuePrefix)}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value: number) => [
            fmtCompact(value, valuePrefix),
            "Value",
          ]}
          labelStyle={{ color: "hsl(210, 24%, 94%)", fontWeight: 600 }}
        />
        {baselineValue != null && (
          <ReferenceLine
            x={baselineValue}
            stroke={CHART_COLORS.muted}
            strokeDasharray="4 4"
          />
        )}
        <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={24}>
          {data.map((row, i) => (
            <Cell
              key={i}
              fill={
                row.isBaseline
                  ? CHART_COLORS.revenue
                  : row.value >= (baselineValue ?? 0)
                    ? CHART_COLORS.noi
                    : CHART_COLORS.opex
              }
              opacity={row.isBaseline ? 1 : 0.75}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
