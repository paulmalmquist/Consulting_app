"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from "recharts";

type DataPoint = {
  x: number;
  y: number;
  z?: number;
  label: string;
};

type Props = {
  data: DataPoint[];
  xLabel: string;
  yLabel: string;
  xMidpoint?: number;
  yMidpoint?: number;
  quadrantLabels?: [string, string, string, string]; // [topLeft, topRight, bottomLeft, bottomRight]
};

export function QuadrantScatter({
  data,
  xLabel,
  yLabel,
  xMidpoint,
  yMidpoint,
  quadrantLabels = ["Improve Priority", "Keep Up", "Low Priority", "Possible Overkill"],
}: Props) {
  const xMid = xMidpoint ?? (data.length > 0 ? data.reduce((s, d) => s + d.x, 0) / data.length : 50);
  const yMid = yMidpoint ?? (data.length > 0 ? data.reduce((s, d) => s + d.y, 0) / data.length : 50);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
        >
          <Label value={xLabel} position="bottom" offset={10} style={{ fill: "#9ca3af", fontSize: 12 }} />
        </XAxis>
        <YAxis
          type="number"
          dataKey="y"
          name={yLabel}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
        >
          <Label value={yLabel} angle={-90} position="left" offset={10} style={{ fill: "#9ca3af", fontSize: 12 }} />
        </YAxis>
        <ReferenceLine x={xMid} stroke="#4b5563" strokeDasharray="4 4" />
        <ReferenceLine y={yMid} stroke="#4b5563" strokeDasharray="4 4" />
        <Tooltip
          content={({ payload }) => {
            if (!payload?.[0]) return null;
            const d = payload[0].payload as DataPoint;
            return (
              <div className="rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-200 shadow-lg">
                <div className="font-medium">{d.label}</div>
                <div>{xLabel}: {d.x.toFixed(1)}</div>
                <div>{yLabel}: {d.y.toFixed(1)}</div>
                {d.z != null && <div>Size: {d.z.toFixed(1)}</div>}
              </div>
            );
          }}
        />
        <Scatter
          data={data}
          fill="#3b82f6"
          fillOpacity={0.7}
          shape={(props: any) => {
            const { cx, cy, payload } = props;
            const r = payload.z ? Math.max(6, Math.min(20, payload.z / 5)) : 8;
            return <circle cx={cx} cy={cy} r={r} fill="#3b82f6" fillOpacity={0.7} stroke="#60a5fa" strokeWidth={1} />;
          }}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
