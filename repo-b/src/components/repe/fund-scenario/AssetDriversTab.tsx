"use client";

import { Building2 } from "lucide-react";
import { fmtMoney, fmtPct } from "@/lib/format-utils";
import type { FundBaseScenario } from "./types";

export function AssetDriversTab({ result }: { result: FundBaseScenario }) {
  const assets = result.assets;

  if (assets.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-bm-border/30 bg-bm-surface/5">
        <div className="text-center">
          <Building2 size={24} className="mx-auto mb-2 text-bm-muted" />
          <p className="text-sm text-bm-muted2">No assets in this scenario.</p>
        </div>
      </div>
    );
  }

  const totalNav = assets.reduce((sum, a) => sum + a.attributable_nav, 0);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <div className="text-[10px] uppercase text-bm-muted">Active Assets</div>
          <div className="mt-1 text-xl font-semibold text-bm-text">
            {assets.filter((a) => a.status_category === "active").length}
          </div>
        </div>
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <div className="text-[10px] uppercase text-bm-muted">Disposed</div>
          <div className="mt-1 text-xl font-semibold text-bm-text">
            {assets.filter((a) => a.status_category === "disposed").length}
          </div>
        </div>
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <div className="text-[10px] uppercase text-bm-muted">Total Attr. NAV</div>
          <div className="mt-1 text-xl font-semibold text-bm-text">{fmtMoney(totalNav)}</div>
        </div>
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <div className="text-[10px] uppercase text-bm-muted">Total Attr. NOI</div>
          <div className="mt-1 text-xl font-semibold text-bm-text">
            {fmtMoney(assets.reduce((sum, a) => sum + a.attributable_noi, 0))}
          </div>
        </div>
      </div>

      {/* Asset detail table */}
      <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
        <div className="px-4 py-3 border-b border-bm-border/30">
          <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
            Asset-Level Drivers
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-bm-muted border-b border-bm-border/20">
                <th className="text-left font-medium py-2 pl-4">Asset</th>
                <th className="text-left font-medium py-2">Type</th>
                <th className="text-left font-medium py-2">Market</th>
                <th className="text-right font-medium py-2">Ownership</th>
                <th className="text-right font-medium py-2">Gross Value</th>
                <th className="text-right font-medium py-2">Debt</th>
                <th className="text-right font-medium py-2">Net Value</th>
                <th className="text-right font-medium py-2">Attr. NAV</th>
                <th className="text-right font-medium py-2">Attr. NOI</th>
                <th className="text-right font-medium py-2">Net CF</th>
                <th className="text-right font-medium py-2">Valuation</th>
                <th className="text-right font-medium py-2">Unreal. G/L</th>
                <th className="text-right font-medium py-2 pr-4">Real. G/L</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.asset_id} className="border-t border-bm-border/10 hover:bg-bm-surface/20">
                  <td className="py-2 pl-4">
                    <div className="font-medium text-bm-text">{a.asset_name}</div>
                    <div className="text-[10px] text-bm-muted">{a.investment_name}</div>
                  </td>
                  <td className="text-bm-muted2 capitalize">{a.property_type ?? "—"}</td>
                  <td className="text-bm-muted2">{a.market ?? a.city ?? "—"}</td>
                  <td className="text-right text-bm-muted2">{fmtPct(a.ownership_percent)}</td>
                  <td className="text-right text-bm-muted2">{fmtMoney(a.gross_asset_value)}</td>
                  <td className="text-right text-bm-muted2">{fmtMoney(a.debt_balance)}</td>
                  <td className="text-right text-bm-muted2">{fmtMoney(a.net_asset_value)}</td>
                  <td className="text-right font-medium text-bm-text">{fmtMoney(a.attributable_nav)}</td>
                  <td className="text-right text-bm-muted2">{fmtMoney(a.attributable_noi)}</td>
                  <td className="text-right text-bm-muted2">{fmtMoney(a.attributable_net_cash_flow)}</td>
                  <td className="text-right text-bm-muted2 capitalize">{a.valuation_method ?? "—"}</td>
                  <td className={`text-right ${a.unrealized_gain_loss >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {fmtMoney(a.unrealized_gain_loss)}
                  </td>
                  <td className={`text-right pr-4 ${a.realized_gain_loss >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {fmtMoney(a.realized_gain_loss)}
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
