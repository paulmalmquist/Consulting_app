"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getAllocationBreakdown,
  getFundTableRows,
  type AllocationBreakdownResponse,
  type AllocationGroup,
  type FundTableRow,
} from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { usePortfolioFilters } from "./PortfolioFilterContext";
import { fmtMoney, fmtPct } from "@/lib/format-utils";
import { getChartColors } from "@/components/charts/chart-theme";

// ---------------------------------------------------------------------------
// Allocation colors (consistent per sector/geo)
// ---------------------------------------------------------------------------

const ALLOC_COLORS = [
  "#38BDF8", "#34D399", "#FBBF24", "#A78BFA", "#F87171",
  "#FB923C", "#2DD4BF", "#818CF8", "#E879F9", "#94A3B8",
];

// ---------------------------------------------------------------------------
// Allocation Bar
// ---------------------------------------------------------------------------

function AllocationBar({ groups }: { groups: AllocationGroup[] }) {
  if (groups.length === 0) {
    return <div className="text-xs text-bm-muted2">No allocation data</div>;
  }

  return (
    <div className="space-y-1.5">
      {/* Stacked bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-bm-border/10">
        {groups.map((g, i) => (
          <div
            key={g.name}
            className="h-full transition-all duration-300"
            style={{
              width: `${g.pct}%`,
              backgroundColor: ALLOC_COLORS[i % ALLOC_COLORS.length],
              minWidth: g.pct > 0 ? "2px" : 0,
            }}
            title={`${g.name}: ${g.pct.toFixed(1)}%`}
          />
        ))}
      </div>

      {/* Legend rows */}
      <div className="space-y-0.5">
        {groups.slice(0, 8).map((g, i) => (
          <div key={g.name} className="flex items-center gap-2 text-[10px]">
            <span
              className="h-2 w-2 rounded-sm flex-shrink-0"
              style={{ backgroundColor: ALLOC_COLORS[i % ALLOC_COLORS.length] }}
            />
            <span className="flex-1 truncate text-bm-text">{g.name}</span>
            <span className="text-bm-muted2 font-mono">{fmtMoney(g.total_nav)}</span>
            <span className="text-bm-muted2 font-mono w-[40px] text-right">{g.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top/Bottom Performers
// ---------------------------------------------------------------------------

function numVal(s: string | null | undefined): number {
  if (!s) return -Infinity;
  const n = parseFloat(s);
  return isNaN(n) ? -Infinity : n;
}

function PerformersTable({ funds, basePath }: { funds: FundTableRow[]; basePath: string }) {
  const top5 = useMemo(() => {
    return [...funds]
      .filter((f) => numVal(f.gross_irr) > -Infinity)
      .sort((a, b) => numVal(b.gross_irr) - numVal(a.gross_irr))
      .slice(0, 5);
  }, [funds]);

  const bottom5 = useMemo(() => {
    return [...funds]
      .filter((f) => numVal(f.weighted_dscr) > -Infinity)
      .sort((a, b) => numVal(a.weighted_dscr) - numVal(b.weighted_dscr))
      .slice(0, 5);
  }, [funds]);

  if (top5.length === 0 && bottom5.length === 0) {
    return <div className="text-xs text-bm-muted2">No performance data available</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Top by IRR */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">Top by IRR</p>
        <div className="space-y-0.5">
          {top5.map((f) => (
            <Link
              key={f.fund_id}
              href={`${basePath}/funds/${f.fund_id}`}
              className="flex items-center justify-between text-[10px] rounded px-1 py-0.5 hover:bg-bm-surface/50 transition-colors"
            >
              <span className="truncate text-bm-text mr-2">{f.name}</span>
              <span className="font-mono text-emerald-400 flex-shrink-0">{fmtPct(f.gross_irr)}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom by DSCR */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-red-400 mb-1">Bottom by DSCR</p>
        <div className="space-y-0.5">
          {bottom5.map((f) => (
            <Link
              key={f.fund_id}
              href={`${basePath}/funds/${f.fund_id}`}
              className="flex items-center justify-between text-[10px] rounded px-1 py-0.5 hover:bg-bm-surface/50 transition-colors"
            >
              <span className="truncate text-bm-text mr-2">{f.name}</span>
              <span className="font-mono text-red-400 flex-shrink-0">
                {f.weighted_dscr ? `${parseFloat(f.weighted_dscr).toFixed(2)}x` : "—"}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Combined Component
// ---------------------------------------------------------------------------

export function AllocationAndPerformers() {
  const { environmentId } = useRepeContext();
  const basePath = useRepeBasePath();
  const { filters } = usePortfolioFilters();

  const [allocation, setAllocation] = useState<AllocationBreakdownResponse | null>(null);
  const [allocGroupBy, setAllocGroupBy] = useState<"sector" | "geography">("sector");
  const [funds, setFunds] = useState<FundTableRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!environmentId) return;
    setLoading(true);
    Promise.all([
      getAllocationBreakdown(environmentId, filters.quarter, allocGroupBy, filters.activeModelId || undefined),
      getFundTableRows(environmentId, filters.quarter, filters.activeModelId || undefined),
    ])
      .then(([alloc, fundRows]) => {
        setAllocation(alloc);
        setFunds(fundRows);
      })
      .catch(() => {
        setAllocation(null);
        setFunds([]);
      })
      .finally(() => setLoading(false));
  }, [environmentId, filters.quarter, allocGroupBy, filters.activeModelId]);

  if (loading) {
    return <div className="h-[280px] animate-pulse rounded-md border border-bm-border/10 bg-bm-surface/20" />;
  }

  return (
    <div className="rounded-md border border-bm-border/20 bg-bm-surface/30 p-3 space-y-3">
      {/* Allocation */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-bm-muted2 font-medium">
            Allocation
          </span>
          <div className="flex gap-0.5 rounded-md border border-bm-border/20 p-0.5">
            {(["sector", "geography"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setAllocGroupBy(opt)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  allocGroupBy === opt
                    ? "bg-bm-accent/20 text-bm-accent"
                    : "text-bm-muted2 hover:text-bm-text"
                }`}
              >
                {opt === "sector" ? "Sector" : "Geography"}
              </button>
            ))}
          </div>
        </div>
        <AllocationBar groups={allocation?.groups || []} />
      </div>

      {/* Divider */}
      <div className="border-t border-bm-border/15" />

      {/* Top/Bottom */}
      <div>
        <span className="text-[10px] uppercase tracking-wider text-bm-muted2 font-medium mb-2 block">
          Performance Leaders
        </span>
        <PerformersTable funds={funds} basePath={basePath} />
      </div>
    </div>
  );
}
