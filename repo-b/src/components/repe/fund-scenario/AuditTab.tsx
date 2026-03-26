"use client";

import { ClipboardList } from "lucide-react";
import type { FundBaseScenario } from "./types";

export function AuditTab({ result }: { result: FundBaseScenario }) {
  return (
    <div className="space-y-5">
      {/* Scenario identity */}
      <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted mb-3">
          Scenario Identity
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="text-xs">
            <div className="text-[10px] uppercase text-bm-muted">Fund ID</div>
            <div className="font-mono text-bm-text truncate">{result.fund_id}</div>
          </div>
          <div className="text-xs">
            <div className="text-[10px] uppercase text-bm-muted">Quarter</div>
            <div className="text-bm-text">{result.quarter}</div>
          </div>
          <div className="text-xs">
            <div className="text-[10px] uppercase text-bm-muted">Scenario ID</div>
            <div className="font-mono text-bm-text truncate">{result.scenario_id ?? "Base (no scenario)"}</div>
          </div>
          <div className="text-xs">
            <div className="text-[10px] uppercase text-bm-muted">Liquidation Mode</div>
            <div className="text-bm-text capitalize">{result.liquidation_mode.replace(/_/g, " ")}</div>
          </div>
          <div className="text-xs">
            <div className="text-[10px] uppercase text-bm-muted">As-of Date</div>
            <div className="text-bm-text">{result.as_of_date}</div>
          </div>
          <div className="text-xs">
            <div className="text-[10px] uppercase text-bm-muted">Computed At</div>
            <div className="text-bm-text">{result.summary.computed_at ?? "—"}</div>
          </div>
          <div className="text-xs">
            <div className="text-[10px] uppercase text-bm-muted">Waterfall Def ID</div>
            <div className="font-mono text-bm-text truncate">{result.waterfall.definition_id ?? "None"}</div>
          </div>
          <div className="text-xs">
            <div className="text-[10px] uppercase text-bm-muted">Waterfall Style</div>
            <div className="text-bm-text capitalize">{result.waterfall.waterfall_type}</div>
          </div>
        </div>
      </div>

      {/* Assumptions */}
      <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted mb-3">
          Computation Assumptions
        </h3>
        <div className="space-y-2 text-xs">
          <div>
            <div className="text-[10px] uppercase text-bm-muted">Ownership Model</div>
            <div className="text-bm-muted2">{result.assumptions.ownership_model}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-bm-muted">Realized Allocation Method</div>
            <div className="text-bm-muted2">{result.assumptions.realized_allocation_method}</div>
          </div>
          {result.assumptions.notes.length > 0 && (
            <div>
              <div className="text-[10px] uppercase text-bm-muted mb-1">Notes</div>
              <ul className="list-disc list-inside text-bm-muted2 space-y-0.5">
                {result.assumptions.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Value reconciliation */}
      <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted mb-3">
          Value Reconciliation
        </h3>
        <table className="w-full text-xs">
          <tbody>
            {[
              { label: "Total Committed", value: result.summary.total_committed },
              { label: "Paid-In Capital", value: result.summary.paid_in_capital },
              { label: "Distributed Capital", value: result.summary.distributed_capital },
              { label: "Attributable NAV", value: result.summary.attributable_nav },
              { label: "Realized Proceeds", value: result.summary.realized_proceeds },
              { label: "Management Fees", value: result.summary.management_fees },
              { label: "Fund Expenses", value: result.summary.fund_expenses },
              { label: "Carry Shadow", value: result.summary.carry_shadow },
              { label: "Total Value", value: result.summary.total_value },
              { label: "LP Liquidation Allocation", value: result.summary.lp_liquidation_allocation },
              { label: "GP Liquidation Allocation", value: result.summary.gp_liquidation_allocation },
              { label: "Promote Earned", value: result.summary.promote_earned },
              { label: "Pref Shortfall", value: result.summary.preferred_return_shortfall },
              { label: "Pref Excess", value: result.summary.preferred_return_excess },
            ].map((row) => (
              <tr key={row.label} className="border-t border-bm-border/10">
                <td className="py-1.5 text-bm-muted2 w-1/2">{row.label}</td>
                <td className="py-1.5 text-right font-mono text-bm-text">
                  {typeof row.value === "number" ? row.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
