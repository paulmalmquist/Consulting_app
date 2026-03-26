"use client";

import { CheckCircle2, Circle, Droplets } from "lucide-react";
import { fmtMoney, fmtPct } from "@/lib/format-utils";
import type { FundBaseScenario } from "./types";
import type { BaseScenarioTierSummary, BaseScenarioPartnerAllocation } from "@/lib/bos-api";

const TIER_COLORS: Record<string, string> = {
  return_of_capital: "bg-blue-500",
  preferred_return: "bg-emerald-500",
  catch_up: "bg-amber-500",
  split: "bg-purple-500",
  residual_split: "bg-purple-500",
  carry_split: "bg-purple-500",
  promote: "bg-purple-500",
};

const TIER_LABELS: Record<string, string> = {
  return_of_capital: "Return of Capital",
  preferred_return: "Preferred Return",
  catch_up: "GP Catch-Up",
  split: "Residual Split",
  residual_split: "Residual Split",
  carry_split: "Carry Split",
  promote: "Promote",
};

const PARTNER_TYPE_BADGE: Record<string, string> = {
  gp: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  lp: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  co_invest: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

function WaterfallDefinitionBand({ result }: { result: FundBaseScenario }) {
  const w = result.waterfall;
  return (
    <div className="flex items-center justify-between rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
      <div className="flex items-center gap-3">
        <Droplets size={16} className="text-bm-muted" />
        <div>
          <span className="text-sm font-medium text-bm-text">Fund Waterfall</span>
          <span className="ml-2 text-xs text-bm-muted">
            {w.waterfall_type === "european" ? "European (Fund-level)" : "American (Deal-by-deal)"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-bm-muted2">
        {w.definition_id && (
          <span className="font-mono text-[10px]">
            Def: {w.definition_id.slice(0, 8)}...
          </span>
        )}
        <span>Total Distributable: <span className="font-medium text-bm-text">{fmtMoney(w.total_liquidation_value)}</span></span>
      </div>
    </div>
  );
}

function WaterfallTierBar({ tiers, total }: { tiers: BaseScenarioTierSummary[]; total: number }) {
  if (tiers.length === 0) return null;

  return (
    <div className="flex h-8 w-full overflow-hidden rounded-lg">
      {tiers.map((tier) => {
        const pct = total > 0 ? (tier.total_amount / total) * 100 : 0;
        if (pct < 0.3) return null;
        const colorClass = TIER_COLORS[tier.tier_code] ?? "bg-zinc-500";
        return (
          <div
            key={tier.tier_code}
            className={`${colorClass} flex items-center justify-center text-[10px] font-medium text-white transition-all`}
            style={{ width: `${pct}%` }}
            title={`${TIER_LABELS[tier.tier_code] ?? tier.tier_label}: ${fmtMoney(tier.total_amount)} (${pct.toFixed(1)}%)`}
          >
            {pct > 10 ? (TIER_LABELS[tier.tier_code] ?? tier.tier_code) : pct > 5 ? (TIER_LABELS[tier.tier_code]?.split(" ")[0] ?? "") : ""}
          </div>
        );
      })}
    </div>
  );
}

function TierDetailTable({ tiers }: { tiers: BaseScenarioTierSummary[] }) {
  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
      <div className="px-4 py-3 border-b border-bm-border/30">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
          Tier-by-Tier Allocation Detail
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-bm-muted border-b border-bm-border/20">
              <th className="text-left font-medium py-2 pl-4">Tier</th>
              <th className="text-right font-medium py-2">Hurdle</th>
              <th className="text-right font-medium py-2">Def. Split (LP/GP)</th>
              <th className="text-right font-medium py-2">Obligation</th>
              <th className="text-right font-medium py-2">LP Alloc.</th>
              <th className="text-right font-medium py-2">GP Alloc.</th>
              <th className="text-right font-medium py-2">Total</th>
              <th className="text-right font-medium py-2">Remaining</th>
              <th className="text-right font-medium py-2">Eff. Split</th>
              <th className="text-center font-medium py-2 w-12">Status</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => {
              const defSplit = tier.definition_split_lp != null && tier.definition_split_gp != null
                ? `${Math.round(tier.definition_split_lp * 100)}/${Math.round(tier.definition_split_gp * 100)}`
                : tier.tier_code === "return_of_capital" ? "Pro rata" : tier.tier_code === "preferred_return" ? "100/0" : "—";
              const effSplit = tier.effective_lp_split != null && tier.effective_gp_split != null
                ? `${Math.round(tier.effective_lp_split * 100)}/${Math.round(tier.effective_gp_split * 100)}`
                : "—";

              return (
                <tr key={`${tier.tier_code}-${tier.tier_order}`} className="border-t border-bm-border/10">
                  <td className="py-2.5 pl-4">
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${TIER_COLORS[tier.tier_code] ?? "bg-zinc-500"}`} />
                      <span className="font-medium text-bm-text">
                        {TIER_LABELS[tier.tier_code] ?? tier.tier_label}
                      </span>
                    </span>
                  </td>
                  <td className="text-right text-bm-muted2">
                    {tier.hurdle_rate != null ? `${(tier.hurdle_rate * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="text-right text-bm-muted2">{defSplit}</td>
                  <td className="text-right text-bm-muted2">{fmtMoney(tier.starting_obligation)}</td>
                  <td className="text-right text-blue-400">{fmtMoney(tier.lp_amount)}</td>
                  <td className="text-right text-emerald-400">{fmtMoney(tier.gp_amount)}</td>
                  <td className="text-right font-medium text-bm-text">{fmtMoney(tier.total_amount)}</td>
                  <td className="text-right text-bm-muted2">{fmtMoney(tier.remaining_after)}</td>
                  <td className="text-right text-bm-muted2">{effSplit}</td>
                  <td className="text-center">
                    {tier.is_fully_satisfied ? (
                      <>
                        <CheckCircle2 size={14} className="inline text-green-400" aria-hidden="true" />
                        <span className="sr-only">Fully satisfied</span>
                      </>
                    ) : tier.is_active ? (
                      <>
                        <Circle size={14} className="inline text-amber-400" aria-hidden="true" />
                        <span className="sr-only">Partially allocated</span>
                      </>
                    ) : (
                      <>
                        <Circle size={14} className="inline text-zinc-600" aria-hidden="true" />
                        <span className="sr-only">Inactive</span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-bm-border/30">
              <td className="py-2.5 pl-4 font-medium text-bm-text">Total</td>
              <td />
              <td />
              <td />
              <td className="text-right font-medium text-blue-400">
                {fmtMoney(tiers.reduce((sum, t) => sum + t.lp_amount, 0))}
              </td>
              <td className="text-right font-medium text-emerald-400">
                {fmtMoney(tiers.reduce((sum, t) => sum + t.gp_amount, 0))}
              </td>
              <td className="text-right font-bold text-bm-text">
                {fmtMoney(tiers.reduce((sum, t) => sum + t.total_amount, 0))}
              </td>
              <td />
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function PartnerAllocationTable({ partners }: { partners: BaseScenarioPartnerAllocation[] }) {
  if (partners.length === 0) return null;

  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
      <div className="px-4 py-3 border-b border-bm-border/30">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
          Partner Allocations
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-bm-muted border-b border-bm-border/20">
              <th className="text-left font-medium py-2 pl-4">Partner</th>
              <th className="text-left font-medium py-2">Type</th>
              <th className="text-right font-medium py-2">Committed</th>
              <th className="text-right font-medium py-2">Contributed</th>
              <th className="text-right font-medium py-2">Distributed</th>
              <th className="text-right font-medium py-2">RoC</th>
              <th className="text-right font-medium py-2">Pref</th>
              <th className="text-right font-medium py-2">Catch-Up</th>
              <th className="text-right font-medium py-2">Split</th>
              <th className="text-right font-medium py-2">Total Alloc.</th>
              <th className="text-right font-medium py-2">IRR</th>
              <th className="text-right font-medium py-2 pr-4">TVPI</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => {
              const typeClass = PARTNER_TYPE_BADGE[p.partner_type] ?? "bg-zinc-500/20 text-bm-muted2 border-zinc-500/30";
              return (
                <tr key={p.partner_id} className="border-t border-bm-border/10">
                  <td className="py-2.5 pl-4 font-medium text-bm-text">{p.name}</td>
                  <td className="py-2.5">
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium uppercase border ${typeClass}`}>
                      {p.partner_type}
                    </span>
                  </td>
                  <td className="text-right text-bm-muted2">{fmtMoney(p.committed)}</td>
                  <td className="text-right text-bm-muted2">{fmtMoney(p.contributed)}</td>
                  <td className="text-right text-bm-muted2">{fmtMoney(p.distributed)}</td>
                  <td className="text-right text-bm-muted2">{fmtMoney(p.waterfall_allocation.return_of_capital)}</td>
                  <td className="text-right text-bm-muted2">{fmtMoney(p.waterfall_allocation.preferred_return)}</td>
                  <td className="text-right text-bm-muted2">{fmtMoney(p.waterfall_allocation.catch_up)}</td>
                  <td className="text-right text-bm-muted2">{fmtMoney(p.waterfall_allocation.split)}</td>
                  <td className="text-right font-medium text-bm-text">{fmtMoney(p.waterfall_allocation.total)}</td>
                  <td className="text-right text-bm-muted2">{p.irr != null ? fmtPct(p.irr) : "—"}</td>
                  <td className="text-right text-bm-muted2 pr-4">{p.tvpi != null ? `${p.tvpi.toFixed(2)}x` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WaterfallTab({ result }: { result: FundBaseScenario }) {
  const w = result.waterfall;

  if (w.tiers.length === 0 && w.partner_allocations.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-bm-border/30 bg-bm-surface/5">
        <div className="text-center">
          <Droplets size={24} className="mx-auto mb-2 text-bm-muted" />
          <p className="text-sm text-bm-muted2">No waterfall definition found for this fund.</p>
          <p className="text-xs text-bm-muted mt-1">
            Create a waterfall definition to see tier-by-tier LP/GP distribution analysis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Definition header */}
      <WaterfallDefinitionBand result={result} />

      {/* Visual tier bar */}
      <WaterfallTierBar tiers={w.tiers} total={w.total_liquidation_value} />

      {/* LP/GP summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <div className="text-[10px] uppercase text-bm-muted">Total Distributable</div>
          <div className="mt-1 text-xl font-semibold text-bm-text">{fmtMoney(w.total_liquidation_value)}</div>
        </div>
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <div className="text-[10px] uppercase text-bm-muted">LP Total</div>
          <div className="mt-1 text-xl font-semibold text-blue-400">{fmtMoney(w.lp_total)}</div>
          <div className="text-[10px] text-bm-muted">{w.total_liquidation_value > 0 ? fmtPct(w.lp_total / w.total_liquidation_value) : "—"}</div>
        </div>
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <div className="text-[10px] uppercase text-bm-muted">GP Total</div>
          <div className="mt-1 text-xl font-semibold text-emerald-400">{fmtMoney(w.gp_total)}</div>
          <div className="text-[10px] text-bm-muted">{w.total_liquidation_value > 0 ? fmtPct(w.gp_total / w.total_liquidation_value) : "—"}</div>
        </div>
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-4 py-3">
          <div className="text-[10px] uppercase text-bm-muted">Promote Earned</div>
          <div className="mt-1 text-xl font-semibold text-amber-400">{fmtMoney(w.promote_total)}</div>
        </div>
      </div>

      {/* Tier detail table */}
      <TierDetailTable tiers={w.tiers} />

      {/* Partner allocation table */}
      <PartnerAllocationTable partners={w.partner_allocations} />
    </div>
  );
}
