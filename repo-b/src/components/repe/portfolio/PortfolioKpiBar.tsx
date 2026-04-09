"use client";

import React, { useEffect, useState } from "react";
import { getReV2EnvironmentPortfolioKpis, type ReV2EnvironmentPortfolioKpis } from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";
import {
  usePortfolioFilters,
  formatQuarterLabel,
  getAvailableQuarters,
} from "./PortfolioFilterContext";
import { fmtMoney, fmtPctFromDecimal } from "@/lib/format-utils";

// ---------------------------------------------------------------------------
// Quarter Selector
// ---------------------------------------------------------------------------

function QuarterSelector() {
  const { filters, setQuarter, setCompareQuarter } = usePortfolioFilters();
  const quarters = getAvailableQuarters(12);

  return (
    <div className="flex items-center gap-2 text-xs">
      <select
        value={filters.quarter}
        onChange={(e) => setQuarter(e.target.value)}
        className="rounded border border-bm-border/40 bg-transparent px-2 py-1 text-xs text-bm-text outline-none focus:border-bm-accent"
      >
        {quarters.map((q) => (
          <option key={q} value={q}>{formatQuarterLabel(q)}</option>
        ))}
      </select>
      {filters.compareQuarter ? (
        <span className="flex items-center gap-1 text-bm-muted2">
          vs
          <select
            value={filters.compareQuarter}
            onChange={(e) => setCompareQuarter(e.target.value || null)}
            className="rounded border border-bm-border/40 bg-transparent px-2 py-1 text-xs text-bm-text outline-none"
          >
            <option value="">None</option>
            {quarters.filter((q) => q !== filters.quarter).map((q) => (
              <option key={q} value={q}>{formatQuarterLabel(q)}</option>
            ))}
          </select>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            const idx = quarters.indexOf(filters.quarter);
            const prev = quarters[idx + 1] || quarters[1];
            setCompareQuarter(prev);
          }}
          className="text-[10px] text-bm-muted2 hover:text-bm-accent transition-colors"
        >
          + Compare
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Metric Block
// ---------------------------------------------------------------------------

interface KpiMetricProps {
  label: string;
  value: string;
  qoqDelta?: string | null;
  qoqTone?: "positive" | "negative" | "neutral";
  uwDelta?: string | null;
  uwTone?: "positive" | "negative" | "neutral";
  barPct?: number | null;
  subtitle?: string;
}

function KpiMetric({ label, value, qoqDelta, qoqTone, uwDelta, uwTone, barPct, subtitle }: KpiMetricProps) {
  const toneColor = (tone?: "positive" | "negative" | "neutral" | null) => {
    if (tone === "positive") return "text-emerald-400";
    if (tone === "negative") return "text-red-400";
    return "text-bm-muted2";
  };

  return (
    <div className="min-w-[100px] flex-1">
      <p className="text-[10px] uppercase tracking-wider text-bm-muted2 mb-0.5">{label}</p>
      <p className="text-lg font-semibold text-bm-text leading-tight">{value}</p>
      <div className="flex items-center gap-2 mt-0.5">
        {qoqDelta && (
          <span className={`text-[10px] font-mono ${toneColor(qoqTone)}`}>
            {qoqDelta} QoQ
          </span>
        )}
        {uwDelta && (
          <span className={`text-[10px] font-mono ${toneColor(uwTone)}`}>
            {uwDelta} vs UW
          </span>
        )}
        {subtitle && !qoqDelta && !uwDelta && (
          <span className="text-[10px] text-bm-muted2">{subtitle}</span>
        )}
      </div>
      {barPct !== undefined && barPct !== null && (
        <div className="mt-1 h-1 w-full rounded-full bg-bm-border/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-bm-accent/60 transition-all duration-300"
            style={{ width: `${Math.min(Math.max(barPct, 0), 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Bar
// ---------------------------------------------------------------------------

export function PortfolioKpiBar() {
  const { environmentId } = useRepeContext();
  const { filters } = usePortfolioFilters();
  const [kpis, setKpis] = useState<ReV2EnvironmentPortfolioKpis | null>(null);

  useEffect(() => {
    if (!environmentId) return;
    getReV2EnvironmentPortfolioKpis(environmentId, filters.quarter, filters.activeModelId || undefined)
      .then(setKpis)
      .catch(() => setKpis(null));
  }, [environmentId, filters.quarter, filters.activeModelId]);

  if (!kpis) {
    return (
      <div className="h-[72px] animate-pulse rounded-md border border-bm-border/10 bg-bm-surface/20" />
    );
  }

  const pctInvested = kpis.pct_invested ? parseFloat(kpis.pct_invested) * 100 : null;

  return (
    <div className="rounded-md border border-bm-border/20 bg-bm-surface/30 px-3 py-2">
      {/* Header row: title + quarter selector */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-bm-muted2 font-medium">
          Portfolio Overview
        </span>
        <QuarterSelector />
      </div>

      {/* KPI groups */}
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {/* PERFORMANCE */}
        <div className="flex gap-4 border-r border-bm-border/15 pr-6">
          <KpiMetric
            label="Gross IRR"
            value={fmtPctFromDecimal(kpis.gross_irr) || "—"}
            subtitle={formatQuarterLabel(kpis.effective_quarter)}
          />
          <KpiMetric
            label="Net IRR"
            value={fmtPctFromDecimal(kpis.net_irr) || "—"}
            subtitle="Net of fees & carry"
          />
          <KpiMetric
            label="TVPI"
            value="—"
            subtitle="Fund-level"
          />
        </div>

        {/* CAPITAL */}
        <div className="flex gap-4 border-r border-bm-border/15 pr-6">
          <KpiMetric
            label="Commitments"
            value={fmtMoney(kpis.total_commitments) || "—"}
            subtitle={`${kpis.fund_count} fund${kpis.fund_count !== 1 ? "s" : ""}`}
          />
          <KpiMetric
            label="NAV"
            value={fmtMoney(kpis.portfolio_nav) || "—"}
            subtitle={formatQuarterLabel(kpis.effective_quarter)}
          />
          <KpiMetric
            label="% Invested"
            value={pctInvested !== null ? `${pctInvested.toFixed(1)}%` : "—"}
            barPct={pctInvested}
          />
        </div>

        {/* RISK */}
        <div className="flex gap-4">
          <KpiMetric
            label="WTD DSCR"
            value={kpis.weighted_dscr ? `${parseFloat(kpis.weighted_dscr).toFixed(2)}x` : "—"}
            subtitle="Debt service coverage"
          />
          <KpiMetric
            label="WTD LTV"
            value={kpis.weighted_ltv ? fmtPctFromDecimal(kpis.weighted_ltv) || "—" : "—"}
            subtitle="Loan to value"
          />
          <KpiMetric
            label="Assets"
            value={String(kpis.active_assets)}
            subtitle="Active properties"
          />
        </div>
      </div>

      {/* Model overlay indicator */}
      {filters.activeModelId && (
        <div className="mt-2 rounded bg-purple-500/10 px-2 py-1 text-[10px] text-purple-400 font-mono">
          Model overlay active
        </div>
      )}
    </div>
  );
}
