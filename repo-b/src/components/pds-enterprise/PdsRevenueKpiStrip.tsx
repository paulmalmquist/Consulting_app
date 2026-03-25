"use client";

import React, { useMemo } from "react";
import type { PdsV2PerformanceRow, PdsV2MetricCard } from "@/lib/bos-api";
import {
  toNumber,
  safeDivide,
  formatCurrency,
  formatPercent,
  accentStripeClass,
} from "@/components/pds-enterprise/pdsEnterprise";

type DerivedKpi = {
  label: string;
  value: string;
  tone: "danger" | "warn" | "positive" | "neutral";
  sub?: string;
};

function varianceIndicator(vPct: number): { text: string; className: string } {
  const arrow = vPct >= 0 ? "\u25B2" : "\u25BC";
  const label = `${arrow} ${vPct >= 0 ? "+" : ""}${formatPercent(vPct, 1)}`;
  if (vPct < -0.05) return { text: label, className: "text-pds-signalRed" };
  if (vPct < -0.01) return { text: label, className: "text-pds-signalOrange" };
  if (vPct >= 0.01) return { text: label, className: "text-pds-signalGreen" };
  return { text: label, className: "text-bm-muted2" };
}

function toneBgClass(tone: DerivedKpi["tone"]): string {
  if (tone === "danger") return "bg-pds-signalRed/[0.06]";
  if (tone === "warn") return "bg-pds-signalOrange/[0.06]";
  if (tone === "positive") return "bg-pds-signalGreen/[0.06]";
  return "bg-pds-card/30";
}

function toneBorderClass(tone: DerivedKpi["tone"]): string {
  if (tone === "danger") return "border-pds-signalRed/20";
  if (tone === "warn") return "border-pds-signalOrange/20";
  if (tone === "positive") return "border-pds-signalGreen/20";
  return "border-pds-divider";
}

export function PdsRevenueKpiStrip({
  rows,
  metrics,
}: {
  rows: PdsV2PerformanceRow[];
  metrics: PdsV2MetricCard[];
}) {
  const kpis = useMemo<DerivedKpi[]>(() => {
    const totalActual = rows.reduce((s, r) => s + toNumber(r.fee_actual), 0);
    const totalPlan = rows.reduce((s, r) => s + toNumber(r.fee_plan), 0);
    const totalVariance = totalActual - totalPlan;
    const variancePct = safeDivide(totalVariance, totalPlan, 0);

    // Revenue at risk = sum of negative fee_variance across entities
    const revenueAtRisk = rows.reduce((s, r) => {
      const v = toNumber(r.fee_variance);
      return v < 0 ? s + Math.abs(v) : s;
    }, 0);

    // Try to get the metric strip value for fee_revenue if available (more authoritative)
    const feeMetric = metrics.find((m) => m.key === "fee_revenue");
    const displayRevenue = feeMetric ? formatCurrency(feeMetric.value) : formatCurrency(totalActual);

    const varianceTone: DerivedKpi["tone"] =
      variancePct < -0.05 ? "danger" : variancePct < -0.01 ? "warn" : variancePct >= 0.01 ? "positive" : "neutral";

    return [
      {
        label: "Total Fee Revenue",
        value: displayRevenue,
        tone: "neutral" as const,
        sub: "Year to date",
      },
      {
        label: "vs Plan",
        value: `${variancePct >= 0 ? "+" : ""}${formatPercent(variancePct, 1)}`,
        tone: varianceTone,
        sub: variancePct >= 0 ? "On or above plan" : "Below plan",
      },
      {
        label: "Variance",
        value: `${totalVariance >= 0 ? "+" : ""}${formatCurrency(totalVariance)}`,
        tone: varianceTone,
        sub: `Plan: ${formatCurrency(totalPlan)}`,
      },
      {
        label: "Revenue at Risk",
        value: formatCurrency(revenueAtRisk),
        tone: revenueAtRisk > 0 ? "danger" : "neutral",
        sub: revenueAtRisk > 0 ? `${rows.filter((r) => toNumber(r.fee_variance) < 0).length} entities below plan` : "No shortfalls",
      },
    ];
  }, [rows, metrics]);

  return (
    <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4" data-testid="pds-revenue-kpi-strip">
      {kpis.map((kpi, i) => {
        const vi = i === 1 ? varianceIndicator(
          safeDivide(
            rows.reduce((s, r) => s + toNumber(r.fee_actual), 0) - rows.reduce((s, r) => s + toNumber(r.fee_plan), 0),
            rows.reduce((s, r) => s + toNumber(r.fee_plan), 0),
            0,
          ),
        ) : null;
        return (
          <article
            key={kpi.label}
            className={`relative overflow-hidden rounded-xl border p-4 text-bm-text ${toneBgClass(kpi.tone)} ${toneBorderClass(kpi.tone)}`}
          >
            <div className={`absolute left-0 top-0 h-full w-1 ${accentStripeClass(kpi.tone)}`} />
            <div className="pl-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2 font-medium">{kpi.label}</p>
              <p className={`mt-1 font-semibold tabular-nums ${i === 0 ? "text-2xl" : "text-xl"}`}>{kpi.value}</p>
              <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                <span className="text-bm-muted2">{kpi.sub}</span>
                {vi ? <span className={`font-medium tabular-nums ${vi.className}`}>{vi.text}</span> : null}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
