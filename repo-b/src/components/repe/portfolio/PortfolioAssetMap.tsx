"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { StateCard } from "@/components/ui/StateCard";
import type { AssetMapResponse, AssetMapPoint } from "@/lib/bos-api";

const MapInner = dynamic(() => import("./PortfolioAssetMapInner"), { ssr: false });

type StatusFilter = "all" | "owned" | "pipeline";

const STATUS_CHIPS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Owned", value: "owned" },
  { label: "Pipeline", value: "pipeline" },
];

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold tabular-nums text-bm-text">{String(value)}</p>
    </div>
  );
}

export function PortfolioAssetMap({
  data,
  loading,
}: {
  data: AssetMapResponse | null;
  loading: boolean;
}) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const points = data?.points ?? [];
  const filtered = filter === "all" ? points : points.filter((p) => p.status === filter);
  const summary = data?.summary;

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/[0.03] p-6 space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-[1.05rem] font-semibold tracking-tight text-bm-text">
          Owned and Pipelined Assets
        </h3>
        <p className="mt-0.5 text-xs text-bm-muted2">
          Geographic footprint of owned assets and active pipeline opportunities.
        </p>
      </div>

      {loading ? (
        <StateCard state="loading" />
      ) : !data || points.length === 0 ? (
        <StateCard
          state="empty"
          title="No asset locations available yet"
          description="Map will populate from owned asset records and pipeline opportunities with location metadata."
        />
      ) : (
        <>
          {/* Summary callouts */}
          <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-bm-border/20 pb-3">
            <SummaryMetric label="Owned Assets" value={summary?.owned_assets ?? 0} />
            <SummaryMetric label="Pipeline Assets" value={summary?.pipeline_assets ?? 0} />
            <SummaryMetric label="Markets" value={summary?.markets ?? 0} />
          </div>

          {/* Status filter chips */}
          <div className="flex gap-1.5">
            {STATUS_CHIPS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setFilter(s.value)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors ${
                  filter === s.value
                    ? "bg-bm-accent/20 text-bm-accent"
                    : "text-bm-muted2 hover:bg-bm-surface/25 hover:text-bm-text"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Map */}
          <div className="h-[280px] rounded-lg overflow-hidden border border-bm-border/30">
            {mounted && <MapInner points={filtered} />}
          </div>
        </>
      )}
    </div>
  );
}
