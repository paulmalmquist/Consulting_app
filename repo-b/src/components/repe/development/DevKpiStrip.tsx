"use client";

import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import type { DevPortfolioKpis } from "@/lib/bos-api";

function fmtMoney(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n) || n === 0) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "0%";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtPctRaw(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "0%";
  return `${n.toFixed(1)}%`;
}

export function DevKpiStrip({ kpis }: { kpis: DevPortfolioKpis }) {
  const items: KpiDef[] = [
    { label: "Total Dev Budget", value: fmtMoney(kpis.total_development_budget) },
    { label: "Committed", value: fmtMoney(kpis.total_committed) },
    { label: "Spent", value: fmtMoney(kpis.total_spent) },
    {
      label: "Contingency",
      value: fmtPctRaw(kpis.contingency_remaining_pct),
      delta: { value: fmtMoney(kpis.contingency_remaining_abs), tone: "neutral" },
    },
    {
      label: "On Track",
      value: String(kpis.projects_on_track),
      delta: kpis.projects_at_risk > 0
        ? { value: `${kpis.projects_at_risk} at risk`, tone: "negative" }
        : undefined,
    },
    {
      label: "Avg Yield on Cost",
      value: fmtPct(kpis.avg_yield_on_cost),
      delta: { value: `IRR ${fmtPct(kpis.avg_projected_irr)}`, tone: "neutral" },
    },
  ];

  return <KpiStrip kpis={items} variant="band" />;
}
