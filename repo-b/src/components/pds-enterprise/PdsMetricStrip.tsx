"use client";
import React from "react";

import type { PdsV2MetricCard } from "@/lib/bos-api";
import { formatCurrency, formatNumber, toneClasses } from "@/components/pds-enterprise/pdsEnterprise";

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
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7" data-testid="pds-metric-strip">
      {metrics.map((metric) => (
        <article key={metric.key} className={`rounded-3xl border p-4 ${toneClasses(metric.tone)}`}>
          <p className="text-[11px] uppercase tracking-[0.16em] text-current/75">{metric.label}</p>
          <p className="mt-3 text-2xl font-semibold">{renderMetric(metric)}</p>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-current/80">
            <span>{renderComparison(metric) || "Management baseline"}</span>
            {renderDelta(metric) ? <span>{renderDelta(metric)}</span> : null}
          </div>
        </article>
      ))}
    </section>
  );
}
