"use client";

import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { ResumeTimeline, ResumeTimelineViewMode } from "@/lib/bos-api";
import ResumeFallbackCard from "./ResumeFallbackCard";
import CompoundingCapabilityGraph from "./CompoundingCapabilityGraph";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";
import { getImpactMetricOptions } from "./capabilityGraphData";

const VIEW_LABELS: Record<ResumeTimelineViewMode, string> = {
  career: "Career",
  delivery: "Delivery",
  capability: "Capability",
  impact: "Impact",
};

export default function ResumeTimelineModule({ timeline }: { timeline: ResumeTimeline }) {
  const {
    timelineView,
    setTimelineView,
    playStory,
    togglePlayStory,
    playIndex,
    setPlayIndex,
    selectedNarrativeKind,
    selectedNarrativeId,
    enabledCapabilityLayerIds,
    capabilityHoveredLayer,
    selectedImpactMetric,
    setSelectedImpactMetric,
    setCapabilityHoveredLayer,
    toggleCapabilityLayer,
    resetCapabilityLayers,
    clearNarrativeSelection,
    selectNarrativeItem,
  } = useResumeWorkspaceStore(
    useShallow((state) => ({
      timelineView: state.timelineView,
      setTimelineView: state.setTimelineView,
      playStory: state.playStory,
      togglePlayStory: state.togglePlayStory,
      playIndex: state.playIndex,
      setPlayIndex: state.setPlayIndex,
      selectedNarrativeKind: state.selectedNarrativeKind,
      selectedNarrativeId: state.selectedNarrativeId,
      enabledCapabilityLayerIds: state.enabledCapabilityLayerIds,
      capabilityHoveredLayer: state.capabilityHoveredLayer,
      selectedImpactMetric: state.selectedImpactMetric,
      setSelectedImpactMetric: state.setSelectedImpactMetric,
      setCapabilityHoveredLayer: state.setCapabilityHoveredLayer,
      toggleCapabilityLayer: state.toggleCapabilityLayer,
      resetCapabilityLayers: state.resetCapabilityLayers,
      clearNarrativeSelection: state.clearNarrativeSelection,
      selectNarrativeItem: state.selectNarrativeItem,
    })),
  );

  const playSteps = useMemo(() => {
    const playStorySteps = timeline.play_story_steps ?? [];
    const milestones = timeline.milestones ?? [];
    if (playStorySteps.length > 0) return playStorySteps;
    return milestones
      .filter((milestone) => milestone.play_order != null)
      .sort((left, right) => (left.play_order ?? 999) - (right.play_order ?? 999))
      .map((milestone, index) => ({
        step_id: `step-${index + 1}`,
        title: milestone.title,
        milestone_id: milestone.milestone_id,
        phase_id: milestone.phase_id ?? null,
        view: "career" as const,
        description: milestone.summary,
      }));
  }, [timeline]);

  const capabilityLayers = useMemo(
    () => [...(timeline.capability_layers ?? [])].sort((left, right) => left.sort_order - right.sort_order),
    [timeline.capability_layers],
  );

  const activateStep = (index: number) => {
    const step = playSteps[index];
    if (!step) return;
    setPlayIndex(index);
    selectNarrativeItem("milestone", step.milestone_id, {
      switchModule: "timeline",
      timelineView: step.view,
    });
  };

  useEffect(() => {
    if (!playStory || playSteps.length === 0) return undefined;
    const timer = window.setInterval(() => {
      const nextIndex = (playIndex + 1) % playSteps.length;
      activateStep(nextIndex);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [playIndex, playSteps, playStory]);

  const timelineRoles = timeline.roles ?? [];
  const timelinePhases = timeline.phases ?? [];
  const timelineMilestones = timeline.milestones ?? [];
  const timelineViews = timeline.views ?? ["career"];

  if (timelineRoles.length === 0 && timelinePhases.length === 0) {
    return (
      <ResumeFallbackCard
        eyebrow="Timeline"
        title="Timeline temporarily unavailable"
        body="The career timeline is missing enough structured data that it cannot render safely right now."
        tone="warning"
      />
    );
  }

  return (
    <section className="rounded-[20px] border border-bm-border/60 bg-bm-surface/30 p-3 shadow-[0_24px_64px_-48px_rgba(5,12,18,0.95)] md:rounded-[28px] md:p-5">
      <div className="flex items-center justify-between gap-2 md:gap-4">
        <h2 className="shrink-0 text-base font-semibold md:text-lg">
          <span className="md:hidden">Timeline</span>
          <span className="hidden md:inline">Build Journey</span>
        </h2>
        <div className="-mr-1 flex snap-x snap-mandatory gap-1 overflow-x-auto pr-1 md:flex-wrap md:gap-2 md:overflow-visible">
          {(timelineViews.length > 0 ? timelineViews : (["career", "delivery", "capability", "impact"] as ResumeTimelineViewMode[])).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setTimelineView(view)}
              className={`shrink-0 snap-start rounded-full px-2.5 py-1 text-[11px] font-medium transition md:px-3 md:py-1.5 md:text-xs ${
                timelineView === view
                  ? "bg-white/18 font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
                  : "bg-white/5 text-bm-muted hover:bg-white/10 hover:text-bm-text"
              }`}
            >
              {VIEW_LABELS[view]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 md:mt-4">
        <CompoundingCapabilityGraph timeline={timeline} />
      </div>
    </section>
  );
}
