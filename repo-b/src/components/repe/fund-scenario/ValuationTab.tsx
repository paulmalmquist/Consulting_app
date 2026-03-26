"use client";

import { TrendingUp } from "lucide-react";
import { fmtMoney, fmtPct } from "@/lib/format-utils";
import type { FundBaseScenario } from "./types";

const METHOD_LABELS: Record<string, string> = {
  cap_rate: "Cap Rate",
  dcf: "DCF",
  blended: "Blended",
  market: "Market Comp",
  loan_mark: "Loan Mark",
};

export function ValuationTab({ result }: { result: FundBaseScenario }) {
  const activeAssets = result.assets.filter((a) => a.status_category === "active");

  if (activeAssets.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-bm-border/30 bg-bm-surface/5">
        <div className="text-center">
          <TrendingUp size={24} className="mx-auto mb-2 text-bm-muted" />
          <p className="text-sm text-bm-muted2">No active assets to value.</p>
        </div>
      </div>
    );
  }

  // Group by valuation method
  const byMethod = new Map<string, typeof activeAssets>();
  for (const asset of activeAssets) {
    const method = asset.valuation_method ?? "unknown";
    const list = byMethod.get(method) ?? [];
    list.push(asset);
    byMethod.set(method, list);
  }

  const totalGross = activeAssets.reduce((sum, a) => sum + a.gross_asset_value, 0);
  const totalNav = activeAssets.reduce((sum, a) => sum + a.attributable_nav, 0);

  return (
    <div className="space-y-5">
      {/* Valuation method mix */}
      <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted mb-3">
          Valuation Method Mix
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...byMethod.entries()].map(([method, assets]) => {
            const methodNav = assets.reduce((sum, a) => sum + a.attributable_nav, 0);
            return (
              <div key={method} className="text-xs">
                <div className="text-[10px] uppercase text-bm-muted">
                  {METHOD_LABELS[method] ?? method}
                </div>
                <div className="font-medium text-bm-text">
                  {assets.length} asset{assets.length !== 1 ? "s" : ""}
                </div>
                <div className="text-bm-muted2">
                  {fmtMoney(methodNav)} ({totalNav > 0 ? fmtPct(methodNav / totalNav) : "—"} of NAV)
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-asset valuation detail */}
      <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
        <div className="px-4 py-3 border-b border-bm-border/30">
          <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
            Asset Valuation Detail
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-bm-muted border-b border-bm-border/20">
                <th className="text-left font-medium py-2 pl-4">Asset</th>
                <th className="text-left font-medium py-2">Method</th>
                <th className="text-right font-medium py-2">Gross Value</th>
                <th className="text-right font-medium py-2">Equity Basis</th>
                <th className="text-right font-medium py-2">Attr. NAV</th>
                <th className="text-right font-medium py-2">Unrealized G/L</th>
                <th className="text-right font-medium py-2 pr-4">% of Fund NAV</th>
              </tr>
            </thead>
            <tbody>
              {activeAssets
                .sort((a, b) => b.attributable_nav - a.attributable_nav)
                .map((a) => (
                  <tr key={a.asset_id} className="border-t border-bm-border/10 hover:bg-bm-surface/20">
                    <td className="py-2 pl-4">
                      <div className="font-medium text-bm-text">{a.asset_name}</div>
                      <div className="text-[10px] text-bm-muted">{a.market ?? a.city ?? "—"}</div>
                    </td>
                    <td className="text-bm-muted2 capitalize">
                      {METHOD_LABELS[a.valuation_method ?? ""] ?? a.valuation_method ?? "—"}
                    </td>
                    <td className="text-right text-bm-muted2">{fmtMoney(a.gross_asset_value)}</td>
                    <td className="text-right text-bm-muted2">{fmtMoney(a.attributable_equity_basis)}</td>
                    <td className="text-right font-medium text-bm-text">{fmtMoney(a.attributable_nav)}</td>
                    <td className={`text-right ${a.unrealized_gain_loss >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {fmtMoney(a.unrealized_gain_loss)}
                    </td>
                    <td className="text-right text-bm-muted2 pr-4">
                      {totalNav > 0 ? fmtPct(a.attributable_nav / totalNav) : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
