"use client";

import React from "react";
import type { PortfolioWaterfallResponse } from "@/lib/bos-api";

function fmtMoney(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "—";
  if (Math.abs(numeric) >= 1_000_000_000) return `$${(numeric / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(numeric) >= 1_000_000) return `$${(numeric / 1_000_000).toFixed(1)}M`;
  return `$${numeric.toFixed(0)}`;
}

function fmtPct(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "—";
  return `${(numeric * 100).toFixed(2)}%`;
}

export function PortfolioWaterfallSummary({ result }: { result: PortfolioWaterfallResponse }) {
  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Portfolio Waterfall</p>
        <h3 className="text-lg font-semibold">Cross-fund carry and LP return view</h3>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div><p className="text-xs text-bm-muted2">Total NAV</p><p className="font-semibold">{fmtMoney(result.portfolio.total_nav)}</p></div>
        <div><p className="text-xs text-bm-muted2">Weighted IRR</p><p className="font-semibold">{fmtPct(result.portfolio.weighted_irr)}</p></div>
        <div><p className="text-xs text-bm-muted2">Total Carry</p><p className="font-semibold">{fmtMoney(result.portfolio.total_carry)}</p></div>
        <div><p className="text-xs text-bm-muted2">Diversification</p><p className="font-semibold">{Number(result.diversification_score || 0).toFixed(1)}</p></div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
              <th className="px-3 py-2">Fund</th>
              <th className="px-3 py-2 text-right">NAV</th>
              <th className="px-3 py-2 text-right">IRR</th>
              <th className="px-3 py-2 text-right">Carry</th>
              <th className="px-3 py-2 text-right">LP Shortfall</th>
            </tr>
          </thead>
          <tbody>
            {result.funds.map((fund) => (
              <tr key={String(fund.fund_id)} className="border-b border-bm-border/20 last:border-b-0">
                <td className="px-3 py-2">{String(fund.fund_name || fund.fund_id)}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(fund.nav as string | number)}</td>
                <td className="px-3 py-2 text-right">{fmtPct(fund.net_irr as string | number)}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(fund.carry as string | number)}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(fund.lp_shortfall as string | number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
