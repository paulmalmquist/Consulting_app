"use client";
import React from "react";

import type { PdsV2ForecastPoint } from "@/lib/bos-api";
import { formatCurrency, formatDate, formatPercent } from "@/components/pds-enterprise/pdsEnterprise";

export function PdsForecastPanel({ points }: { points: PdsV2ForecastPoint[] }) {
  return (
    <section className="rounded-lg border border-slate-700/20 p-4" data-testid="pds-forecast-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Forecast</p>
          <h3 className="text-base font-semibold text-bm-text">Forecast Movement & Confidence</h3>
        </div>
        <p className="text-xs text-slate-500">What moved, why, and where overrides entered the plan.</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
            <tr className="border-b border-slate-700/30">
              <th className="pb-3 pr-4 font-medium">Month</th>
              <th className="pb-3 pr-4 font-medium">Entity</th>
              <th className="pb-3 pr-4 font-medium">Current</th>
              <th className="pb-3 pr-4 font-medium">Prior</th>
              <th className="pb-3 pr-4 font-medium">Delta</th>
              <th className="pb-3 pr-4 font-medium">Override</th>
              <th className="pb-3 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={`${point.entity_id}-${point.forecast_month}`} className="border-b border-slate-700/20 last:border-b-0">
                <td className="py-4 pr-4">{formatDate(point.forecast_month)}</td>
                <td className="py-4 pr-4">
                  <div className="font-medium">{point.entity_label}</div>
                  <div className="text-xs text-bm-muted2">{point.entity_type}</div>
                </td>
                <td className="py-4 pr-4">{formatCurrency(point.current_value)}</td>
                <td className="py-4 pr-4">{formatCurrency(point.prior_value)}</td>
                <td className="py-4 pr-4">{formatCurrency(point.delta_value)}</td>
                <td className="py-4 pr-4">
                  {point.override_value ? (
                    <>
                      <div>{formatCurrency(point.override_value)}</div>
                      <div className="text-xs text-bm-muted2">{point.override_reason || "Manual override"}</div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-4">{formatPercent(point.confidence_score, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
