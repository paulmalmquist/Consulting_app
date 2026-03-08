"use client";

import Link from "next/link";
import { BrainCircuit, MapPinned, ShieldAlert, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { CompareMode, GeoDealContextResponse } from "./types";
import type { DealRadarNode } from "../radar/types";
import { formatMoney, formatPercent, formatMultiple } from "../radar/utils";

function formatMetric(value: number | null | undefined, units?: string | null) {
  if (value == null) return "—";
  if (units === "USD") return formatMoney(value);
  if (units === "%" || units === "percent") return `${value.toFixed(1)}%`;
  if (units === "years") return `${value.toFixed(1)} yrs`;
  if (units === "index") return value.toFixed(0);
  if (Math.abs(value) >= 1000) return value.toLocaleString();
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function profileSection(
  title: string,
  profile: Record<string, { label: string; value: number | null; units?: string | null }>,
) {
  const items = Object.entries(profile).slice(0, 6);
  return (
    <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{title}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.map(([key, item]) => (
          <div key={key} className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">{item.label}</p>
            <p className="mt-1 text-sm text-bm-text">{formatMetric(item.value, item.units)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DealGeoIntelligencePanel({
  envId,
  node,
  context,
  compareMode,
  onAskWinston,
  className,
}: {
  envId: string;
  node?: DealRadarNode | null;
  context?: GeoDealContextResponse | null;
  compareMode: CompareMode;
  onAskWinston: () => void;
  className?: string;
}) {
  if (!node) {
    return (
      <div className={cn("rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5", className)}>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Geo Intelligence</p>
        <p className="mt-3 text-lg font-semibold text-bm-text">Select a deal marker to inspect geo-market context.</p>
        <p className="mt-2 text-sm text-bm-muted">
          The right panel will show tract, county, benchmark, hazard, and Winston-ready commentary.
        </p>
      </div>
    );
  }

  const benchmarkProfile =
    compareMode === "county"
      ? context?.county_profile
      : compareMode === "metro"
        ? context?.metro_benchmark
        : context?.tract_profile;

  return (
    <aside className={cn("space-y-4", className)}>
      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Selected Deal</p>
            <p className="mt-2 text-xl font-semibold text-bm-text">{node.dealName}</p>
            <p className="mt-1 text-sm text-bm-muted">{node.locationLabel}</p>
          </div>
          <span className="rounded-full border border-bm-border/50 bg-bm-bg/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
            {node.stage}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Fund</p>
            <p className="mt-1 text-sm text-bm-text">{node.fundName || "Unassigned"}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Strategy</p>
            <p className="mt-1 text-sm text-bm-text">{node.strategy || "—"}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Deal Size</p>
            <p className="mt-1 text-sm text-bm-text">{formatMoney(node.headlinePrice)}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Equity Required</p>
            <p className="mt-1 text-sm text-bm-text">{formatMoney(context?.underwriting.equity_required ?? node.equityRequired)}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Target IRR</p>
            <p className="mt-1 text-sm text-bm-text">{formatPercent(context?.underwriting.target_irr ?? node.targetIrr)}</p>
          </div>
          <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Target MOIC</p>
            <p className="mt-1 text-sm text-bm-text">{formatMultiple(context?.underwriting.target_moic ?? node.targetMoic)}</p>
          </div>
        </div>
      </section>

      {profileSection("Tract Profile", context?.tract_profile || {})}
      {profileSection(compareMode === "metro" ? "Metro Benchmark" : compareMode === "county" ? "County Profile" : "Comparison Focus", benchmarkProfile || {})}

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-bm-warning" />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Hazard Context</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {Object.entries(context?.hazard || {}).map(([key, item]) => (
            <div key={key} className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">{item.label}</p>
              <p className="mt-1 text-sm text-bm-text">{formatMetric(item.value, item.units)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-bm-accent" />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Market Fit Interpretation</p>
        </div>
        <p className="mt-3 text-2xl font-semibold text-bm-text">{context?.fit.sector_fit_score?.toFixed(0) ?? "—"}</p>
        <div className="mt-3 space-y-2">
          {(context?.fit.positives || []).map((item) => (
            <div key={item} className="rounded-xl border border-bm-success/25 bg-bm-success/10 px-3 py-3 text-sm text-bm-text">
              {item}
            </div>
          ))}
          {(context?.fit.risks || []).map((item) => (
            <div key={item} className="rounded-xl border border-bm-warning/25 bg-bm-warning/10 px-3 py-3 text-sm text-bm-text">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
        <div className="flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-bm-muted2" />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Winston Commentary Seed</p>
        </div>
        <div className="mt-3 space-y-2">
          {(context?.commentary_seed.safe_narrative || []).map((item) => (
            <div key={item} className="rounded-xl border border-bm-border/35 bg-bm-bg/45 px-3 py-3 text-sm text-bm-text">
              {item}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/lab/env/${envId}/re/pipeline/${node.dealId}`}
            className="inline-flex h-9 items-center rounded-md border border-bm-border/70 px-3 text-xs text-bm-text transition-colors hover:bg-bm-bg/70"
          >
            View Deal
          </Link>
          <Button variant="primary" size="sm" onClick={onAskWinston}>
            <BrainCircuit className="mr-1 h-4 w-4" />
            Ask Winston
          </Button>
        </div>
      </section>
    </aside>
  );
}
