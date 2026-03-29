"use client";

import type { TooltipProps } from "recharts";
import {
  CAPABILITY_LAYERS,
  COMPANY_BANDS,
  type CapabilityDataPoint,
  type LayerId,
  LAYER_IDS,
} from "./capabilityGraphData";

type Props = TooltipProps<number, string> & {
  hoveredLayer: string | null;
};

function getCompanyLabel(year: number): string {
  const band = COMPANY_BANDS.find((b) => year >= b.startYear && year < b.endYear);
  return band?.label ?? "";
}

export default function CapabilityGraphTooltip({ active, payload, hoveredLayer }: Props) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload as CapabilityDataPoint | undefined;
  if (!point) return null;

  const year = point.year;
  const displayYear = Math.floor(year);
  const company = getCompanyLabel(year);

  let total = 0;
  for (const id of LAYER_IDS) {
    total += point[id] ?? 0;
  }

  return (
    <div
      className="pointer-events-none rounded-xl border border-bm-border/40 px-4 py-3 text-xs shadow-2xl backdrop-blur-sm"
      style={{ backgroundColor: "hsl(217, 29%, 9%)", color: "hsl(210, 24%, 94%)" }}
    >
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="text-sm font-semibold">{displayYear}</span>
        {company ? (
          <span className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">{company}</span>
        ) : null}
      </div>

      <div className="space-y-1.5">
        {[...LAYER_IDS].reverse().map((id) => {
          const layer = CAPABILITY_LAYERS.find((l) => l.id === id);
          if (!layer) return null;
          const value = point[id as LayerId] ?? 0;
          if (value === 0) return null;

          const isHighlighted = hoveredLayer === null || hoveredLayer === id;
          return (
            <div
              key={id}
              className="flex items-center gap-2 transition-opacity"
              style={{ opacity: isHighlighted ? 1 : 0.35 }}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: layer.color }}
              />
              <span className={hoveredLayer === id ? "font-semibold" : ""}>{layer.label}</span>
              <span className="ml-auto tabular-nums text-bm-muted">{value.toFixed(1)}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
        <span className="font-medium">Total Leverage</span>
        <span className="tabular-nums font-semibold">{total.toFixed(1)}</span>
      </div>
    </div>
  );
}
