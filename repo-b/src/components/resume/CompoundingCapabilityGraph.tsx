"use client";

import { useMemo } from "react";
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

  const selectedPhaseId = selectedNarrativeKind === "phase" ? selectedNarrativeId : null;
  const selectedMilestoneId = selectedNarrativeKind === "milestone" ? selectedNarrativeId : null;

  return (
    <div className="rounded-[28px] border border-bm-border/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-4">
      <ResponsiveContainer width="100%" height={460}>
        <ComposedChart
          data={data}
          margin={{ top: 22, right: 24, bottom: 6, left: 4 }}
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
            strokeOpacity={GRID_STYLE.strokeOpacity}
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
                label={{
                  value: phase.phase_name,
                  position: "insideTopLeft",
                  fill: "rgba(107,114,128,0.7)",
                  fontSize: 10,
                  offset: 8,
                }}
              />
            );
          })}

          {timeline.milestones.map((milestone) => {
            const x = new Date(`${milestone.date}T00:00:00Z`).getTime();
            const isSelected = selectedMilestoneId === milestone.milestone_id;
            return (
              <ReferenceLine
                key={milestone.milestone_id}
                x={x}
                stroke={isSelected ? "#3B82F6" : "rgba(107,114,128,0.45)"}
                strokeWidth={isSelected ? 2 : 1}
                strokeDasharray="4 4"
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
            tickFormatter={tickLabel}
            tick={AXIS_TICK_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={36}
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
                strokeWidth={item.strokeWidth ?? 2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ) : (
              <Area
                key={item.key}
                type="monotone"
                dataKey={item.key}
                stackId={item.stackId}
                stroke={item.color}
                strokeWidth={capabilityHoveredLayer === item.key ? 2.8 : item.strokeWidth ?? 1.6}
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
  );
}
