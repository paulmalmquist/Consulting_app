"use client";

import { useState } from "react";
import { Loader2, ChevronDown, ChevronRight, Building2, Network } from "lucide-react";
import { fmtMoney, fmtPct } from "@/lib/format-utils";
import { useJvDetail } from "./useJvDetail";
import type { JvDetailItem, JvDetailWaterfallTier } from "@/lib/bos-api";

const TIER_TYPE_LABELS: Record<string, string> = {
  return_of_capital: "Return of Capital",
  preferred_return: "Preferred Return",
  catch_up: "GP Catch-Up",
  split: "Residual Split",
  promote: "Promote",
};

const PARTNER_TYPE_COLORS: Record<string, string> = {
  gp: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  lp: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  co_invest: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  sponsor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

function JvMetricsRow({ jv }: { jv: JvDetailItem }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <div className="text-xs">
        <div className="text-[10px] uppercase text-bm-muted">NAV</div>
        <div className="font-medium text-bm-text">{jv.nav != null ? fmtMoney(jv.nav) : "--"}</div>
      </div>
      <div className="text-xs">
        <div className="text-[10px] uppercase text-bm-muted">NOI</div>
        <div className="font-medium text-bm-text">{jv.noi != null ? fmtMoney(jv.noi) : "--"}</div>
      </div>
      <div className="text-xs">
        <div className="text-[10px] uppercase text-bm-muted">Debt Balance</div>
        <div className="font-medium text-bm-text">{jv.debt_balance != null ? fmtMoney(jv.debt_balance) : "--"}</div>
      </div>
      <div className="text-xs">
        <div className="text-[10px] uppercase text-bm-muted">Cash</div>
        <div className="font-medium text-bm-text">{jv.cash_balance != null ? fmtMoney(jv.cash_balance) : "--"}</div>
      </div>
    </div>
  );
}

function JvPartnerTable({ jv }: { jv: JvDetailItem }) {
  if (jv.partner_shares.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-bm-muted mb-1.5">Partners</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-bm-muted border-b border-bm-border/20">
            <th className="text-left font-medium py-1">Partner</th>
            <th className="text-left font-medium py-1">Type</th>
            <th className="text-right font-medium py-1">Ownership</th>
            <th className="text-left font-medium py-1">Class</th>
          </tr>
        </thead>
        <tbody>
          {jv.partner_shares.map((ps) => {
            const typeClass = PARTNER_TYPE_COLORS[ps.partner_type] ?? "bg-zinc-500/20 text-bm-muted2 border-zinc-500/30";
            return (
              <tr key={`${ps.partner_id}-${ps.share_class}`} className="border-t border-bm-border/10">
                <td className="py-1.5 text-bm-text">{ps.partner_name}</td>
                <td className="py-1.5">
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium uppercase border ${typeClass}`}>
                    {ps.partner_type}
                  </span>
                </td>
                <td className="text-right text-bm-muted2">{fmtPct(ps.ownership_percent)}</td>
                <td className="text-bm-muted2 capitalize">{ps.share_class}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function JvAssetList({ jv }: { jv: JvDetailItem }) {
  if (jv.assets.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-bm-muted mb-1.5">
        Assets ({jv.asset_count})
      </div>
      <div className="space-y-1">
        {jv.assets.map((a) => (
          <div key={a.asset_id} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Building2 size={10} className="text-bm-muted" />
              <span className="text-bm-text">{a.asset_name}</span>
              {a.property_type && (
                <span className="text-[10px] text-bm-muted">({a.property_type})</span>
              )}
            </div>
            <span className="text-bm-muted2">{a.nav != null ? fmtMoney(a.nav) : "--"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function JvWaterfallMini({ tiers }: { tiers: JvDetailWaterfallTier[] }) {
  if (tiers.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-bm-muted mb-1.5">
        Waterfall Structure
      </div>
      <div className="space-y-1">
        {tiers.map((t) => (
          <div key={t.tier_order} className="flex items-center justify-between text-xs">
            <span className="text-bm-text">
              <span className="text-bm-muted mr-1">T{t.tier_order}</span>
              {TIER_TYPE_LABELS[t.tier_type] ?? t.tier_type}
            </span>
            <span className="text-bm-muted2">
              {t.hurdle_rate != null && `${(t.hurdle_rate * 100).toFixed(1)}% hurdle`}
              {t.split_lp != null && t.split_gp != null && (
                <span className="ml-2">
                  LP {Math.round(t.split_lp * 100)}/GP {Math.round(t.split_gp * 100)}
                </span>
              )}
              {t.catch_up_percent != null && (
                <span className="ml-2">{Math.round(t.catch_up_percent * 100)}% catch-up</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function JvCard({ jv }: { jv: JvDetailItem }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor =
    jv.status === "active" ? "bg-green-400" :
    jv.status === "dissolved" ? "bg-zinc-400" :
    "bg-blue-400";

  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
      {/* Identity header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-bm-surface/20 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Network size={16} className="text-bm-muted shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-bm-text truncate">{jv.legal_name}</span>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColor}`} />
              <span className="text-[10px] text-bm-muted capitalize">{jv.status}</span>
            </div>
            <div className="text-[11px] text-bm-muted2 mt-0.5">
              {jv.investment_name} &middot; {jv.asset_count} asset{jv.asset_count !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {/* Ownership */}
          <div className="text-right">
            <div className="text-xs font-medium text-bm-text">{fmtPct(jv.ownership_percent)}</div>
            <div className="text-[10px] text-bm-muted">Fund Own%</div>
          </div>
          {/* LP/GP split */}
          {jv.gp_percent != null && jv.lp_percent != null && (
            <div className="text-right">
              <div className="text-xs">
                <span className="text-emerald-400">GP {fmtPct(jv.gp_percent)}</span>
                {" / "}
                <span className="text-blue-400">LP {fmtPct(jv.lp_percent)}</span>
              </div>
            </div>
          )}
          {/* NAV */}
          <div className="text-right">
            <div className="text-xs font-medium text-bm-text">{jv.nav != null ? fmtMoney(jv.nav) : "--"}</div>
            <div className="text-[10px] text-bm-muted">NAV</div>
          </div>
          {expanded ? <ChevronDown size={14} className="text-bm-muted" /> : <ChevronRight size={14} className="text-bm-muted" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-bm-border/30 p-4 space-y-4">
          <JvMetricsRow jv={jv} />
          <JvPartnerTable jv={jv} />
          <JvAssetList jv={jv} />
          <JvWaterfallMini tiers={jv.waterfall_tiers} />
        </div>
      )}
    </div>
  );
}

export function JvOwnershipTab({
  fundId,
  quarter,
  scenarioId,
}: {
  fundId: string | null;
  quarter: string;
  scenarioId?: string | null;
}) {
  const { data, loading, error } = useJvDetail(fundId, quarter, scenarioId);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-bm-muted" />
        <span className="ml-2 text-sm text-bm-muted">Loading JV detail...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!data || data.jvs.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-bm-border/30 bg-bm-surface/5">
        <div className="text-center">
          <Network size={24} className="mx-auto mb-2 text-bm-muted" />
          <p className="text-sm text-bm-muted2">No JV structures found for this fund.</p>
          <p className="text-xs text-bm-muted mt-1">
            JV structures will appear here when investments use joint venture ownership.
          </p>
        </div>
      </div>
    );
  }

  // Summary stats
  const totalNav = data.jvs.reduce((sum, jv) => sum + (jv.nav ?? 0), 0);
  const totalAssets = data.jvs.reduce((sum, jv) => sum + jv.asset_count, 0);

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-bm-muted2">
          <span className="font-medium text-bm-text">{data.jvs.length} JV Structure{data.jvs.length !== 1 ? "s" : ""}</span>
          <span className="text-bm-border">|</span>
          <span>{totalAssets} total assets</span>
          <span className="text-bm-border">|</span>
          <span>Combined NAV: {fmtMoney(totalNav)}</span>
        </div>
      </div>

      {/* JV cards */}
      <div className="space-y-3">
        {data.jvs.map((jv) => (
          <JvCard key={jv.jv_id} jv={jv} />
        ))}
      </div>
    </div>
  );
}
