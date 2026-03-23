"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";
import { CHART_COLORS } from "./chart-theme";

interface Props {
  /** Array of numeric values to plot. */
  values: number[];
  /** Stroke color. Default accent blue. */
  color?: string;
  /** Width in pixels. Default 80. */
  width?: number;
  /** Height in pixels. Default 28. */
  height?: number;
}

export default function SparkLine({
  values,
  color = CHART_COLORS.revenue,
  width = 80,
  height = 28,
}: Props) {
  if (!values.length) return null;

  const data = values.map((v, i) => ({ i, v }));

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
