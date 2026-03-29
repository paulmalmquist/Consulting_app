"use client";

import type { TooltipProps } from "recharts";
import type { ResumeTimeline, ResumeTimelineViewMode } from "@/lib/bos-api";
import type { NarrativeSeries, TimelineChartPoint } from "./capabilityGraphData";

export default function CapabilityGraphTooltip({
  active,
  payload,
  timeline,
  view,
  series,
}: TooltipProps<number, string> & {
  timeline: ResumeTimeline;
  view: ResumeTimelineViewMode;
  series: NarrativeSeries[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload as TimelineChartPoint | undefined;
  if (!point) return null;

  const phase = point.phase_id
    ? timeline.phases.find((item) => item.phase_id === point.phase_id)
    : null;

  return (
    <div
      className="pointer-events-none rounded-xl border border-bm-border/40 px-4 py-3 text-xs shadow-2xl backdrop-blur-sm"
      style={{ backgroundColor: "hsl(217, 29%, 9%)", color: "hsl(210, 24%, 94%)" }}
    >
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="text-sm font-semibold">{point.label}</span>
        {phase ? (
          <span className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">{phase.phase_name}</span>
        ) : null}
      </div>

      <div className="space-y-1.5">
        {series.map((item) => {
          const value = Number(point[item.key] ?? 0);
          if (value <= 0) return null;
          return (
            <div key={item.key} className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
              <span className="ml-auto tabular-nums text-bm-muted">
                {view === "impact" ? value.toFixed(1) : value.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
