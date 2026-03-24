"use client";

import React from "react";
import type { PdsV2MetricCard } from "@/lib/bos-api";
import { formatCurrency, formatNumber, formatPercent, formatPercentRaw, toNumber } from "@/components/pds-enterprise/pdsEnterprise";

function renderMetric(metric: PdsV2MetricCard): string {
  if (metric.unit === "usd") return formatCurrency(metric.value);
  if (metric.unit === "percent_raw") return formatPercentRaw(metric.value, 1);
  return typeof metric.value === "number" ? formatNumber(metric.value) : String(metric.value);
}

function renderComparison(metric: PdsV2MetricCard): string | null {
  if (!metric.comparison_label || metric.comparison_value === undefined || metric.comparison_value === null) {
    return null;
  }
  const value =
    metric.unit === "usd"
      ? formatCurrency(metric.comparison_value)
      : metric.unit === "percent_raw"
        ? formatPercentRaw(metric.comparison_value, 1)
        : String(metric.comparison_value);
  return `${metric.comparison_label} ${value}`;
}

function computeVariancePct(metric: PdsV2MetricCard): number | null {
  if (metric.comparison_value === undefined || metric.comparison_value === null) return null;
  const plan = toNumber(metric.comparison_value);
  if (plan === 0) return null;
  return (toNumber(metric.value) - plan) / Math.abs(plan);
}

function trendArrow(vPct: number): { arrow: string; color: string } {
  if (vPct < -0.05) return { arrow: "\u25BC", color: "text-red-400" };
  if (vPct < -0.01) return { arrow: "\u25BC", color: "text-amber-400" };
  if (vPct >= 0.01) return { arrow: "\u25B2", color: "text-emerald-400" };
  return { arrow: "\u2014", color: "text-slate-500" };
}

function toneBg(tone?: string): string {
  if (tone === "danger") return "bg-red-500/[0.05]";
  if (tone === "warn") return "bg-amber-500/[0.04]";
  if (tone === "positive") return "bg-emerald-500/[0.04]";
  return "";
}

const PRIORITY_KEYS = new Set(["fee_revenue", "gaap_revenue", "fee_revenue_vs_plan", "gaap_revenue_vs_plan"]);

export function PdsWarRoomKpiStrip({ metrics }: { metrics: PdsV2MetricCard[] }) {
  // Prioritize Fee Revenue and GAAP metrics first
  const sorted = [...metrics].sort((a, b) => {
    const priorities = ["fee_revenue", "gaap_revenue", "fee_revenue_vs_plan", "gaap_revenue_vs_plan"];
    const ai = priorities.indexOf(a.key);
    const bi = priorities.indexOf(b.key);
    return (ai >= 0 ? ai : 100) - (bi >= 0 ? bi : 100);
  });

  return (
    <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7" data-testid="pds-warroom-kpi-strip">
      {sorted.map((metric) => {
        const vPct = computeVariancePct(metric);
        const isPriority = PRIORITY_KEYS.has(metric.key);
        const bg = toneBg(metric.tone);
        const trend = vPct !== null ? trendArrow(vPct) : null;

        return (
          <article
            key={metric.key}
            className={`rounded-lg p-3.5 transition ${bg || "bg-slate-800/[0.25]"} ${isPriority ? "ring-1 ring-blue-500/15" : ""}`}
          >
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400 font-medium leading-none">
              {metric.label}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className={`font-semibold tabular-nums ${isPriority ? "text-2xl text-bm-text" : "text-xl text-bm-text"}`}>
                {renderMetric(metric)}
              </p>
              {trend && (
                <span className={`text-sm font-medium ${trend.color}`}>
                  {trend.arrow}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[11px]">
              <span className="text-slate-500">{renderComparison(metric) || "\u2014"}</span>
              {vPct !== null && (
                <span className={`font-medium tabular-nums ${trend!.color}`}>
                  {vPct >= 0 ? "+" : ""}{formatPercent(vPct, 1)}
                </span>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
