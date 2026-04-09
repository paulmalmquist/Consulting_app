"use client";

import Link from "next/link";

function fmtCurrency(raw: number | string | null | undefined): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (n == null || isNaN(n)) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function PipelineActionBar({
  todayCount,
  staleCount,
  criticalCount,
  noActionCount,
  revenueAtRisk,
  totalPipeline,
  weightedPipeline,
  openDeals,
  envId,
}: {
  todayCount: number;
  staleCount: number;
  criticalCount: number;
  noActionCount: number;
  revenueAtRisk: number;
  totalPipeline: number;
  weightedPipeline: number;
  openDeals: number;
  envId: string;
}) {
  return (
    <div className="sticky top-0 z-10 rounded-xl border border-bm-border/50 bg-bm-bg/95 backdrop-blur-sm px-4 py-2.5 flex flex-wrap items-center gap-4">
      {/* Metrics */}
      <div className="flex items-center gap-4 flex-wrap flex-1">
        <Stat label="Open" value={String(openDeals)} />
        <Stat label="Pipeline" value={fmtCurrency(totalPipeline)} />
        <Stat label="Weighted" value={fmtCurrency(weightedPipeline)} />
        <Sep />
        <Stat
          label="Due today"
          value={String(todayCount)}
          accent={todayCount > 0 ? "amber" : undefined}
        />
        <Stat
          label="Stale (3d+)"
          value={String(staleCount)}
          accent={staleCount > 0 ? "orange" : undefined}
        />
        {criticalCount > 0 ? (
          <Stat
            label="Critical"
            value={String(criticalCount)}
            accent="red"
          />
        ) : null}
        {noActionCount > 0 ? (
          <Stat
            label="No action"
            value={String(noActionCount)}
            accent="red"
          />
        ) : null}
        {revenueAtRisk > 0 ? (
          <Stat
            label="At risk"
            value={fmtCurrency(revenueAtRisk)}
            accent="red"
          />
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={`/lab/env/${envId}/consulting/tasks`}
          className="rounded-lg border border-bm-border/60 px-3 py-1.5 text-xs font-medium text-bm-text hover:bg-bm-surface/30 transition-colors"
        >
          Tasks
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber" | "orange" | "red";
}) {
  const colorMap = {
    amber: "text-amber-400",
    orange: "text-orange-400",
    red: "text-red-400",
  };
  const valueColor = accent ? colorMap[accent] : "text-bm-text";

  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-bm-muted2 leading-none">
        {label}
      </span>
      <span className={`text-sm font-semibold leading-tight mt-0.5 ${valueColor}`}>
        {value}
      </span>
    </div>
  );
}

function Sep() {
  return <div className="w-px h-6 bg-bm-border/40" />;
}
