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

function computeVariancePct(metric: PdsV2MetricCard): number | null {
  if (metric.comparison_value === undefined || metric.comparison_value === null) return null;
  const plan = toNumber(metric.comparison_value);
  if (plan === 0) return null;
  return (toNumber(metric.value) - plan) / Math.abs(plan);
}

function varianceIndicator(vPct: number): { text: string; className: string } {
  const arrow = vPct >= 0 ? "\u25B2" : "\u25BC";
  const label = `${arrow} ${vPct >= 0 ? "+" : ""}${formatPercent(vPct, 1)}`;
  if (vPct < -0.05) return { text: label, className: "text-pds-signalRed" };
  if (vPct < -0.01) return { text: label, className: "text-pds-signalOrange" };
  if (vPct >= 0.01) return { text: label, className: "text-pds-signalGreen" };
  return { text: label, className: "text-bm-muted2" };
}

export function PdsMetricStrip({ metrics }: { metrics: PdsV2MetricCard[] }) {
  return (
    <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7" data-testid="pds-metric-strip">
      {metrics.map((metric) => {
        const vPct = computeVariancePct(metric);
        return (
          <article key={metric.key} className={`relative overflow-hidden rounded-xl border p-3 ${toneClasses(metric.tone)}`}>
            <div className={`absolute left-0 top-0 h-full w-1 ${accentStripeClass(metric.tone)}`} />
            <div className="pl-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2 font-medium">{metric.label}</p>
              <p className="mt-1 text-xl font-semibold text-bm-text tabular-nums">{renderMetric(metric)}</p>
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                <span className="text-bm-muted2">{renderComparison(metric) || "—"}</span>
                {vPct !== null ? (
                  <span className={`font-medium tabular-nums ${varianceIndicator(vPct).className}`}>
                    {varianceIndicator(vPct).text}
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
