"use client";
import React from "react";

import type { PdsV2ResourceHealthItem, PdsV2TimecardHealthItem } from "@/lib/bos-api";
import { formatPercent, formatCurrency, reasonLabel } from "@/components/pds-enterprise/pdsEnterprise";

export function PdsResourceHealthPanel({
  resources,
  timecards,
}: {
  resources: PdsV2ResourceHealthItem[];
  timecards: PdsV2TimecardHealthItem[];
}) {
  return (
    <section className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-resource-health-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-bm-muted2">Resources & Timecards</p>
          <h3 className="text-xl font-semibold">Staffing Pressure and Submission Discipline</h3>
        </div>
        <p className="text-sm text-bm-muted2">Balance the bench before forecast slippage hardens into delivery misses.</p>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="space-y-3">
          {resources.map((item) => (
            <article key={item.resource_id} className={`rounded-2xl border p-4 ${
              item.delinquent_timecards > 0
                ? "border-pds-signalRed/50 bg-pds-signalRed/5"
                : Number(item.utilization_pct) < 0.5
                  ? "border-pds-signalYellow/40 bg-pds-signalYellow/5"
                  : "border-bm-border/60 bg-[#101922]"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">{item.resource_name}</h4>
                  <p className="text-sm text-bm-muted2">{[item.title, item.market_name].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right text-xs text-bm-muted2">
                  <p>Utilization {formatPercent(item.utilization_pct, 0)}</p>
                  <p>Billable Mix {formatPercent(item.billable_mix_pct, 0)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-bm-muted2">
                {item.reason_codes.length ? item.reason_codes.map((reason) => (
                  <span key={`${item.resource_id}-${reason}`} className="rounded-full bg-bm-surface/40 px-2 py-1">
                    {reasonLabel(reason)}
                  </span>
                )) : <span className="rounded-full bg-bm-surface/40 px-2 py-1">Balanced</span>}
              </div>
            </article>
          ))}
        </div>
        <div className="space-y-3">
          {timecards.map((item, index) => (
            <article key={`${item.resource_id || item.resource_name}-${index}`} className={`rounded-2xl border p-4 ${
              item.delinquent_count > 0
                ? "border-pds-signalRed/50 bg-pds-signalRed/5"
                : "border-bm-border/60 bg-[#101922]"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">{item.resource_name}</h4>
                  <p className="text-sm text-bm-muted2">{item.delinquent_count} delinquent submissions</p>
                </div>
                <div className="text-right text-xs text-bm-muted2">
                  <p>Submitted {formatPercent(item.submitted_pct, 0)}</p>
                  <p>Overdue {formatCurrency(item.overdue_hours)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-bm-muted2">
                {item.reason_codes.length ? item.reason_codes.map((reason) => (
                  <span key={`${item.resource_name}-${reason}`} className="rounded-full bg-bm-surface/40 px-2 py-1">
                    {reasonLabel(reason)}
                  </span>
                )) : <span className="rounded-full bg-bm-surface/40 px-2 py-1">Clean</span>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
