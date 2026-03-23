"use client";

import React from "react";
import { AlertTriangle, BarChart3, Building2, Landmark, MapPinned, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { cn } from "@/lib/cn";
import type { DealRadarMode, DealRadarSummary } from "./types";
import { formatMoney, RADAR_MODE_LABELS, RADAR_STAGE_LABELS } from "./utils";

function shareLabel(share: number) {
  return `${Math.round(share * 100)}%`;
}

export function RadarSummaryPanel({
  summary,
  mode,
  compact = false,
}: {
  summary: DealRadarSummary;
  mode: DealRadarMode;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Pipeline Snapshot</p>
            <p className="mt-1 text-sm text-bm-text">{RADAR_MODE_LABELS[mode]} emphasis across the visible pipeline.</p>
          </div>
          <span className="rounded-full border border-bm-border/50 bg-bm-surface/45 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
            {summary.archivedCounts.closed} closed · {summary.archivedCounts.dead} dead
          </span>
        </div>
        <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-1">
          <div className="min-w-[180px] rounded-xl border border-bm-border/40 bg-bm-surface/35 p-4">
            <MetricCard label="Pipeline Value" value={formatMoney(summary.totalPipelineValue)} size="large" />
          </div>
          <div className="min-w-[180px] rounded-xl border border-bm-border/40 bg-bm-surface/35 p-4">
            <MetricCard label="Equity Required" value={formatMoney(summary.totalEquityRequired)} size="large" />
          </div>
          <div className="min-w-[180px] rounded-xl border border-bm-border/40 bg-bm-surface/35 p-4">
            <MetricCard label="Deals" value={String(summary.dealCount)} size="large" />
          </div>
          <div className="min-w-[180px] rounded-xl border border-bm-border/40 bg-bm-surface/35 p-4">
            <MetricCard label="Weighted Pipeline" value={`${summary.weightedPipeline}%`} size="large" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <aside className="space-y-4">
      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Pipeline Command</p>
            <p className="mt-1 text-sm text-bm-text">{RADAR_MODE_LABELS[mode]} emphasis across live acquisitions.</p>
          </div>
          <span className="rounded-full border border-bm-border/50 bg-bm-bg/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
            {summary.archivedCounts.closed} closed · {summary.archivedCounts.dead} dead
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <MetricCard label="Pipeline Value" value={formatMoney(summary.totalPipelineValue)} size="large" />
          <MetricCard label="Equity Required" value={formatMoney(summary.totalEquityRequired)} size="large" />
          <MetricCard label="Deals" value={String(summary.dealCount)} />
          <MetricCard label="Average Deal" value={formatMoney(summary.averageDealSize)} />
          <MetricCard label="Weighted Pipeline" value={`${summary.weightedPipeline}%`} />
          <MetricCard label="Stage Count" value={String(summary.stageCounts.ready + summary.stageCounts.closing + summary.stageCounts.ic)} delta={{ value: "late-stage", direction: "up" }} />
        </div>
      </section>

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-bm-muted2" />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Stage Counts</p>
        </div>
        <div className="mt-3 space-y-2.5">
          {Object.entries(summary.stageCounts).map(([stage, count]) => (
            <div key={stage} className="flex items-center justify-between rounded-lg border border-bm-border/35 bg-bm-bg/45 px-3 py-2">
              <span className="text-sm text-bm-muted">{RADAR_STAGE_LABELS[stage as keyof typeof RADAR_STAGE_LABELS]}</span>
              <span className="font-display text-base font-semibold text-bm-text">{count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-bm-muted2" />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Sector Exposure</p>
        </div>
        <div className="mt-3 space-y-3">
          {summary.sectorExposure.filter((item) => item.dealCount > 0).slice(0, 5).map((item) => (
            <div key={item.sector}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-bm-text">{item.label}</span>
                <span className="text-bm-muted">{shareLabel(item.share)} · {item.dealCount} deals</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-bm-bg/70">
                <div
                  className="h-full rounded-full bg-bm-accent/75"
                  style={{ width: `${Math.max(8, item.share * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-bm-muted2" />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Fund Allocation</p>
        </div>
        <div className="mt-3 space-y-2.5">
          {summary.fundExposure.slice(0, 4).map((fund) => (
            <div key={fund.fundId || fund.fundName} className="rounded-lg border border-bm-border/35 bg-bm-bg/45 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-bm-text">{fund.fundName}</span>
                <span className="text-xs text-bm-muted">{shareLabel(fund.share)}</span>
              </div>
              <p className="mt-1 text-xs text-bm-muted">{fund.dealCount} deals · {formatMoney(fund.value)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-4">
        <div className="flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-bm-muted2" />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Market Exposure</p>
        </div>
        <div className="mt-3 space-y-2.5">
          {summary.marketExposure.slice(0, 4).map((market) => (
            <div key={market.market} className="rounded-lg border border-bm-border/35 bg-bm-bg/45 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-bm-text">{market.market}</span>
                <span className="text-xs text-bm-muted">{shareLabel(market.share)}</span>
              </div>
              <p className="mt-1 text-xs text-bm-muted">{market.dealCount} deals · {formatMoney(market.value)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-bm-warning" />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Pipeline Bottlenecks</p>
        </div>
        <div className="mt-3 space-y-2.5">
          {summary.bottlenecks.length === 0 ? (
            <div className="rounded-lg border border-bm-border/35 bg-bm-bg/45 px-3 py-3 text-sm text-bm-muted">
              The filtered pipeline is structurally clean at the moment.
            </div>
          ) : (
            summary.bottlenecks.slice(0, 4).map((bottleneck) => (
              <div
                key={bottleneck.id}
                className={cn(
                  "rounded-lg border px-3 py-3",
                  bottleneck.severity === "critical" && "border-bm-danger/40 bg-bm-danger/10",
                  bottleneck.severity === "warning" && "border-bm-warning/40 bg-bm-warning/10",
                  bottleneck.severity === "info" && "border-bm-accent/30 bg-bm-bg/45",
                )}
              >
                <p className="text-sm font-medium text-bm-text">{bottleneck.label}</p>
                <p className="mt-1 text-xs text-bm-muted">{bottleneck.detail}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-bm-muted2" />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Execution Cue</p>
        </div>
        <p className="mt-3 text-sm text-bm-text">
          Winston should prioritize late-stage deals with unresolved capital gaps first, then resolve concentration hotspots before adding new sourced volume.
        </p>
      </section>
    </aside>
  );
}
