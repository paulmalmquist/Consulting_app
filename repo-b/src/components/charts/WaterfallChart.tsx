"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  CHART_COLORS,
  TOOLTIP_STYLE,
  AXIS_TICK_STYLE,
  GRID_STYLE,
  fmtCompact,
} from "./chart-theme";

export interface WaterfallItem {
  /** Display name, e.g. "Revenue", "Vacancy", "OpEx", "NOI" */
  name: string;
  /** Dollar value (positive = add, negative = subtract). */
  value: number;
  /** Mark the final/total bar (renders from 0). */
  isTotal?: boolean;
}

interface InternalBar {
  name: string;
  value: number;
  invisible: number;
  isTotal: boolean;
  isPositive: boolean;
}

function buildWaterfallData(items: WaterfallItem[]): InternalBar[] {
  const result: InternalBar[] = [];
  let running = 0;

  for (const item of items) {
    if (item.isTotal) {
      result.push({
        name: item.name,
        value: Math.abs(item.value),
        invisible: item.value < 0 ? item.value : 0,
        isTotal: true,
        isPositive: item.value >= 0,
      });
    } else {
      const start = running;
      running += item.value;
      result.push({
        name: item.name,
        value: Math.abs(item.value),
        invisible: item.value >= 0 ? start : running,
        isTotal: false,
        isPositive: item.value >= 0,
      });
    }
  }
  return result;
}

interface Props {
  items: WaterfallItem[];
  /** Height in pixels. Default 300. */
  height?: number;
  /** Value prefix. Default "$". */
  valuePrefix?: string;
}

export default function WaterfallChart({
  items,
  height = 300,
  valuePrefix = "$",
}: Props) {
  const data = buildWaterfallData(items);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
      >
        <CartesianGrid vertical={false} {...GRID_STYLE} />
        <XAxis
          dataKey="name"
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
          formatter={(value: number, name: string) => {
            if (name === "invisible") return [null, null];
            return [fmtCompact(value, valuePrefix), "Amount"];
          }}
          labelStyle={{ color: "hsl(210, 24%, 94%)", fontWeight: 600 }}
        />
        {/* Invisible base — stacked underneath visible bar */}
        <Bar
          dataKey="invisible"
          stackId="waterfall"
          fill="transparent"
          radius={0}
        />
        {/* Visible bar */}
        <Bar
          dataKey="value"
          stackId="waterfall"
          radius={[2, 2, 0, 0]}
          maxBarSize={48}
        >
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={
                d.isTotal
                  ? CHART_COLORS.waterfall.total
                  : d.isPositive
                    ? CHART_COLORS.waterfall.positive
                    : CHART_COLORS.waterfall.negative
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
