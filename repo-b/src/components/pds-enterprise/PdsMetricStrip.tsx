"use client";
import React from "react";

import type { PdsV2MetricCard } from "@/lib/bos-api";
import { formatCurrency, formatNumber, toNumber, formatPercent, formatPercentRaw, accentStripeClass } from "@/components/pds-enterprise/pdsEnterprise";

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

function varianceIndicator(vPct: number): { text: string; className: string } {
  const arrow = vPct >= 0 ? "\u25B2" : "\u25BC";
  const label = `${arrow} ${vPct >= 0 ? "+" : ""}${formatPercent(vPct, 1)}`;
  if (vPct < -0.05) return { text: label, className: "text-pds-signalRed" };
  if (vPct < -0.01) return { text: label, className: "text-pds-signalOrange" };
  if (vPct >= 0.01) return { text: label, className: "text-pds-signalGreen" };
  return { text: label, className: "text-bm-muted2" };
}

function toneBgClass(tone?: string): string {
  if (tone === "danger") return "bg-pds-signalRed/[0.06]";
  if (tone === "warn") return "bg-pds-signalOrange/[0.06]";
  if (tone === "positive") return "bg-pds-signalGreen/[0.06]";
  return "bg-pds-card/30";
}

function toneBorderClass(tone?: string): string {
  if (tone === "danger") return "border-pds-signalRed/20";
  if (tone === "warn") return "border-pds-signalOrange/20";
  if (tone === "positive") return "border-pds-signalGreen/20";
  return "border-pds-divider";
}

const PRIORITY_KEYS = new Set(["fee_revenue", "gaap_revenue"]);

export function PdsMetricStrip({ metrics }: { metrics: PdsV2MetricCard[] }) {
  return (
    <section className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="pds-metric-strip">
      {metrics.map((metric) => {
        const vPct = computeVariancePct(metric);
        const isPriority = PRIORITY_KEYS.has(metric.key);
        return (
          <article
            key={metric.key}
            className={`relative overflow-hidden rounded-xl border p-4 text-bm-text ${toneBgClass(metric.tone)} ${toneBorderClass(metric.tone)}`}
          >
            <div className={`absolute left-0 top-0 h-full w-1 ${accentStripeClass(metric.tone)}`} />
            <div className="pl-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2 font-medium">{metric.label}</p>
              <p className={`mt-1 font-semibold tabular-nums ${isPriority ? "text-2xl" : "text-xl"}`}>{renderMetric(metric)}</p>
              <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                <span className="text-bm-muted2">{renderComparison(metric) || "\u2014"}</span>
                {vPct !== null ? (
                  <span className={`font-medium tabular-nums ${varianceIndicator(vPct).className}`}>
                    {varianceIndicator(vPct).text}
                  </span>
                ) : null}
              </div>
              {/* TODO: Add sparkline when trend_values added to PdsV2MetricCard */}
            </div>
          </article>
        );
      })}
    </section>
  );
}
