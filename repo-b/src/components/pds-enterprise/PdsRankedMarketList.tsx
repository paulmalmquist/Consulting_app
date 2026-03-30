"use client";

import React, { useMemo } from "react";
import type { PdsV2PerformanceRow } from "@/lib/bos-api";
import { formatCurrency, formatPercent, toNumber } from "@/components/pds-enterprise/pdsEnterprise";

function variancePct(actual: string | number | undefined, plan: string | number | undefined): number {
  const a = toNumber(actual);
  const p = toNumber(plan);
  if (p === 0) return 0;
  return (a - p) / Math.abs(p);
}

function riskScore(row: PdsV2PerformanceRow): number {
  let score = 0;
  const vPct = variancePct(row.fee_actual, row.fee_plan);
  if (vPct < -0.1) score += 30;
  else if (vPct < -0.03) score += 15;
  score += (row.red_projects || 0) * 10;
  score += (row.client_risk_accounts || 0) * 8;
  const util = toNumber(row.utilization_pct);
  if (util > 0 && util < 0.6) score += 15;
  return Math.min(score, 100);
}

function rankColor(idx: number): string {
  if (idx === 0) return "bg-red-500/25 text-red-300";
  if (idx === 1) return "bg-red-500/15 text-red-400";
  if (idx === 2) return "bg-amber-500/15 text-amber-400";
  return "bg-slate-700/40 text-slate-400";
}

export function PdsRankedMarketList({
  rows,
  selectedMarketId,
  activeFilterKey,
  onMarketClick,
}: {
  rows: PdsV2PerformanceRow[];
  selectedMarketId?: string | null;
  activeFilterKey?: string | null;
  onMarketClick?: (marketId: string) => void;
}) {
  const ranked = useMemo(() => {
    return [...rows]
      .map((row) => ({
        ...row,
        vPct: variancePct(row.fee_actual, row.fee_plan),
        shortfall: toNumber(row.fee_actual) - toNumber(row.fee_plan),
        risk: riskScore(row),
      }))
      .sort((a, b) => a.vPct - b.vPct)
      .slice(0, 5);
  }, [rows]);

  return (
    <div className="flex flex-col" data-testid="pds-ranked-market-list">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Worst Performing
        </p>
        <p className="text-[10px] text-slate-500">by variance</p>
      </div>
      <div className="flex flex-col gap-1">
        {ranked.map((row, idx) => {
          const isSelected = selectedMarketId === row.entity_id;
          return (
            <button
              key={row.entity_id}
              type="button"
              onClick={() => onMarketClick?.(row.entity_id)}
              className={`group flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all ${
                isSelected
                  ? "border-blue-500/40 bg-blue-500/[0.08]"
                  : "border-transparent hover:bg-slate-700/20"
              }`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold ${rankColor(idx)}`}>
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-bm-text">{row.entity_label}</p>
                <div className="flex items-center gap-2 text-[11px] mt-0.5">
                  <span className={`font-semibold tabular-nums ${row.vPct < -0.05 ? "text-red-400" : row.vPct < 0 ? "text-amber-400" : "text-emerald-400"}`}>
                    {row.vPct >= 0 ? "+" : ""}{formatPercent(row.vPct, 1)}
                  </span>
                  <span className="text-slate-500 tabular-nums">
                    {formatCurrency(row.shortfall)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                  <span>{row.red_projects || 0} red projects</span>
                  <span>{row.client_risk_accounts || 0} client risks</span>
                  {row.owner_label ? <span>Owner: {row.owner_label}</span> : null}
                  {activeFilterKey ? <span className="text-pds-accentText">Filter: {activeFilterKey.replace(/_/g, " ")}</span> : null}
                </div>
              </div>
            </button>
          );
        })}
        {ranked.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-500">No markets to rank.</p>
        )}
      </div>
    </div>
  );
}
