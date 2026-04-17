"use client";

import type { OperatorCashAtRisk } from "@/lib/bos-api";
import { fmtMoney } from "@/lib/format-utils";

export function CashAtRiskStrip({ data }: { data: OperatorCashAtRisk }) {
  return (
    <section
      data-testid="cash-at-risk-strip"
      className="rounded-3xl border border-bm-border/70 bg-bm-surface/25 p-5"
    >
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">
            Closeout + cash at risk
          </p>
          <h3 className="mt-1 text-lg font-semibold text-bm-text">
            Work complete, cash not yet released
          </h3>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Total stuck</p>
          <p className="text-2xl font-semibold text-red-200">
            {fmtMoney(data.total_amount_usd)}
          </p>
          <p className="text-xs text-bm-muted2">{data.project_count} projects</p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
              <th className="px-2 py-2 font-medium">Project</th>
              <th className="px-2 py-2 font-medium">At risk</th>
              <th className="px-2 py-2 font-medium">Missing</th>
              <th className="px-2 py-2 font-medium">Owner</th>
              <th className="px-2 py-2 font-medium">Delayed</th>
              <th className="px-2 py-2 font-medium">Retention</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/30">
            {data.rows.map((row) => (
              <tr key={row.project_id}>
                <td className="px-2 py-2 text-bm-text">{row.project_id}</td>
                <td className="px-2 py-2 text-red-200">{fmtMoney(row.amount_at_risk)}</td>
                <td className="px-2 py-2 text-bm-muted2">{row.missing_artifact}</td>
                <td className="px-2 py-2 text-bm-muted2">{row.responsible_party}</td>
                <td className="px-2 py-2 text-bm-muted2">{row.days_delayed}d</td>
                <td className="px-2 py-2 text-bm-muted2">
                  {row.retention_at_risk ? fmtMoney(row.retention_at_risk) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default CashAtRiskStrip;
