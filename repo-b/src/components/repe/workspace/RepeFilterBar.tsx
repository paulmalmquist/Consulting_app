"use client";

import { Filter, X } from "lucide-react";
import { useRepeFiltersOptional } from "./RepeFilterContext";

const selectClass =
  "rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1 text-xs text-bm-text focus:border-bm-accent focus:outline-none";

export default function RepeFilterBar() {
  const ctx = useRepeFiltersOptional();
  if (!ctx) return null;

  const { filters, setFilter, resetFilters, options } = ctx;
  const hasActive = Object.values(filters).some(Boolean);

  return (
    <div className="flex items-center gap-2 border-b border-bm-border/40 pb-2">
      <Filter className="h-3.5 w-3.5 flex-shrink-0 text-bm-muted2" />

      {options.funds.length > 0 && (
        <select
          value={filters.fund}
          onChange={(e) => setFilter("fund", e.target.value)}
          className={selectClass}
        >
          <option value="">All Funds</option>
          {options.funds.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {options.markets.length > 0 && (
        <select
          value={filters.market}
          onChange={(e) => setFilter("market", e.target.value)}
          className={selectClass}
        >
          <option value="">All Markets</option>
          {options.markets.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {options.sectors.length > 0 && (
        <select
          value={filters.sector}
          onChange={(e) => setFilter("sector", e.target.value)}
          className={selectClass}
        >
          <option value="">All Sectors</option>
          {options.sectors.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {options.vintages.length > 0 && (
        <select
          value={filters.vintage}
          onChange={(e) => setFilter("vintage", e.target.value)}
          className={selectClass}
        >
          <option value="">All Vintages</option>
          {options.vintages.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {options.statuses.length > 0 && (
        <select
          value={filters.status}
          onChange={(e) => setFilter("status", e.target.value)}
          className={selectClass}
        >
          <option value="">All Statuses</option>
          {options.statuses.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {hasActive && (
        <button
          type="button"
          onClick={resetFilters}
          className="ml-1 inline-flex items-center gap-1 rounded-full border border-bm-border/50 px-2 py-0.5 text-[10px] text-bm-muted2 hover:border-bm-border hover:text-bm-text"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}
