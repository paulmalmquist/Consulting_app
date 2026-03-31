"use client";

import type {
  ResumeCapabilityLayer,
  ResumeCareerPhase,
  ResumeMetricAnchor,
  ResumeTimeline,
  ResumeTimelineInitiative,
  ResumeTimelineMilestone,
  ResumeTimelineRole,
  ResumeTimelineViewMode,
} from "@/lib/bos-api";

export type NarrativeSelectionKind = "phase" | "milestone" | "initiative" | "layer" | "metric" | "role";
export type ImpactMetricKey =
  | "impact_composite"
  | "impact_time_saved"
  | "impact_volume_supported"
  | "impact_cycle_time_reduction"
  | "impact_systems_replaced";

export type TimelineChartPoint = {
  date: string;
  label: string;
  ts: number;
  phase_id: string | null;
  phase_name: string | null;
  phase_company: string | null;
  career_scope: number;
  impact_composite: number;
  impact_time_saved: number;
  impact_volume_supported: number;
  impact_cycle_time_reduction: number;
  impact_systems_replaced: number;
  delivery_foundation: number;
  delivery_bi: number;
  delivery_automation: number;
  delivery_modeling: number;
  delivery_ai: number;
  [key: string]: string | number | null;
};

export type NarrativeSeries = {
  key: string;
  label: string;
  color: string;
  stackId?: string;
  strokeWidth?: number;
  fillOpacity?: number;
  type?: "area" | "line";
};

const DELIVERY_SERIES_META = [
  { key: "delivery_foundation", label: "Foundation", color: "#64748B" },
  { key: "delivery_bi", label: "BI Delivery", color: "#3B82F6" },
  { key: "delivery_automation", label: "Automation", color: "#22C55E" },
  { key: "delivery_modeling", label: "Modeling", color: "#6366F1" },
  { key: "delivery_ai", label: "AI Systems", color: "#A855F7" },
] as const;

const IMPACT_SERIES_META = [
  { key: "impact_composite", label: "Composite Impact", color: "#6366F1" },
  { key: "impact_time_saved", label: "Time Saved", color: "#22C55E" },
  { key: "impact_volume_supported", label: "Volume Supported", color: "#14B8A6" },
  { key: "impact_cycle_time_reduction", label: "Cycle Reduction", color: "#F97316" },
  { key: "impact_systems_replaced", label: "Systems Replaced", color: "#6366F1" },
] as const;

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function monthRange(startIso: string, endIso: string): Date[] {
  const start = parseDate(startIso);
  const end = parseDate(endIso);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const limit = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const months: Date[] = [];

  while (cursor <= limit) {
    months.push(new Date(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function durationProgress(point: Date, startIso: string, endIso: string) {
  const start = parseDate(startIso).getTime();
  const end = parseDate(endIso).getTime();
  const current = point.getTime();
  if (current <= start) return 0;
  if (end <= start) return current >= start ? 1 : 0;
  if (current >= end) return 1;
  return clamp((current - start) / (end - start));
}

function isWithinRange(point: Date, startIso: string, endIso: string) {
  const current = point.getTime();
  return current >= parseDate(startIso).getTime() && current <= parseDate(endIso).getTime();
}

function mapDeliveryBucket(category: string): keyof Pick<
  TimelineChartPoint,
  "delivery_foundation" | "delivery_bi" | "delivery_automation" | "delivery_modeling" | "delivery_ai"
> {
  if (category === "bi") return "delivery_bi";
  if (category === "automation" || category === "governance") return "delivery_automation";
  if (category === "modeling") return "delivery_modeling";
  if (category === "ai") return "delivery_ai";
  return "delivery_foundation";
}

function roleScopeForPoint(point: Date, roles: ResumeTimelineRole[]) {
  let scope = 0;
  roles.forEach((role, index) => {
    const endIso = role.end_date ?? role.start_date;
    if (isWithinRange(point, role.start_date, endIso)) {
      scope = Math.max(scope, index + 1);
    }
  });
  return scope;
}

function phaseForPoint(point: Date, phases: ResumeCareerPhase[]) {
  const current = point.getTime();
  return (
    phases.find((phase) => {
      const start = parseDate(phase.start_date).getTime();
      const end = parseDate(phase.end_date ?? phase.start_date).getTime();
      return current >= start && current <= end;
    }) ?? null
  );
}

function contributionWeight(importance: number) {
  return Math.max(0.8, importance / 35);
}

function milestoneImpactValue(metrics: Record<string, string | number>) {
  const timeSaved = Number(metrics.time_saved ?? 0);
  const volumeSupported = Number(metrics.volume_supported ?? 0);
  const cycleReduction =
    Number(metrics.cycle_time_reduction ?? metrics.reporting_cycle_reduction ?? metrics.reporting_cycle ?? 0);
  const systemsReplaced = Number(metrics.systems_replaced ?? 0);
  return {
    impact_time_saved: timeSaved,
    impact_volume_supported: volumeSupported,
    impact_cycle_time_reduction: cycleReduction,
    impact_systems_replaced: systemsReplaced,
    impact_composite:
      timeSaved * 0.12 + volumeSupported * 0.02 + cycleReduction * 1.6 + systemsReplaced * 3,
  };
}

export function getTimelinePhases(timeline: ResumeTimeline) {
  return [...timeline.phases].sort((left, right) => left.display_order - right.display_order);
}

export function getCapabilityLayerById(timeline: ResumeTimeline, layerId: string) {
  return timeline.capability_layers.find((layer) => layer.layer_id === layerId) ?? null;
}

export function getMetricAnchorByKey(timeline: ResumeTimeline, metricKey: string) {
  return timeline.metric_anchors.find((anchor) => anchor.hero_metric_key === metricKey) ?? null;
}

export function getMilestoneById(timeline: ResumeTimeline, milestoneId: string) {
  return timeline.milestones.find((milestone) => milestone.milestone_id === milestoneId) ?? null;
}

export function getPhaseById(timeline: ResumeTimeline, phaseId: string) {
  return timeline.phases.find((phase) => phase.phase_id === phaseId) ?? null;
}

export function getVisibleCapabilityLayerIds(timeline: ResumeTimeline) {
  return timeline.capability_layers.filter((layer) => layer.is_visible).map((layer) => layer.layer_id);
}

export function buildTimelineChartData(timeline: ResumeTimeline): TimelineChartPoint[] {
  const phases = getTimelinePhases(timeline);
  const months = monthRange(timeline.start_date, timeline.end_date);
  const layerIds = timeline.capability_layers.map((layer) => layer.layer_id);

  return months.map((month) => {
    const point: TimelineChartPoint = {
      date: monthKey(month),
      label: monthLabel(month),
      ts: month.getTime(),
      phase_id: null,
      phase_name: null,
      phase_company: null,
      career_scope: roleScopeForPoint(month, timeline.roles),
      impact_composite: 0,
      impact_time_saved: 0,
      impact_volume_supported: 0,
      impact_cycle_time_reduction: 0,
      impact_systems_replaced: 0,
      delivery_foundation: 0,
      delivery_bi: 0,
      delivery_automation: 0,
      delivery_modeling: 0,
      delivery_ai: 0,
    };

    layerIds.forEach((layerId) => {
      point[layerId] = 0;
    });

    const activePhase = phaseForPoint(month, phases);
    if (activePhase) {
      point.phase_id = activePhase.phase_id;
      point.phase_name = activePhase.phase_name;
      point.phase_company = activePhase.company;
    }

    timeline.initiatives.forEach((initiative) => {
      const importance = contributionWeight(initiative.importance);
      const progress = durationProgress(month, initiative.start_date, initiative.end_date);

      if (progress > 0) {
        initiative.capability_tags.forEach((tag) => {
          point[tag] = Number(point[tag] ?? 0) + importance * progress;
        });
      }

      if (isWithinRange(month, initiative.start_date, initiative.end_date)) {
        const bucket = mapDeliveryBucket(initiative.category);
        point[bucket] = Number(point[bucket]) + initiative.importance / 100;
      }
    });

    timeline.milestones.forEach((milestone) => {
      if (month >= parseDate(milestone.date)) {
        const impact = milestoneImpactValue(milestone.metrics_json);
        point.impact_time_saved += impact.impact_time_saved;
        point.impact_volume_supported += impact.impact_volume_supported;
        point.impact_cycle_time_reduction += impact.impact_cycle_time_reduction;
        point.impact_systems_replaced += impact.impact_systems_replaced;
        point.impact_composite += impact.impact_composite;

        milestone.capability_tags.forEach((tag) => {
          point[tag] = Number(point[tag] ?? 0) + contributionWeight(milestone.importance) * 0.5;
        });
      }
    });

    return point;
  });
}

export function getSeriesForView(
  timeline: ResumeTimeline,
  view: ResumeTimelineViewMode,
  enabledLayerIds: string[],
  impactMetric: ImpactMetricKey,
): NarrativeSeries[] {
  if (view === "delivery") {
    return DELIVERY_SERIES_META.map((series) => ({
      ...series,
      stackId: "delivery",
      fillOpacity: 0.26,
      strokeWidth: 1.5,
      type: "area",
    }));
  }

  if (view === "capability") {
    return timeline.capability_layers
      .filter((layer) => enabledLayerIds.includes(layer.layer_id))
      .map((layer) => ({
        key: layer.layer_id,
        label: layer.name,
        color: layer.color,
        stackId: "capability",
        fillOpacity: 0.24,
        strokeWidth: 1.8,
        type: "area",
      }));
  }

  if (view === "impact") {
    return IMPACT_SERIES_META.filter((series) => series.key === impactMetric).map((series) => ({
      ...series,
      strokeWidth: 2.4,
      fillOpacity: 0.18,
      type: "area",
    }));
  }

  return [
    {
      key: "career_scope",
      label: "Career Scope",
      color: "#3B82F6",
      strokeWidth: 2.4,
      fillOpacity: 0.22,
      type: "area",
    },
  ];
}

export function getPhaseRangeBounds(phase: ResumeCareerPhase) {
  return {
    start: parseDate(phase.start_date).getTime(),
    end: parseDate(phase.end_date ?? phase.start_date).getTime(),
  };
}

export function getMilestonesForPhase(timeline: ResumeTimeline, phaseId: string) {
  return timeline.milestones.filter((milestone) => milestone.phase_id === phaseId);
}

export function getRepresentativeTimelineId(
  timeline: ResumeTimeline,
  selectionKind: NarrativeSelectionKind,
  selectionId: string,
) {
  if (selectionKind === "milestone" || selectionKind === "initiative" || selectionKind === "role") {
    return selectionId;
  }

  if (selectionKind === "phase") {
    return (
      getMilestonesForPhase(timeline, selectionId).sort((left, right) => {
        const leftOrder = left.play_order ?? 999;
        const rightOrder = right.play_order ?? 999;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return parseDate(left.date).getTime() - parseDate(right.date).getTime();
      })[0]?.milestone_id ??
      timeline.initiatives.find((initiative) => initiative.phase_id === selectionId)?.initiative_id ??
      null
    );
  }

  if (selectionKind === "layer") {
    return (
      timeline.milestones.find((milestone) => milestone.capability_tags.includes(selectionId))?.milestone_id ??
      timeline.initiatives.find((initiative) => initiative.capability_tags.includes(selectionId))?.initiative_id ??
      null
    );
  }

  if (selectionKind === "metric") {
    const anchor = getMetricAnchorByKey(timeline, selectionId);
    if (!anchor) return null;
    return (
      anchor.linked_milestone_ids[0] ??
      anchor.linked_phase_ids[0] ??
      anchor.linked_capability_layer_ids[0] ??
      null
    );
  }

  return null;
}

export function getImpactMetricLabel(metric: ImpactMetricKey) {
  return IMPACT_SERIES_META.find((series) => series.key === metric)?.label ?? "Composite Impact";
}

export function getImpactMetricOptions(): Array<{ key: ImpactMetricKey; label: string; color: string }> {
  return IMPACT_SERIES_META.map((series) => ({
    key: series.key,
    label: series.label,
    color: series.color,
  }));
}

export function getRoleById(timeline: ResumeTimeline, roleId: string) {
  return timeline.roles.find((role) => role.timeline_role_id === roleId) ?? null;
}

export function getInitiativeById(timeline: ResumeTimeline, initiativeId: string) {
  return timeline.initiatives.find((initiative) => initiative.initiative_id === initiativeId) ?? null;
}

export function getTimelineItemTitle(timeline: ResumeTimeline, kind: NarrativeSelectionKind, id: string | null) {
  if (!id) return null;
  if (kind === "phase") return getPhaseById(timeline, id)?.phase_name ?? null;
  if (kind === "milestone") return getMilestoneById(timeline, id)?.title ?? null;
  if (kind === "initiative") return getInitiativeById(timeline, id)?.title ?? null;
  if (kind === "metric") return getMetricAnchorByKey(timeline, id)?.title ?? null;
  if (kind === "layer") return getCapabilityLayerById(timeline, id)?.name ?? null;
  if (kind === "role") return getRoleById(timeline, id)?.title ?? null;
  return null;
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
