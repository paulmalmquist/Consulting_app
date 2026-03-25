"use client";

import React, { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { PdsV2PerformanceRow, PdsV2Lens } from "@/lib/bos-api";
import { toNumber, formatCurrency } from "@/components/pds-enterprise/pdsEnterprise";
import { TOOLTIP_STYLE, CHART_COLORS } from "@/components/charts/chart-theme";

const PALETTE = [...CHART_COLORS.scenario, "#ec4899", "#14b8a6", "#f97316"];

type Slice = { name: string; value: number };

function buildSlices(rows: PdsV2PerformanceRow[], maxSlices: number): Slice[] {
  const sorted = rows
    .map((r) => ({ name: r.entity_label, value: toNumber(r.fee_actual) }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  if (sorted.length <= maxSlices) return sorted;

  const top = sorted.slice(0, maxSlices - 1);
  const other = sorted.slice(maxSlices - 1).reduce((s, r) => s + r.value, 0);
  return [...top, { name: "Other", value: other }];
}

export function PdsRevenueMixChart({
  rows,
  lens = "market",
  maxSlices = 6,
}: {
  rows: PdsV2PerformanceRow[];
  lens?: PdsV2Lens;
  maxSlices?: number;
}) {
  const slices = useMemo(() => buildSlices(rows, maxSlices), [rows, maxSlices]);

  if (slices.length === 0) {
    return (
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center text-sm text-bm-muted2" data-testid="pds-revenue-mix">
        No revenue mix data available.
      </section>
    );
  }

  const total = slices.reduce((s, r) => s + r.value, 0);

  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-revenue-mix">
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bm-muted2">Revenue Mix</p>
        <h3 className="text-base font-semibold text-bm-text">By {lens === "project" ? "Project" : lens === "account" ? "Account" : lens === "resource" ? "Resource" : lens === "business_line" ? "Business Line" : "Market"}</h3>
      </div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={slices}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={95}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }: { name: string; percent: number }) =>
                `${name} ${(percent * 100).toFixed(0)}%`
              }
              labelLine={{ stroke: "hsl(215, 12%, 72%)", strokeWidth: 1 }}
            >
              {slices.map((_, idx) => (
                <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: number) => [formatCurrency(value), "Revenue"]}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold tabular-nums text-bm-text">{formatCurrency(total)}</p>
            <p className="text-[10px] text-bm-muted2">Total</p>
          </div>
        </div>
      </div>
    </section>
  );
}
