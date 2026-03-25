"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { PdsV2PerformanceRow } from "@/lib/bos-api";
import { toNumber, formatPercent } from "@/components/pds-enterprise/pdsEnterprise";

function variancePct(actual: string | number | undefined, plan: string | number | undefined): number {
  const a = toNumber(actual);
  const p = toNumber(plan);
  if (p === 0) return 0;
  return (a - p) / Math.abs(p);
}

function barColor(vPct: number): string {
  if (vPct < -0.05) return "#ef4444";
  if (vPct < -0.01) return "#f97316";
  if (vPct >= 0.01) return "#22c55e";
  return "#6b7280";
}

export function PdsVarianceChart({ rows }: { rows: PdsV2PerformanceRow[] }) {
  const data = rows
    .map((r) => {
      const vPct = variancePct(r.fee_actual, r.fee_plan);
      return {
        name: r.entity_label,
        variance: Math.round(vPct * 1000) / 10,
        rawVariance: vPct,
        entity_id: r.entity_id,
        href: r.href,
      };
    })
    .sort((a, b) => a.variance - b.variance);

  if (!data.length) {
    return (
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center text-sm text-bm-muted2" data-testid="pds-variance-chart">
        No market performance data available.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-variance-chart">
      <ResponsiveContainer width="100%" height={Math.max(280, data.length * 38)}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(213 18% 22%)" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => `${v}%`}
            stroke="#6b7280"
            fontSize={11}
            tick={{ fill: "#9ca3af" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            stroke="#6b7280"
            fontSize={11}
            tick={{ fill: "#9ca3af" }}
          />
          <Tooltip
            formatter={(value: number) => [`${value}%`, "Variance vs Plan"]}
            contentStyle={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#e2e8f0",
            }}
            labelStyle={{ color: "#94a3b8" }}
          />
          <ReferenceLine x={0} stroke="#475569" strokeWidth={1} />
          <Bar dataKey="variance" radius={[0, 3, 3, 0]} maxBarSize={24}>
            {data.map((entry) => (
              <Cell key={entry.entity_id} fill={barColor(entry.rawVariance)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
