"use client";

/**
 * WaterfallReceiptPanel — Displays the full waterfall receipt stored in
 * the authoritative fund snapshot's canonical_metrics.
 *
 * Shows:
 *   - Waterfall assumptions (pref, catch-up, splits)
 *   - Tier-by-tier allocation table (LP/GP per tier)
 *   - LP/GP totals + conservation check
 *   - Dated LP cash flow series
 *   - Engine version + run timestamp
 *
 * Data contract: reads from canonical_metrics keys:
 *   waterfall_status, waterfall_version, waterfall_assumptions,
 *   waterfall_receipt, lp_cash_flows, waterfall_run_timestamp,
 *   net_irr, net_tvpi, gross_net_spread, carry_total
 */

import { fmtMoney, fmtPct } from "@/lib/format-utils";

interface ReceiptTier {
  tier: string;
  amount: number | string;
  lp?: number | string;
  gp?: number | string;
  pref_accrued?: number | string;
  lp_plus_gp?: number | string;
  gross_value?: number | string;
  check?: string;
}

interface LpCashFlow {
  date: string;
  amount: number;
}

interface WaterfallAssumptions {
  pref_rate: number;
  promote_pct: number;
  lp_residual: number;
  gp_residual: number;
  style: string;
  catch_up: string;
}

export interface WaterfallReceiptPanelProps {
  metrics: Record<string, unknown>;
}

function fmt(v: unknown): string {
  if (v == null) return "—";
  return fmtMoney(v as string | number);
}

function pct(v: unknown): string {
  if (v == null) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

export function WaterfallReceiptPanel({ metrics }: WaterfallReceiptPanelProps) {
  const status = metrics.waterfall_status as string | undefined;
  const version = metrics.waterfall_version as string | undefined;
  const timestamp = metrics.waterfall_run_timestamp as string | undefined;
  const assumptions = metrics.waterfall_assumptions as WaterfallAssumptions | undefined;
  const receipt = metrics.waterfall_receipt as ReceiptTier[] | undefined;
  const lpCfs = metrics.lp_cash_flows as LpCashFlow[] | undefined;
  const netIrr = metrics.net_irr as number | undefined;
  const netTvpi = metrics.net_tvpi as number | undefined;
  const spread = metrics.gross_net_spread as number | undefined;
  const carry = metrics.carry_total as number | undefined;

  if (!status || status !== "computed") {
    return (
      <div className="rounded-xl border border-bm-border/40 bg-bm-surface/[0.02] p-8 text-center">
        <p className="text-sm font-medium text-bm-muted">Waterfall not computed</p>
        <p className="mt-1 text-xs text-bm-muted2">
          No waterfall definition exists for this fund, or the waterfall engine has not been run.
          Net metrics (net IRR, net TVPI, carry) are unavailable by design.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Net Metrics Summary ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Net IRR", value: netIrr != null ? fmtPct(netIrr) : "—" },
          { label: "Net TVPI", value: netTvpi != null ? `${netTvpi}x` : "—" },
          { label: "Gross/Net Spread", value: spread != null ? `${(spread * 10000).toFixed(0)}bp` : "—" },
          { label: "GP Carry", value: carry != null ? fmtMoney(carry) : "—" },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-bm-border/30 bg-bm-surface/[0.02] px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">{m.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-bm-text">{m.value}</p>
          </div>
        ))}
      </div>

      {/* ── Hurdle Status ── */}
      {(() => {
        const hurdle = metrics.hurdle_status as string | undefined;
        const prefShortfall = metrics.pref_shortfall as number | undefined;
        const prefCoverage = metrics.pref_coverage_pct as number | undefined;
        if (!hurdle || hurdle === "no_waterfall") return null;
        const color = hurdle === "above_hurdle" ? "text-green-400 border-green-500/30 bg-green-500/5"
          : hurdle === "at_hurdle" ? "text-amber-400 border-amber-500/30 bg-amber-500/5"
          : "text-red-400 border-red-500/30 bg-red-500/5";
        const label = hurdle === "above_hurdle" ? "Above Hurdle — GP earns carry"
          : hurdle === "at_hurdle" ? "At Hurdle — pref exactly satisfied, no excess carry"
          : "Below Hurdle — pref not fully satisfied, GP earns no carry";
        return (
          <div className={`rounded-lg border px-4 py-3 ${color}`}>
            <p className="text-sm font-semibold">{label}</p>
            {hurdle === "below_hurdle" && prefShortfall != null && (
              <p className="mt-1 text-xs opacity-80">
                Pref shortfall: {fmtMoney(prefShortfall)} ({prefCoverage != null ? `${prefCoverage.toFixed(0)}% covered` : ""})
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Assumptions ── */}
      {assumptions && (
        <div className="rounded-lg border border-bm-border/30 bg-bm-surface/[0.02] p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-bm-muted2">Waterfall Assumptions</h4>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div><span className="text-bm-muted2">Pref Rate:</span> <span className="font-medium text-bm-text">{pct(assumptions.pref_rate)}</span></div>
            <div><span className="text-bm-muted2">Promote:</span> <span className="font-medium text-bm-text">{pct(assumptions.promote_pct)}</span></div>
            <div><span className="text-bm-muted2">LP/GP Split:</span> <span className="font-medium text-bm-text">{pct(assumptions.lp_residual)} / {pct(assumptions.gp_residual)}</span></div>
            <div><span className="text-bm-muted2">Style:</span> <span className="font-medium text-bm-text">{assumptions.style?.replace(/_/g, " ")}</span></div>
            <div><span className="text-bm-muted2">Catch-up:</span> <span className="font-medium text-bm-text">{assumptions.catch_up?.replace(/_/g, " ")}</span></div>
          </div>
        </div>
      )}

      {/* ── Tier Table ── */}
      {receipt && receipt.length > 0 && (
        <div className="rounded-lg border border-bm-border/30 bg-bm-surface/[0.02] p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-bm-muted2">Tier Allocations</h4>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/20 text-[11px] uppercase tracking-[0.08em] text-bm-muted2">
                <th className="pb-2 text-left font-medium">Tier</th>
                <th className="pb-2 text-right font-medium">Amount</th>
                <th className="pb-2 text-right font-medium">LP</th>
                <th className="pb-2 text-right font-medium">GP</th>
              </tr>
            </thead>
            <tbody>
              {receipt.map((row, i) => {
                const isTotal = row.tier.includes("Total") || row.tier.includes("Conservation");
                return (
                  <tr
                    key={i}
                    className={`border-b border-bm-border/10 ${isTotal ? "font-semibold" : ""}`}
                  >
                    <td className="py-1.5 text-bm-text">{row.tier}</td>
                    <td className="py-1.5 text-right tabular-nums text-bm-text">{fmt(row.amount)}</td>
                    <td className="py-1.5 text-right tabular-nums text-bm-muted">{row.lp != null ? fmt(row.lp) : ""}</td>
                    <td className="py-1.5 text-right tabular-nums text-bm-muted">{row.gp != null ? fmt(row.gp) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── LP Cash Flow Series ── */}
      {lpCfs && lpCfs.length > 0 && (
        <div className="rounded-lg border border-bm-border/30 bg-bm-surface/[0.02] p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-bm-muted2">
            LP Cash Flow Series ({lpCfs.length} entries)
          </h4>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/20 text-[11px] uppercase tracking-[0.08em] text-bm-muted2">
                <th className="pb-2 text-left font-medium">Date</th>
                <th className="pb-2 text-right font-medium">Amount</th>
                <th className="pb-2 text-left font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {lpCfs.map((cf, i) => (
                <tr key={i} className="border-b border-bm-border/10">
                  <td className="py-1 tabular-nums text-bm-text">{cf.date}</td>
                  <td className={`py-1 text-right tabular-nums ${cf.amount < 0 ? "text-red-400" : "text-green-400"}`}>
                    {fmtMoney(cf.amount)}
                  </td>
                  <td className="py-1 text-bm-muted2">{cf.amount < 0 ? "Contribution" : "LP Distribution"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Provenance ── */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-bm-muted2">
        {version && <span>Version: <span className="font-mono text-bm-text">{version}</span></span>}
        {timestamp && <span>Computed: <span className="font-mono text-bm-text">{timestamp}</span></span>}
        <span>Engine: <span className="font-mono text-bm-text">waterfall_whole_fund.py</span></span>
      </div>
    </div>
  );
}
