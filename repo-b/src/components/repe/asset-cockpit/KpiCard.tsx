"use client";

import { SparkLine } from "@/components/charts";
import { CHART_COLORS } from "@/components/charts/chart-theme";

interface Props {
  label: string;
  value: string;
  /** Prior quarter value for delta calculation. */
  priorValue?: number | null;
  /** Current numeric value (for delta math). */
  currentValue?: number | null;
  /** Array of historical numeric values for the sparkline. */
  sparkValues?: number[];
  /** "up_good" means green when rising (NOI, value). "down_good" means green when falling (LTV). */
  polarity?: "up_good" | "down_good";
  /** Format function for the delta display. */
  formatDelta?: (delta: number) => string;
}

function defaultDeltaFmt(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  if (Math.abs(delta) >= 1_000_000) return `${sign}${(delta / 1_000_000).toFixed(1)}M`;
  if (Math.abs(delta) >= 1_000) return `${sign}${(delta / 1_000).toFixed(0)}K`;
  return `${sign}${delta.toFixed(0)}`;
}

export default function KpiCard({
  label,
  value,
  priorValue,
  currentValue,
  sparkValues,
  polarity = "up_good",
  formatDelta,
}: Props) {
  let deltaEl: React.ReactNode = null;

  if (priorValue != null && currentValue != null && priorValue !== 0) {
    const delta = currentValue - priorValue;
    const pctChange = (delta / Math.abs(priorValue)) * 100;
    const isPositive = delta >= 0;
    const isGood = polarity === "up_good" ? isPositive : !isPositive;
    const fmt = formatDelta ?? defaultDeltaFmt;

    deltaEl = (
      <span
        className={`text-xs font-medium ${isGood ? "text-green-400" : "text-red-400"}`}
      >
        {fmt(delta)} ({isPositive ? "+" : ""}{pctChange.toFixed(1)}%)
      </span>
    );
  }

  const sparkColor =
    polarity === "down_good" ? CHART_COLORS.warning : CHART_COLORS.noi;

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            {label}
          </p>
          <p className="mt-1 text-lg font-bold truncate">{value}</p>
          {deltaEl}
        </div>
        {sparkValues && sparkValues.length > 1 && (
          <SparkLine values={sparkValues} color={sparkColor} />
        )}
      </div>
    </div>
  );
}
