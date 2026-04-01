"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useShallow } from "zustand/react/shallow";
import type { ResumeTimeline } from "@/lib/bos-api";
import { AXIS_TICK_STYLE, GRID_STYLE } from "@/components/charts/chart-theme";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";
import CapabilityGraphTooltip from "./CapabilityGraphTooltip";
import {
  buildTimelineChartData,
  getSeriesForView,
  getTimelinePhases,
  type TimelineChartPoint,
} from "./capabilityGraphData";

function tickLabel(value: number) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function tickLabelYearOnly(value: number) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    timeZone: "UTC",
  });
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [breakpoint]);
  return isMobile;
}

export default function CompoundingCapabilityGraph({
  timeline,
}: {
  timeline: ResumeTimeline;
}) {
  const {
    timelineView,
    selectedNarrativeKind,
    selectedNarrativeId,
    capabilityHoveredLayer,
    enabledCapabilityLayerIds,
    selectedImpactMetric,
    previewNarrativeItem,
    selectNarrativeItem,
  } = useResumeWorkspaceStore(
    useShallow((state) => ({
      timelineView: state.timelineView,
      selectedNarrativeKind: state.selectedNarrativeKind,
      selectedNarrativeId: state.selectedNarrativeId,
      capabilityHoveredLayer: state.capabilityHoveredLayer,
      enabledCapabilityLayerIds: state.enabledCapabilityLayerIds,
      selectedImpactMetric: state.selectedImpactMetric,
      previewNarrativeItem: state.previewNarrativeItem,
      selectNarrativeItem: state.selectNarrativeItem,
    })),
  );

  const data = useMemo(() => buildTimelineChartData(timeline), [timeline]);
  const phases = useMemo(() => getTimelinePhases(timeline), [timeline]);
  const series = useMemo(
    () => getSeriesForView(timeline, timelineView, enabledCapabilityLayerIds, selectedImpactMetric),
    [timeline, timelineView, enabledCapabilityLayerIds, selectedImpactMetric],
  );

  const yMax = useMemo(() => {
    const keys = series.map((item) => item.key);
    const max = data.reduce((highest, point) => {
      const total = timelineView === "career" || timelineView === "impact"
        ? Math.max(...keys.map((key) => Number(point[key] ?? 0)))
        : keys.reduce((sum, key) => sum + Number(point[key] ?? 0), 0);
      return Math.max(highest, total);
    }, 0);
    return Math.max(4, Math.ceil(max * 1.15));
  }, [data, series, timelineView]);

  const isMobile = useIsMobile();
  const selectedPhaseId = selectedNarrativeKind === "phase" ? selectedNarrativeId : null;
  const selectedMilestoneId = selectedNarrativeKind === "milestone" ? selectedNarrativeId : null;

  // Pick top milestones for clickable markers on mobile
  const keyMilestones = useMemo(() => {
    const sorted = [...timeline.milestones]
      .filter((m) => m.importance >= 70)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 3);
    return sorted;
  }, [timeline.milestones]);

  const chartHeight = isMobile ? 280 : 460;
  const chartMargin = isMobile
    ? { top: 12, right: 8, bottom: 4, left: 0 }
    : { top: 22, right: 24, bottom: 6, left: 4 };

  return (
    <div className="space-y-2">
      <div className="rounded-[20px] border border-bm-border/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-2 md:rounded-[28px] md:p-4">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart
            data={data}
            margin={chartMargin}
            onMouseMove={(state) => {
              const payload = state.activePayload?.[0]?.payload as TimelineChartPoint | undefined;
              if (!payload) return;
              if (payload.phase_id) {
                previewNarrativeItem("phase", payload.phase_id);
              }
            }}
            onMouseLeave={() => previewNarrativeItem(null, null)}
            onClick={(state) => {
              const payload = state.activePayload?.[0]?.payload as TimelineChartPoint | undefined;
              if (!payload?.phase_id) return;
              selectNarrativeItem("phase", payload.phase_id, { switchModule: "timeline" });
            }}
          >
            <defs>
              {series.map((item) => (
                <linearGradient key={item.key} id={`resume-grad-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="6%" stopColor={item.color} stopOpacity={item.fillOpacity ?? 0.22} />
                  <stop offset="96%" stopColor={item.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid
              stroke={GRID_STYLE.stroke}
              strokeDasharray={GRID_STYLE.strokeDasharray}
              strokeOpacity={isMobile ? (GRID_STYLE.strokeOpacity ?? 0.3) * 0.5 : GRID_STYLE.strokeOpacity}
              horizontal
              vertical={false}
            />

            {phases.map((phase) => {
              const phaseStart = new Date(`${phase.start_date}T00:00:00Z`).getTime();
              const phaseEnd = new Date(`${phase.end_date ?? timeline.end_date}T00:00:00Z`).getTime();
              const isSelected = selectedPhaseId === phase.phase_id;
              return (
                <ReferenceArea
                  key={phase.phase_id}
                  x1={phaseStart}
                  x2={phaseEnd}
                  fill={phase.band_color}
                  fillOpacity={isSelected ? 0.16 : 0.08}
                  stroke="none"
                  label={isMobile ? undefined : {
                    value: phase.phase_name,
                    position: "insideTopLeft",
                    fill: "rgba(107,114,128,0.7)",
                    fontSize: 10,
                    offset: 8,
                  }}
                />
              );
            })}

            {/* On mobile, only show key milestone lines to reduce clutter */}
            {(isMobile ? keyMilestones : timeline.milestones).map((milestone) => {
              const x = new Date(`${milestone.date}T00:00:00Z`).getTime();
              const isSelected = selectedMilestoneId === milestone.milestone_id;
              return (
                <ReferenceLine
                  key={milestone.milestone_id}
                  x={x}
                  stroke={isSelected ? "#3B82F6" : "rgba(107,114,128,0.45)"}
                  strokeWidth={isSelected ? 2.5 : isMobile ? 1.5 : 1}
                  strokeDasharray={isMobile ? "3 6" : "4 4"}
                  ifOverflow="extendDomain"
                  onClick={() =>
                    selectNarrativeItem("milestone", milestone.milestone_id, { switchModule: "timeline" })
                  }
                />
              );
            })}

            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={isMobile ? tickLabelYearOnly : tickLabel}
              tick={{ ...AXIS_TICK_STYLE, fontSize: isMobile ? 9 : AXIS_TICK_STYLE.fontSize }}
              tickLine={false}
              axisLine={false}
              minTickGap={isMobile ? 48 : 36}
            />
            <YAxis domain={[0, yMax]} tick={false} tickLine={false} axisLine={false} width={0} />

            <Tooltip
              content={
                <CapabilityGraphTooltip
                  timeline={timeline}
                  view={timelineView}
                  series={series}
                />
              }
              cursor={{ stroke: "rgba(107,114,128,0.3)", strokeWidth: 1.2 }}
            />

            {series.map((item) =>
              item.type === "line" ? (
                <Line
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  stroke={item.color}
                  strokeWidth={isMobile ? Math.max((item.strokeWidth ?? 2) + 0.5, 2.5) : item.strokeWidth ?? 2}
                  dot={false}
                  activeDot={{ r: isMobile ? 5 : 4 }}
                />
              ) : (
                <Area
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  stackId={item.stackId}
                  stroke={item.color}
                  strokeWidth={
                    capabilityHoveredLayer === item.key
                      ? 2.8
                      : isMobile
                        ? Math.max((item.strokeWidth ?? 1.6) + 0.6, 2.2)
                        : item.strokeWidth ?? 1.6
                  }
                  fill={`url(#resume-grad-${item.key})`}
                  fillOpacity={capabilityHoveredLayer && capabilityHoveredLayer !== item.key ? 0.12 : 1}
                  isAnimationActive={false}
                  onMouseEnter={() => previewNarrativeItem(timelineView === "capability" ? "layer" : null, timelineView === "capability" ? item.key : null)}
                  onClick={() => {
                    if (timelineView === "capability") {
                      selectNarrativeItem("layer", item.key, { switchModule: "timeline", timelineView: "capability" });
                    }
                  }}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Mobile milestone markers — clickable below graph */}
      {isMobile && keyMilestones.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:hidden">
          {keyMilestones.map((m) => (
            <button
              key={m.milestone_id}
              type="button"
              onClick={() => selectNarrativeItem("milestone", m.milestone_id, { switchModule: "timeline" })}
              className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight transition ${
                selectedMilestoneId === m.milestone_id
                  ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
                  : "border-bm-border/30 bg-bm-surface/20 text-bm-muted hover:text-bm-text"
              }`}
            >
              {m.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
