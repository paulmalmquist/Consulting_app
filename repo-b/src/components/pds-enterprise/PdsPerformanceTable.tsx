"use client";
import React from "react";

import Link from "next/link";
import type { PdsV2PerformanceTable } from "@/lib/bos-api";
import {
  formatCurrency,
  formatPercent,
  healthBadgeClasses,
  reasonLabel,
} from "@/components/pds-enterprise/pdsEnterprise";

function lensCells(lens: PdsV2PerformanceTable["lens"], row: PdsV2PerformanceTable["rows"][number]) {
  if (lens === "resource") {
    return [
      formatPercent(row.utilization_pct, 0),
      formatPercent(row.timecard_compliance_pct, 0),
      typeof row.forecast !== "undefined" ? formatCurrency(row.forecast) : "—",
      row.reason_codes.map(reasonLabel).join(" · ") || "Balanced",
    ];
  }
  if (lens === "project") {
    return [
      formatCurrency(row.fee_variance),
      formatCurrency(row.gaap_variance),
      formatCurrency(row.ci_variance),
      row.reason_codes.map(reasonLabel).join(" · ") || "No intervention reason",
    ];
  }
  return [
    formatCurrency(row.fee_actual),
    formatCurrency(row.gaap_actual),
    formatCurrency(row.ci_actual),
    formatCurrency(row.backlog),
    formatCurrency(row.forecast),
    lens === "market"
      ? `${row.red_projects || 0} red / ${row.client_risk_accounts || 0} client risk`
      : `${row.red_projects || 0} red / ${formatCurrency(row.collections_lag)}`,
  ];
}

export function PdsPerformanceTable({ table }: { table: PdsV2PerformanceTable }) {
  const secondaryHeaders =
    table.lens === "resource"
      ? ["Utilization", "Timecards", "Assigned Load", "Flags"]
      : table.lens === "project"
        ? ["Fee Variance", "GAAP Variance", "CI Variance", "Reason Codes"]
        : ["Fee Actual", "GAAP Actual", "CI Actual", "Backlog", "Forecast", "Risk Watch"];

  return (
    <section className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-performance-table">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-bm-muted2">Performance Table</p>
          <h3 className="text-xl font-semibold">{table.lens[0].toUpperCase() + table.lens.slice(1)} Operating View</h3>
        </div>
        <p className="text-sm text-bm-muted2">Plan vs actual, forecast, and management signals for the selected lens.</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
            <tr className="border-b border-bm-border/50">
              <th className="pb-3 pr-4 font-medium">{table.lens === "market" ? "Market" : table.lens === "account" ? "Account" : table.lens === "project" ? "Project" : "Resource"}</th>
              {secondaryHeaders.map((header) => (
                <th key={header} className="pb-3 pr-4 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => {
              const cells = lensCells(table.lens, row);
              return (
                <tr key={row.entity_id} className="border-b border-bm-border/40 last:border-b-0">
                  <td className="py-4 pr-4 align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.href ? (
                        <Link href={row.href} className="font-medium text-bm-text hover:underline">
                          {row.entity_label}
                        </Link>
                      ) : (
                        <span className="font-medium text-bm-text">{row.entity_label}</span>
                      )}
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${healthBadgeClasses(row.health_status)}`}>
                        {row.health_status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-bm-muted2">{row.owner_label || "No owner assigned"}</p>
                  </td>
                  {cells.map((value, index) => (
                    <td key={`${row.entity_id}-${index}`} className="py-4 pr-4 align-top">
                      {value}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
