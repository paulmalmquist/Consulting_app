"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

type Props = {
  green: number;
  amber: number;
  red: number;
  size?: number;
};

const COLORS = { green: "#22c55e", amber: "#eab308", red: "#ef4444" };

export function AccountHealthDonut({ green, amber, red, size = 120 }: Props) {
  const data = [
    { name: "Green", value: green, color: COLORS.green },
    { name: "Amber", value: amber, color: COLORS.amber },
    { name: "Red", value: red, color: COLORS.red },
  ].filter((d) => d.value > 0);

  const total = green + amber + red;

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width={size} height={size}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.3}
            outerRadius={size * 0.42}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [
              `${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
              name,
            ]}
            contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "6px" }}
            labelStyle={{ color: "#9ca3af" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex gap-3 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" /> {green}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-yellow-500" /> {amber}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500" /> {red}
        </span>
      </div>
    </div>
  );
}
