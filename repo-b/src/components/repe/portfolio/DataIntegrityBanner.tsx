"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Info, XCircle } from "lucide-react";
import {
  getReV2EnvironmentPortfolioKpis,
  getFundTableRows,
  type ReV2EnvironmentPortfolioKpis,
  type FundTableRow,
} from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";
import { usePortfolioFilters, formatQuarterLabel } from "./PortfolioFilterContext";

export type DataQuality = "ok" | "degraded" | "missing" | "invalid";

interface IntegrityWarning {
  severity: "critical" | "warning" | "info";
  message: string;
  level?: string;
}

const SEVERITY_ICON = {
  critical: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_STYLES = {
  critical: "bg-red-500/8 border-red-500/20 text-red-400",
  warning: "bg-amber-500/8 border-amber-500/20 text-amber-400",
  info: "bg-blue-500/8 border-blue-500/20 text-blue-400",
};

/**
 * Compute overall data quality from integrity warnings.
 * Returns the worst quality level found.
 */
export function computeDataQuality(warnings: IntegrityWarning[]): DataQuality {
  if (warnings.length === 0) return "ok";
  if (warnings.some((w) => w.severity === "critical")) return "invalid";
  if (warnings.some((w) => w.severity === "warning")) return "degraded";
  return "degraded"; // info-only warnings still count as degraded
}

interface DataIntegrityBannerProps {
  onDataQualityChange?: (quality: DataQuality) => void;
}

export function DataIntegrityBanner({ onDataQualityChange }: DataIntegrityBannerProps) {
  const { environmentId } = useRepeContext();
  const { filters } = usePortfolioFilters();
  const [warnings, setWarnings] = useState<IntegrityWarning[]>([]);

  useEffect(() => {
    if (!environmentId) return;

    // Fetch KPIs and fund table rows in parallel for cross-referencing
    Promise.all([
      getReV2EnvironmentPortfolioKpis(environmentId, filters.quarter, filters.activeModelId || undefined),
      getFundTableRows(environmentId, filters.quarter, filters.activeModelId || undefined).catch(() => [] as FundTableRow[]),
    ]).then(([kpis, fundRows]) => {
      const items: IntegrityWarning[] = [];

      // 1. Server-provided warnings
      for (const w of kpis.warnings || []) {
        items.push({ severity: "warning", message: w, level: "period" });
      }

      // 2. Stale period detection
      if (kpis.effective_quarter !== filters.quarter) {
        items.push({
          severity: "info",
          message: `No data for ${formatQuarterLabel(filters.quarter)}. Showing ${formatQuarterLabel(kpis.effective_quarter)} as latest available.`,
          level: "period",
        });
      }

      // 3. Missing portfolio NAV
      if (kpis.portfolio_nav === null || kpis.portfolio_nav === undefined) {
        items.push({
          severity: "warning",
          message: "Portfolio NAV not computed. Run quarter close to generate fund-level state.",
          level: "fund",
        });
      }

      // 4. pct_invested > 100% for any fund (CRITICAL — impossible or data defect)
      for (const row of fundRows) {
        if (row.pct_invested) {
          const ratio = parseFloat(row.pct_invested);
          if (!isNaN(ratio) && ratio > 1.0) {
            items.push({
              severity: "critical",
              message: `${row.name}: % Invested is ${(ratio * 100).toFixed(0)}% — capital call data may contain duplicates.`,
              level: "fund",
            });
          }
        }
      }

      // 5. Missing NAV for individual funds
      const fundsWithMissingNav = fundRows.filter((r) => r.portfolio_nav === null || r.portfolio_nav === undefined);
      if (fundsWithMissingNav.length > 0 && fundRows.length > 0) {
        const names = fundsWithMissingNav.map((r) => r.name).join(", ");
        items.push({
          severity: "warning",
          message: `Missing NAV for ${formatQuarterLabel(filters.quarter)}: ${names}`,
          level: "fund",
        });
      }

      // 6. Missing TVPI for individual funds
      const fundsWithMissingTvpi = fundRows.filter(
        (r) => (r.tvpi === null || r.tvpi === undefined) && r.portfolio_nav !== null
      );
      if (fundsWithMissingTvpi.length > 0) {
        const names = fundsWithMissingTvpi.map((r) => r.name).join(", ");
        items.push({
          severity: "warning",
          message: `Missing TVPI: ${names}`,
          level: "fund",
        });
      }

      // 7. Header NAV vs sum of fund NAVs reconciliation
      if (kpis.portfolio_nav && fundRows.length > 0) {
        const headerNav = parseFloat(kpis.portfolio_nav);
        const rowNavSum = fundRows.reduce((sum, r) => {
          const v = r.portfolio_nav ? parseFloat(r.portfolio_nav) : 0;
          return sum + (isNaN(v) ? 0 : v);
        }, 0);
        if (headerNav > 0 && Math.abs(headerNav - rowNavSum) / headerNav > 0.01) {
          items.push({
            severity: "critical",
            message: `Portfolio NAV ($${(headerNav / 1e6).toFixed(0)}M) does not reconcile with fund table sum ($${(rowNavSum / 1e6).toFixed(0)}M).`,
            level: "fund",
          });
        }
      }

      // 8. DSCR warning
      if (kpis.weighted_dscr === null && kpis.active_assets > 0) {
        items.push({
          severity: "info",
          message: "Weighted DSCR unavailable — debt data may be incomplete for some assets.",
          level: "asset",
        });
      }

      setWarnings(items);
      onDataQualityChange?.(computeDataQuality(items));
    }).catch(() => {
      setWarnings([]);
      onDataQualityChange?.("missing");
    });
  }, [environmentId, filters.quarter, filters.activeModelId, onDataQualityChange]);

  if (warnings.length === 0) return null;

  const sortedWarnings = [...warnings].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  const topSeverity = sortedWarnings[0].severity;
  const styles = SEVERITY_STYLES[topSeverity];

  return (
    <div className={`rounded-md border ${styles} px-3 py-2 space-y-1`}>
      {sortedWarnings.map((w, i) => {
        const Icon = SEVERITY_ICON[w.severity];
        return (
          <div key={i} className="flex items-start gap-2 text-xs">
            <Icon className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>{w.message}</span>
            {w.level && (
              <span className="ml-auto text-[9px] uppercase tracking-wider opacity-60 flex-shrink-0">
                {w.level}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
