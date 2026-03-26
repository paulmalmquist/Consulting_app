"use client";

import { Landmark } from "lucide-react";
import { fmtMoney, fmtPct } from "@/lib/format-utils";
import type { FundBaseScenario } from "./types";

export function DebtRefiTab({ result }: { result: FundBaseScenario }) {
  const assets = result.assets.filter((a) => a.debt_balance > 0 && a.status_category === "active");
  const totalDebt = assets.reduce((sum, a) => sum + a.debt_balance, 0);
  const totalGrossValue = assets.reduce((sum, a) => sum + a.gross_asset_value, 0);
  const portfolioLtv = totalGrossValue > 0 ? totalDebt / totalGrossValue : 0;

  if (assets.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-bm-border/30 bg-bm-surface/5">
        <div className="text-center">
          <Landmark size={24} className="mx-auto mb-2 text-bm-muted" />
          <p className="text-sm text-bm-muted2">No levered assets in this scenario.</p>
          <p className="text-xs text-bm-muted mt-1">
            Debt surveillance will appear here when assets have loan balances.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <div className="text-[10px] uppercase text-bm-muted">Levered Assets</div>
          <div className="mt-1 text-xl font-semibold text-bm-text">{assets.length}</div>
        </div>
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <div className="text-[10px] uppercase text-bm-muted">Total Debt Outstanding</div>
          <div className="mt-1 text-xl font-semibold text-bm-text">{fmtMoney(totalDebt)}</div>
        </div>
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <div className="text-[10px] uppercase text-bm-muted">Portfolio LTV</div>
          <div className="mt-1 text-xl font-semibold text-bm-text">{fmtPct(portfolioLtv)}</div>
        </div>
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <div className="text-[10px] uppercase text-bm-muted">Total Gross Value</div>
          <div className="mt-1 text-xl font-semibold text-bm-text">{fmtMoney(totalGrossValue)}</div>
        </div>
      </div>

      {/* Per-asset debt table */}
      <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
        <div className="px-4 py-3 border-b border-bm-border/30">
          <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
            Asset Debt Summary
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-bm-muted border-b border-bm-border/20">
                <th className="text-left font-medium py-2 pl-4">Asset</th>
                <th className="text-left font-medium py-2">Type</th>
                <th className="text-right font-medium py-2">Gross Value</th>
                <th className="text-right font-medium py-2">Debt Balance</th>
                <th className="text-right font-medium py-2">LTV</th>
                <th className="text-right font-medium py-2">Net Equity</th>
                <th className="text-right font-medium py-2 pr-4">Debt Payoff</th>
              </tr>
            </thead>
            <tbody>
              {assets
                .sort((a, b) => b.debt_balance - a.debt_balance)
                .map((a) => {
                  const ltv = a.gross_asset_value > 0 ? a.debt_balance / a.gross_asset_value : 0;
                  return (
                    <tr key={a.asset_id} className="border-t border-bm-border/10 hover:bg-bm-surface/20">
                      <td className="py-2 pl-4">
                        <div className="font-medium text-bm-text">{a.asset_name}</div>
                        <div className="text-[10px] text-bm-muted">{a.investment_name}</div>
                      </td>
                      <td className="text-bm-muted2 capitalize">{a.property_type ?? "—"}</td>
                      <td className="text-right text-bm-muted2">{fmtMoney(a.gross_asset_value)}</td>
                      <td className="text-right font-medium text-bm-text">{fmtMoney(a.debt_balance)}</td>
                      <td className={`text-right ${ltv > 0.7 ? "text-red-400" : ltv > 0.6 ? "text-amber-400" : "text-bm-muted2"}`}>
                        {fmtPct(ltv)}
                      </td>
                      <td className="text-right text-bm-muted2">{fmtMoney(a.net_asset_value)}</td>
                      <td className="text-right text-bm-muted2 pr-4">{fmtMoney(a.debt_payoff)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
