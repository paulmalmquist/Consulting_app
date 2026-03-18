"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DevSpendTrend } from "@/lib/bos-api";

function formatMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function formatDollar(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

export function DevSpendChart({ data }: { data: DevSpendTrend[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-bm-border/40 bg-bm-surface/[0.03] px-8 py-12 text-center">
        <p className="text-sm text-bm-muted2">No draw schedule data available.</p>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    month: formatMonth(d.month),
    drawn: parseFloat(d.total_drawn),
  }));

  return (
    <div className="rounded-xl border border-bm-border/40 bg-bm-surface/[0.03] p-5">
      <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
        Monthly Draw Activity
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
          <defs>
            <linearGradient id="drawGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="month"
            tick={{ fill: "#a1a1aa", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v) => formatDollar(v)}
            tick={{ fill: "#a1a1aa", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(val: number) => [formatDollar(val), "Drawn"]}
          />
          <Area
            type="monotone"
            dataKey="drawn"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#drawGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
