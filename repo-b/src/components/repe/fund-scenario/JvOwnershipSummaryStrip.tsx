"use client";

import { Network } from "lucide-react";
import { fmtPct, fmtMoney } from "@/lib/format-utils";
import type { FundBaseScenario } from "./types";

export function JvOwnershipSummaryStrip({
  result,
  onViewDetail,
}: {
  result: FundBaseScenario;
  onViewDetail?: () => void;
}) {
  const jvs = result.jv_summary;
  if (!jvs || jvs.total_jvs === 0) return null;

  const totalNav = jvs.jvs.reduce((sum, jv) => sum + jv.nav, 0);
  const avgGp = jvs.jvs.filter((j) => j.gp_percent != null);
  const avgLp = jvs.jvs.filter((j) => j.lp_percent != null);
  const weightedGp =
    avgGp.length > 0
      ? avgGp.reduce((s, j) => s + (j.gp_percent ?? 0) * Math.abs(j.nav), 0) /
        Math.max(avgGp.reduce((s, j) => s + Math.abs(j.nav), 0), 1)
      : null;
  const weightedLp =
    avgLp.length > 0
      ? avgLp.reduce((s, j) => s + (j.lp_percent ?? 0) * Math.abs(j.nav), 0) /
        Math.max(avgLp.reduce((s, j) => s + Math.abs(j.nav), 0), 1)
      : null;

  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
          <Network size={12} /> JV / Ownership Summary
        </h3>
        {onViewDetail && (
          <button
            onClick={onViewDetail}
            className="text-[11px] text-bm-accent hover:text-bm-accent/80"
          >
            View JV Detail &rarr;
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div className="text-xs">
          <div className="text-[10px] uppercase text-bm-muted">JV Structures</div>
          <div className="font-medium text-bm-text">{jvs.total_jvs}</div>
        </div>
        <div className="text-xs">
          <div className="text-[10px] uppercase text-bm-muted">Wtd Avg Ownership</div>
          <div className="font-medium text-bm-text">{fmtPct(jvs.weighted_avg_ownership)}</div>
        </div>
        {weightedGp != null && (
          <div className="text-xs">
            <div className="text-[10px] uppercase text-bm-muted">Wtd GP %</div>
            <div className="font-medium text-emerald-400">{fmtPct(weightedGp)}</div>
          </div>
        )}
        {weightedLp != null && (
          <div className="text-xs">
            <div className="text-[10px] uppercase text-bm-muted">Wtd LP %</div>
            <div className="font-medium text-blue-400">{fmtPct(weightedLp)}</div>
          </div>
        )}
        <div className="text-xs">
          <div className="text-[10px] uppercase text-bm-muted">Total JV NAV</div>
          <div className="font-medium text-bm-text">{fmtMoney(totalNav)}</div>
        </div>
      </div>
    </div>
  );
}
