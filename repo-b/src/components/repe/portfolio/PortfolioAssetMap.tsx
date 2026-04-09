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
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-bm-muted2/80">{label}</p>
      <p className="mt-0.5 font-display text-sm font-semibold tabular-nums text-bm-text">{String(value)}</p>
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
    <div className="rounded-lg border border-bm-border/30 bg-bm-surface/[0.02] overflow-hidden">
      {loading ? (
        <div className="p-4">
          <StateCard state="loading" />
        </div>
      ) : !data || points.length === 0 ? (
        <div className="p-4">
          <StateCard
            state="empty"
            title="No assets with location data"
            description={`${data?.summary?.owned_assets ?? 0} assets exist but lack geolocation or market metadata. Add coordinates or assign valid market mappings to enable portfolio map analysis.`}
          />
        </div>
      ) : (
        <div className="relative">
          {/* Summary overlay — compact, inside map corner */}
          <div className="absolute top-2 left-2 z-10 bg-bm-bg/80 backdrop-blur-sm rounded-md border border-bm-border/20 px-3 py-2">
            <div className="flex gap-x-4 gap-y-1">
              <SummaryMetric label="Owned" value={summary?.owned_assets ?? 0} />
              <SummaryMetric label="Pipeline" value={summary?.pipeline_assets ?? 0} />
              <SummaryMetric label="Markets" value={summary?.markets ?? 0} />
            </div>
          </div>

          {/* Status filter chips — top-right overlay */}
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            {STATUS_CHIPS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setFilter(s.value)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] transition-colors backdrop-blur-sm ${
                  filter === s.value
                    ? "bg-bm-accent/20 text-bm-accent border border-bm-accent/30"
                    : "bg-bm-bg/60 text-bm-muted2 hover:bg-bm-surface/40 hover:text-bm-text border border-bm-border/20"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Map — fills container */}
          <div className="h-[280px] sm:h-[320px] lg:h-[380px]">
            {mounted && <MapInner points={filtered} />}
          </div>

          {/* Approximate location note */}
          {(() => {
            const noCoords = filtered.filter((p) => {
              const lat = Number(p.lat);
              const lon = Number(p.lon);
              return isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0);
            }).length;
            return noCoords > 0 ? (
              <p className="text-[10px] text-bm-muted2 px-3 py-1 border-t border-bm-border/10">
                {noCoords} asset{noCoords > 1 ? "s" : ""} placed at market centroid
              </p>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}
