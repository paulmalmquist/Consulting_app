"use client";

import React from "react";
import { X } from "lucide-react";
import { usePortfolioFilters, formatQuarterLabel } from "./PortfolioFilterContext";

export function PortfolioFilterBar() {
  const { activeFilters, hasActiveFilters, clearAll, filters } = usePortfolioFilters();

  if (!hasActiveFilters) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-bm-border/20 bg-bm-surface/40 px-3 py-2 text-xs">
      <span className="mr-1 text-bm-muted2 font-medium">Showing:</span>

      {activeFilters.map((af) => (
        <span
          key={af.key}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] ${
            af.source === "signal"
              ? "bg-amber-500/15 text-amber-400"
              : af.source === "chart"
              ? "bg-blue-500/15 text-blue-400"
              : af.source === "model"
              ? "bg-purple-500/15 text-purple-400"
              : af.source === "time"
              ? "bg-green-500/15 text-green-400"
              : "bg-bm-surface text-bm-text"
          }`}
        >
          <span className="text-bm-muted2">{af.label}:</span>
          <span>{af.value}</span>
          <button
            type="button"
            onClick={af.onRemove}
            className="ml-0.5 rounded-full p-0.5 hover:bg-bm-border/30 transition-colors"
            aria-label={`Remove ${af.label} filter`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {/* Time context */}
      <span className="ml-auto text-bm-muted2">
        {formatQuarterLabel(filters.quarter)}
        {filters.compareQuarter && ` vs ${formatQuarterLabel(filters.compareQuarter)}`}
      </span>

      <button
        type="button"
        onClick={clearAll}
        className="ml-2 text-[10px] uppercase tracking-wider text-bm-muted2 hover:text-bm-text transition-colors"
      >
        Clear all
      </button>
    </div>
  );
}
