"use client";
import React from "react";

import type { PdsV2MetricCard } from "@/lib/bos-api";
import { formatCurrency, formatNumber, toneClasses, accentStripeClass } from "@/components/pds-enterprise/pdsEnterprise";

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

export function PdsMetricStrip({ metrics }: { metrics: PdsV2MetricCard[] }) {
  return (
    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7" data-testid="pds-metric-strip">
      {metrics.map((metric) => (
        <article key={metric.key} className={`relative overflow-hidden rounded-2xl border p-4 ${toneClasses(metric.tone)}`}>
          <div className={`absolute left-0 top-0 h-full w-1 ${accentStripeClass(metric.tone)}`} />
          <div className="pl-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/80 font-medium">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{renderMetric(metric)}</p>
            <p className="mt-2 text-xs text-white/65">
              {renderComparison(metric) || "Management baseline"}
            </p>
          </div>
        </article>
      ))}
    </section>
  );
}
