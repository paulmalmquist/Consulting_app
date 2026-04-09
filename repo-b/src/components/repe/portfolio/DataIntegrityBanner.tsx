"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Info, XCircle } from "lucide-react";
import { getReV2EnvironmentPortfolioKpis, type ReV2EnvironmentPortfolioKpis } from "@/lib/bos-api";
import { useRepeContext } from "@/lib/repe-context";
import { usePortfolioFilters, formatQuarterLabel } from "./PortfolioFilterContext";

interface IntegrityWarning {
  severity: "critical" | "warning" | "info";
  message: string;
  level?: string; // "fund" | "investment" | "asset" | "period"
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

export function DataIntegrityBanner() {
  const { environmentId } = useRepeContext();
  const { filters } = usePortfolioFilters();
  const [warnings, setWarnings] = useState<IntegrityWarning[]>([]);

  useEffect(() => {
    if (!environmentId) return;

    getReV2EnvironmentPortfolioKpis(environmentId, filters.quarter, filters.activeModelId || undefined)
      .then((kpis) => {
        const items: IntegrityWarning[] = [];

        // 1. Missing data warnings from KPI endpoint
        for (const w of kpis.warnings || []) {
          items.push({
            severity: "warning",
            message: w,
            level: "period",
          });
        }

        // 2. Stale period detection
        if (kpis.effective_quarter !== filters.quarter) {
          items.push({
            severity: "info",
            message: `No data for ${formatQuarterLabel(filters.quarter)}. Showing ${formatQuarterLabel(kpis.effective_quarter)} as latest available.`,
            level: "period",
          });
        }

        // 3. Missing metrics (signals incomplete data)
        if (kpis.portfolio_nav === null || kpis.portfolio_nav === undefined) {
          items.push({
            severity: "warning",
            message: "Portfolio NAV not computed. Run quarter close to generate fund-level state.",
            level: "fund",
          });
        }

        if (kpis.weighted_dscr === null && kpis.active_assets > 0) {
          items.push({
            severity: "info",
            message: "Weighted DSCR unavailable — debt data may be incomplete for some assets.",
            level: "asset",
          });
        }

        setWarnings(items);
      })
      .catch(() => setWarnings([]));
  }, [environmentId, filters.quarter, filters.activeModelId]);

  if (warnings.length === 0) return null;

  // Show highest severity first
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
