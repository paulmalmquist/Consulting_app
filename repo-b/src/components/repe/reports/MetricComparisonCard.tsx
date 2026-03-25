"use client";
import React from "react";

/* ── MetricComparisonCard ─────────────────────────────────────────
   Side-by-side UW vs Actual metric card with computed delta.
   ────────────────────────────────────────────────────────────────── */

interface MetricComparisonCardProps {
  label: string;
  uwValue: number | null | undefined;
  actualValue: number | null | undefined;
  /** "%" for IRR/yields, "x" for multiples, "$" for currency */
  unit: "%" | "x" | "$";
}

function fmt(value: number | null | undefined, unit: string): string {
  if (value == null || !Number.isFinite(value)) return "--";
  switch (unit) {
    case "%":
      return `${(value * 100).toFixed(1)}%`;
    case "x":
      return `${value.toFixed(2)}x`;
    case "$": {
      const abs = Math.abs(value);
      if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
      if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
      return `$${value.toFixed(0)}`;
    }
    default:
      return String(value);
  }
}

function fmtDelta(delta: number | null | undefined, unit: string): string {
  if (delta == null || !Number.isFinite(delta)) return "--";
  const sign = delta > 0 ? "+" : "";
  switch (unit) {
    case "%":
      return `${sign}${(delta * 100).toFixed(1)}%`;
    case "x":
      return `${sign}${delta.toFixed(2)}x`;
    case "$": {
      const abs = Math.abs(delta);
      if (abs >= 1e9) return `${sign}$${(delta / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `${sign}$${(delta / 1e6).toFixed(1)}M`;
      if (abs >= 1e3) return `${sign}$${(delta / 1e3).toFixed(0)}K`;
      return `${sign}$${delta.toFixed(0)}`;
    }
    default:
      return `${sign}${delta}`;
  }
}

export default function MetricComparisonCard({
  label,
  uwValue,
  actualValue,
  unit,
}: MetricComparisonCardProps) {
  const delta =
    uwValue != null && actualValue != null ? actualValue - uwValue : null;
  const deltaColor =
    delta != null && delta > 0
      ? "text-emerald-400"
      : delta != null && delta < 0
        ? "text-red-400"
        : "text-bm-muted2";

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
        {label}
      </p>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-bm-muted2">
            UW
          </p>
          <p className="mt-1 text-lg font-semibold">{fmt(uwValue, unit)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-bm-muted2">
            Actual
          </p>
          <p className="mt-1 text-lg font-semibold">
            {fmt(actualValue, unit)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-bm-muted2">
            Delta
          </p>
          <p className={`mt-1 text-lg font-semibold ${deltaColor}`}>
            {fmtDelta(delta, unit)}
          </p>
        </div>
      </div>
    </div>
  );
}
