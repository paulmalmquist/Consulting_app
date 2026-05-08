/**
 * Single KPI tile for the Vultr surface.
 *
 * Reads a `MetricBlock` from the API and renders fail-closed: when the value
 * is null the tile shows the `null_reason` rather than a deceptive zero.
 */
import type { MetricBlock } from "@/lib/vultr-contracts";
import { SourceProvenanceChip } from "./SourceProvenanceChip";
import { UnavailableMetric } from "./UnavailableMetric";

const UNIT_FORMATTERS: Record<string, (v: number) => string> = {
  usd: (v) =>
    v >= 1_000_000
      ? `$${(v / 1_000_000).toFixed(2)}M`
      : v >= 1_000
        ? `$${(v / 1_000).toFixed(1)}k`
        : `$${v.toFixed(2)}`,
  usd_per_hour: (v) => `$${v.toFixed(2)}/hr`,
  pct: (v) => `${v.toFixed(1)}%`,
  count: (v) => v.toLocaleString(),
  hours: (v) =>
    v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(2)}M hrs`
      : v >= 1_000
        ? `${(v / 1_000).toFixed(1)}k hrs`
        : `${v.toFixed(0)} hrs`,
  gpu_hours: (v) =>
    v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(2)}M GPU-hrs`
      : v >= 1_000
        ? `${(v / 1_000).toFixed(1)}k GPU-hrs`
        : `${v.toFixed(0)} GPU-hrs`,
  days: (v) => `${v.toFixed(0)} d`,
  ratio: (v) => v.toFixed(3),
};

function formatValue(value: number, unit: string): string {
  const fmt = UNIT_FORMATTERS[unit];
  return fmt ? fmt(value) : `${value} ${unit}`;
}

export function CloudMetricTile({ block }: { block: MetricBlock }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-bm-divider/40 bg-bm-bg-1/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">
          {block.label}
        </p>
        {block.period ? (
          <span className="font-mono text-[10px] text-bm-muted2">{block.period}</span>
        ) : null}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-bm-text">
        {block.value === null ? (
          <UnavailableMetric reason={block.null_reason} />
        ) : (
          formatValue(block.value, block.unit)
        )}
      </div>
      <div className="mt-1">
        <SourceProvenanceChip provenance={block.provenance} />
      </div>
    </div>
  );
}
