"use client";

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Line,
  ComposedChart,
} from "recharts";
import type { PdsV2PerformanceRow } from "@/lib/bos-api";
import { toNumber } from "@/components/pds-enterprise/pdsEnterprise";
import { TOOLTIP_STYLE, AXIS_TICK_STYLE, GRID_STYLE, fmtCompact } from "@/components/charts/chart-theme";

type DataPoint = {
  name: string;
  actual: number;
  plan: number;
  variancePct: number;
  entityId: string;
};

function barColor(variancePct: number): string {
  if (variancePct < -0.05) return "#ef4444";
  if (variancePct < -0.01) return "#f97316";
  if (variancePct >= 0.01) return "#22c55e";
  return "#6b7280";
}

export function PdsRevenueVsPlanChart({ rows }: { rows: PdsV2PerformanceRow[] }) {
  const data = useMemo<DataPoint[]>(() => {
    return rows
      .map((r) => {
        const actual = toNumber(r.fee_actual);
        const plan = toNumber(r.fee_plan);
        const variancePct = plan > 0 ? (actual - plan) / plan : 0;
        return {
          name: r.entity_label,
          actual,
          plan,
          variancePct,
          entityId: r.entity_id,
        };
      })
      .sort((a, b) => a.variancePct - b.variancePct);
  }, [rows]);

  if (!data.length) {
    return (
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center text-sm text-bm-muted2" data-testid="pds-revenue-vs-plan">
        No revenue data to chart.
      </section>
    );
  }

  const useHorizontal = data.length > 8;

  if (useHorizontal) {
    return (
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-revenue-vs-plan">
        <ResponsiveContainer width="100%" height={Math.max(300, data.length * 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
            <CartesianGrid {...GRID_STYLE} horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => fmtCompact(v)} />
            <YAxis type="category" dataKey="name" width={120} tick={AXIS_TICK_STYLE} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: number, name: string) => [fmtCompact(value), name === "actual" ? "Actual" : "Plan"]}
            />
            <Bar dataKey="actual" name="Actual" radius={[0, 3, 3, 0]} maxBarSize={22}>
              {data.map((d) => (
                <Cell key={d.entityId} fill={barColor(d.variancePct)} />
              ))}
            </Bar>
            <Bar dataKey="plan" name="Plan" fill="#475569" radius={[0, 3, 3, 0]} maxBarSize={22} fillOpacity={0.35} />
          </BarChart>
        </ResponsiveContainer>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-revenue-vs-plan">
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ left: 4, right: 20, top: 10, bottom: 10 }}>
          <CartesianGrid {...GRID_STYLE} vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtCompact(v)} width={64} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number, name: string) => [fmtCompact(value), name === "actual" ? "Actual" : "Plan"]}
            labelStyle={{ color: "hsl(210, 24%, 94%)", fontWeight: 600 }}
          />
          <Bar dataKey="actual" name="Actual" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((d) => (
              <Cell key={d.entityId} fill={barColor(d.variancePct)} />
            ))}
          </Bar>
          <Line
            dataKey="plan"
            name="Plan"
            stroke="#94a3b8"
            strokeDasharray="6 3"
            strokeWidth={2}
            dot={{ fill: "#94a3b8", r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}
