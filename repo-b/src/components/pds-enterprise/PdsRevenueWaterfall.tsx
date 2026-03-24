"use client";

import React, { useMemo } from "react";
import type { PdsV2PerformanceRow } from "@/lib/bos-api";
import { toNumber } from "@/components/pds-enterprise/pdsEnterprise";
import WaterfallChart, { type WaterfallItem } from "@/components/charts/WaterfallChart";

function buildItems(rows: PdsV2PerformanceRow[]): WaterfallItem[] {
  const totalPlan = rows.reduce((s, r) => s + toNumber(r.fee_plan), 0);
  const totalActual = rows.reduce((s, r) => s + toNumber(r.fee_actual), 0);

  const variances = rows
    .map((r) => ({
      label: r.entity_label,
      variance: toNumber(r.fee_actual) - toNumber(r.fee_plan),
    }))
    .filter((r) => Math.abs(r.variance) > 0)
    .sort((a, b) => b.variance - a.variance);

  const positive = variances.filter((r) => r.variance > 0);
  const negative = variances.filter((r) => r.variance < 0);

  const items: WaterfallItem[] = [{ name: "Plan", value: totalPlan, isTotal: true }];

  // Top positive contributors
  for (const p of positive.slice(0, 4)) {
    items.push({ name: p.label, value: p.variance });
  }
  if (positive.length > 4) {
    items.push({
      name: `+${positive.length - 4} Others`,
      value: positive.slice(4).reduce((s, p) => s + p.variance, 0),
    });
  }

  // Top negative contributors
  for (const n of negative.slice(0, 4)) {
    items.push({ name: n.label, value: n.variance });
  }
  if (negative.length > 4) {
    items.push({
      name: `+${Math.abs(negative.length - 4)} Others`,
      value: negative.slice(4).reduce((s, n) => s + n.variance, 0),
    });
  }

  items.push({ name: "Actual", value: totalActual, isTotal: true });
  return items;
}

export function PdsRevenueWaterfall({ rows }: { rows: PdsV2PerformanceRow[] }) {
  const items = useMemo(() => buildItems(rows), [rows]);

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center text-sm text-bm-muted2" data-testid="pds-revenue-waterfall">
        No variance data available.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-revenue-waterfall">
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bm-muted2">Variance Bridge</p>
        <h3 className="text-base font-semibold text-bm-text">Plan to Actual</h3>
      </div>
      <WaterfallChart items={items} height={280} />
    </section>
  );
}
