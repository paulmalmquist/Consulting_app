"use client";

import React from "react";
import type { MonteCarloWaterfallResponse } from "@/lib/bos-api";

import { fmtMoney } from '@/lib/format-utils';
function fmtMetric(value: number | string | null | undefined, kind: "money" | "pct" | "multiple") {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "—";
  if (kind === "money") return fmtMoney(numeric);
  if (kind === "multiple") return `${numeric.toFixed(2)}x`;
  return `${(numeric * 100).toFixed(2)}%`;
}

export function MonteCarloWaterfallResults({ result }: { result: MonteCarloWaterfallResponse }) {
  const scenarios = [
    { key: "p10", label: "P10", data: result.p10 },
    { key: "p50", label: "P50", data: result.p50 },
    { key: "p90", label: "P90", data: result.p90 },
  ] as const;

  return (
    <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/25 p-4">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Percentile Waterfalls</p>
        <h4 className="text-base font-semibold text-bm-text">LP and carry outcomes at Monte Carlo percentiles</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
              <th className="px-3 py-2 font-medium">Scenario</th>
              <th className="px-3 py-2 font-medium text-right">NAV</th>
              <th className="px-3 py-2 font-medium text-right">LP Return</th>
              <th className="px-3 py-2 font-medium text-right">GP Carry</th>
              <th className="px-3 py-2 font-medium text-right">Net TVPI</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((item) => (
              <tr key={item.key} className="border-b border-bm-border/20 last:border-b-0">
                <td className="px-3 py-2 font-medium text-bm-text">{item.label}</td>
                <td className="px-3 py-2 text-right text-bm-text">{fmtMetric(item.data.summary.nav, "money")}</td>
                <td className="px-3 py-2 text-right text-bm-text">{fmtMetric(item.data.summary.lp_total, "money")}</td>
                <td className="px-3 py-2 text-right text-bm-text">{fmtMetric(item.data.summary.gp_carry, "money")}</td>
                <td className="px-3 py-2 text-right text-bm-text">{fmtMetric(item.data.summary.net_tvpi, "multiple")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
