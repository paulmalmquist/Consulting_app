"use client";

import type { MetricBlock } from "@/lib/vultr-contracts";
import { CloudMetricTile } from "./CloudMetricTile";

interface Props {
  kpis: MetricBlock[];
}

export function GpuCapacityKpiStrip({ kpis }: Props) {
  if (!kpis.length) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {kpis.map((k) => (
        <div key={k.key} className="min-w-[160px] flex-1">
          <CloudMetricTile block={k} />
        </div>
      ))}
    </div>
  );
}
