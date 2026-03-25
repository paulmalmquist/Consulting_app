"use client";

import { Filter } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "sourced", label: "Sourced" },
  { value: "screening", label: "Screening" },
  { value: "loi", label: "LOI" },
  { value: "dd", label: "Due Diligence" },
  { value: "ic", label: "IC" },
  { value: "closing", label: "Closing" },
  { value: "closed", label: "Closed" },
  { value: "dead", label: "Dead" },
];

const STRATEGY_OPTIONS = [
  { value: "", label: "All Strategies" },
  { value: "core", label: "Core" },
  { value: "core_plus", label: "Core Plus" },
  { value: "value_add", label: "Value Add" },
  { value: "opportunistic", label: "Opportunistic" },
  { value: "debt", label: "Debt" },
  { value: "development", label: "Development" },
];

export default function DealFilterBar({
  status,
  strategy,
  onStatusChange,
  onStrategyChange,
}: {
  status: string;
  strategy: string;
  onStatusChange: (v: string) => void;
  onStrategyChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Filter className="h-4 w-4 text-bm-muted" />
      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
        className="rounded-lg border border-bm-border bg-bm-surface px-3 py-1.5 text-sm text-bm-text focus:border-bm-accent focus:outline-none"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={strategy}
        onChange={(e) => onStrategyChange(e.target.value)}
        className="rounded-lg border border-bm-border bg-bm-surface px-3 py-1.5 text-sm text-bm-text focus:border-bm-accent focus:outline-none"
      >
        {STRATEGY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
