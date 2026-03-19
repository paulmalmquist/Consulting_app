"use client";
import React from "react";

import type { PdsV2MetricCard } from "@/lib/bos-api";
import { formatCurrency, formatNumber, toNumber, formatPercent, toneClasses, accentStripeClass } from "@/components/pds-enterprise/pdsEnterprise";

function renderMetric(metric: PdsV2MetricCard): string {
  if (metric.unit === "usd") return formatCurrency(metric.value);
  return typeof metric.value === "number" ? formatNumber(metric.value) : String(metric.value);
}

function renderComparison(metric: PdsV2MetricCard): string | null {
  if (!metric.comparison_label || metric.comparison_value === undefined || metric.comparison_value === null) {
    return null;
  }
  const value = metric.unit === "usd" ? formatCurrency(metric.comparison_value) : String(metric.comparison_value);
  return `${metric.comparison_label} ${value}`;
}

function renderDelta(metric: PdsV2MetricCard): string | null {
  if (metric.delta_value === undefined || metric.delta_value === null) return null;
  return metric.unit === "usd" ? formatCurrency(metric.delta_value) : String(metric.delta_value);
}

function computeVariancePct(metric: PdsV2MetricCard): number | null {
  if (metric.comparison_value === undefined || metric.comparison_value === null) return null;
  const plan = toNumber(metric.comparison_value);
  if (plan === 0) return null;
  return (toNumber(metric.value) - plan) / Math.abs(plan);
}

export function PdsMetricStrip({ metrics }: { metrics: PdsV2MetricCard[] }) {
  return (
    <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7" data-testid="pds-metric-strip">
      {metrics.map((metric) => {
        const delta = renderDelta(metric);
        const vPct = computeVariancePct(metric);
        return (
          <article key={metric.key} className={`relative overflow-hidden rounded-xl border p-3 ${toneClasses(metric.tone)}`}>
            <div className={`absolute left-0 top-0 h-full w-1 ${accentStripeClass(metric.tone)}`} />
            <div className="pl-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2 font-medium">{metric.label}</p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="text-xl font-semibold text-bm-text tabular-nums">{renderMetric(metric)}</p>
                {vPct !== null ? (
                  <span className={`text-xs font-medium tabular-nums ${vPct < -0.03 ? "text-pds-signalRed" : vPct < 0 ? "text-pds-signalOrange" : "text-pds-signalGreen"}`}>
                    {vPct >= 0 ? "+" : ""}{formatPercent(vPct, 1)}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-bm-muted2">
                <span>{renderComparison(metric) || "Management baseline"}</span>
                {delta ? (
                  <span className={`font-medium ${toNumber(metric.delta_value) >= 0 ? "text-pds-signalGreen" : "text-pds-signalRed"}`}>
                    {toNumber(metric.delta_value) >= 0 ? "\u25B2" : "\u25BC"} {delta}
                  </span>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
