"use client";

import { fmtMoney, fmtPct } from "@/lib/format-utils";
import type { FundBaseScenario } from "./types";

const TIER_COLORS: Record<string, string> = {
  return_of_capital: "bg-blue-500",
  preferred_return: "bg-emerald-500",
  catch_up: "bg-amber-500",
  split: "bg-purple-500",
  residual_split: "bg-purple-500",
  carry_split: "bg-purple-500",
};

const TIER_LABELS: Record<string, string> = {
  return_of_capital: "Return of Capital",
  preferred_return: "Preferred Return",
  catch_up: "GP Catch-Up",
  split: "Residual Split",
  residual_split: "Residual Split",
  carry_split: "Carry Split",
};

export function WaterfallSummaryBand({ result }: { result: FundBaseScenario }) {
  const w = result.waterfall;
  const total = w.total_liquidation_value || 1;
  const lpPct = total > 0 ? w.lp_total / total : 0;
  const gpPct = total > 0 ? w.gp_total / total : 0;

  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
          LP / GP Waterfall Summary
        </h3>
        <span className="text-xs text-bm-muted2">
          {w.waterfall_type === "european" ? "European" : "American"} Style
        </span>
      </div>

      {/* LP/GP totals */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div>
          <div className="text-[10px] uppercase text-bm-muted">Total Distributable</div>
          <div className="text-lg font-semibold text-bm-text">{fmtMoney(w.total_liquidation_value)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-bm-muted">LP Total</div>
          <div className="text-lg font-semibold text-blue-400">{fmtMoney(w.lp_total)}</div>
          <div className="text-[10px] text-bm-muted">{fmtPct(lpPct)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-bm-muted">GP Total</div>
          <div className="text-lg font-semibold text-emerald-400">{fmtMoney(w.gp_total)}</div>
          <div className="text-[10px] text-bm-muted">{fmtPct(gpPct)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-bm-muted">Promote Earned</div>
          <div className="text-lg font-semibold text-amber-400">{fmtMoney(w.promote_total)}</div>
        </div>
      </div>

      {/* Tier bar */}
      {w.tiers.length > 0 && (
        <div className="space-y-2">
          <div className="flex h-6 w-full overflow-hidden rounded-md">
            {w.tiers.map((tier) => {
              const pct = total > 0 ? (tier.total_amount / total) * 100 : 0;
              if (pct < 0.5) return null;
              const colorClass = TIER_COLORS[tier.tier_code] ?? "bg-zinc-500";
              return (
                <div
                  key={tier.tier_code}
                  className={`${colorClass} flex items-center justify-center text-[9px] font-medium text-white`}
                  style={{ width: `${pct}%` }}
                  title={`${TIER_LABELS[tier.tier_code] ?? tier.tier_label}: ${fmtMoney(tier.total_amount)}`}
                >
                  {pct > 8 ? (TIER_LABELS[tier.tier_code]?.split(" ")[0] ?? tier.tier_code) : ""}
                </div>
              );
            })}
          </div>

          {/* Tier detail table */}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-bm-muted">
                <th className="text-left font-medium py-1">Tier</th>
                <th className="text-right font-medium py-1">LP</th>
                <th className="text-right font-medium py-1">GP</th>
                <th className="text-right font-medium py-1">Total</th>
                <th className="text-right font-medium py-1">Split</th>
                <th className="text-center font-medium py-1 w-10">Active</th>
              </tr>
            </thead>
            <tbody>
              {w.tiers.map((tier) => {
                const tierTotal = tier.total_amount || 1;
                const effectiveLpSplit = (tier as Record<string, unknown>).effective_lp_split != null
                  ? (tier as Record<string, unknown>).effective_lp_split as number
                  : tier.total_amount > 0 ? tier.lp_amount / tierTotal : null;
                const effectiveGpSplit = (tier as Record<string, unknown>).effective_gp_split != null
                  ? (tier as Record<string, unknown>).effective_gp_split as number
                  : tier.total_amount > 0 ? tier.gp_amount / tierTotal : null;
                const isActive = (tier as Record<string, unknown>).is_active != null
                  ? (tier as Record<string, unknown>).is_active as boolean
                  : tier.total_amount > 0;

                return (
                  <tr key={tier.tier_code} className="border-t border-bm-border/20">
                    <td className="py-1.5 text-bm-text">
                      <span className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full ${TIER_COLORS[tier.tier_code] ?? "bg-zinc-500"}`} />
                        {TIER_LABELS[tier.tier_code] ?? tier.tier_label}
                      </span>
                    </td>
                    <td className="text-right text-bm-muted2">{fmtMoney(tier.lp_amount)}</td>
                    <td className="text-right text-bm-muted2">{fmtMoney(tier.gp_amount)}</td>
                    <td className="text-right font-medium text-bm-text">{fmtMoney(tier.total_amount)}</td>
                    <td className="text-right text-bm-muted2">
                      {effectiveLpSplit != null && effectiveGpSplit != null
                        ? `${Math.round(effectiveLpSplit * 100)}/${Math.round(effectiveGpSplit * 100)}`
                        : "—"}
                    </td>
                    <td className="text-center">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${isActive ? "bg-green-400" : "bg-zinc-600"}`}
                        title={isActive ? "Active" : "Inactive"}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {w.tiers.length === 0 && (
        <p className="text-xs text-bm-muted2 italic">
          No waterfall definition found for this fund. Create one to see tier-by-tier distributions.
        </p>
      )}
    </div>
  );
}
