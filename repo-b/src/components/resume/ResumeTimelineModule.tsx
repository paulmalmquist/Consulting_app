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
    <section className="rounded-[28px] border border-bm-border/60 bg-bm-surface/30 p-5 shadow-[0_24px_64px_-48px_rgba(5,12,18,0.95)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="bm-section-label">Build Journey</p>
          <h2 className="mt-2 text-2xl">Execution timeline as system backbone</h2>
          <p className="mt-2 text-sm text-bm-muted">
            The graph now controls the story: phases, milestones, capability layers, and KPI evidence all resolve from the same narrative model.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(timelineViews.length > 0 ? timelineViews : (["career", "delivery", "capability", "impact"] as ResumeTimelineViewMode[])).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setTimelineView(view)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                timelineView === view
                  ? "bg-white/12 text-white"
                  : "bg-white/5 text-bm-muted hover:bg-white/10 hover:text-bm-text"
              }`}
            >
              {VIEW_LABELS[view]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-bm-border/40 bg-black/10 px-4 py-3 text-xs text-bm-muted2">
        <span className="font-semibold text-bm-text">Play Story</span>
        <button
          type="button"
          disabled={playSteps.length === 0}
          onClick={() => {
            if (!playStory && playSteps.length > 0) {
              activateStep(playIndex < playSteps.length ? playIndex : 0);
            }
            togglePlayStory();
          }}
          className={`rounded-full border border-bm-border/40 px-3 py-1 transition hover:border-bm-border/70 hover:text-bm-text ${playSteps.length === 0 ? "cursor-not-allowed opacity-40" : ""}`}
        >
          {playStory ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          disabled={playSteps.length === 0}
          onClick={() => {
            if (playSteps.length === 0) return;
            const nextIndex = (playIndex - 1 + playSteps.length) % playSteps.length;
            activateStep(nextIndex);
          }}
          className={`rounded-full border border-bm-border/40 px-3 py-1 transition hover:border-bm-border/70 hover:text-bm-text ${playSteps.length === 0 ? "cursor-not-allowed opacity-40" : ""}`}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={playSteps.length === 0}
          onClick={() => {
            if (playSteps.length === 0) return;
            const nextIndex = (playIndex + 1) % playSteps.length;
            activateStep(nextIndex);
          }}
          className={`rounded-full border border-bm-border/40 px-3 py-1 transition hover:border-bm-border/70 hover:text-bm-text ${playSteps.length === 0 ? "cursor-not-allowed opacity-40" : ""}`}
        >
          Next
        </button>
        <button
          type="button"
          disabled={playSteps.length === 0}
          onClick={() => {
            if (playSteps.length === 0) return;
            activateStep(0);
          }}
          className={`rounded-full border border-bm-border/40 px-3 py-1 transition hover:border-bm-border/70 hover:text-bm-text ${playSteps.length === 0 ? "cursor-not-allowed opacity-40" : ""}`}
        >
          Restart
        </button>
        <button
          type="button"
          onClick={clearNarrativeSelection}
          className="ml-auto rounded-full border border-bm-border/40 px-3 py-1 transition hover:border-bm-border/70 hover:text-bm-text"
        >
          Clear Selection
        </button>
      </div>

      {timelineView === "capability" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {capabilityLayers.map((layer) => {
            const enabled = enabledCapabilityLayerIds.includes(layer.layer_id);
            const selected = selectedNarrativeKind === "layer" && selectedNarrativeId === layer.layer_id;
            return (
              <button
                key={layer.layer_id}
                type="button"
                onClick={() => toggleCapabilityLayer(layer.layer_id)}
                onMouseEnter={() => setCapabilityHoveredLayer(layer.layer_id)}
                onMouseLeave={() => setCapabilityHoveredLayer(null)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  enabled ? "text-white" : "text-bm-muted2 opacity-50"
                } ${selected ? "ring-2 ring-white/60" : ""}`}
                style={{ borderColor: `${layer.color}80`, backgroundColor: enabled ? `${layer.color}22` : "rgba(255,255,255,0.03)" }}
              >
                {layer.name}
                {capabilityHoveredLayer === layer.layer_id ? " · hover" : ""}
              </button>
            );
          })}
          <button
            type="button"
            onClick={resetCapabilityLayers}
            className="rounded-full border border-bm-border/35 bg-white/5 px-3 py-1.5 text-xs text-bm-muted transition hover:border-white/25 hover:text-bm-text"
          >
            Reset layers
          </button>
        </div>
      ) : null}

      {timelineView === "impact" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {getImpactMetricOptions().map((metric) => (
            <button
              key={metric.key}
              type="button"
              onClick={() => setSelectedImpactMetric(metric.key)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                selectedImpactMetric === metric.key ? "text-white ring-2 ring-white/50" : "text-bm-muted"
              }`}
              style={{ borderColor: `${metric.color}66`, backgroundColor: selectedImpactMetric === metric.key ? `${metric.color}22` : "rgba(255,255,255,0.03)" }}
            >
              {metric.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-5">
        <CompoundingCapabilityGraph timeline={timeline} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {timelineMilestones.map((milestone) => {
          const selected = selectedNarrativeKind === "milestone" && selectedNarrativeId === milestone.milestone_id;
          return (
            <button
              key={milestone.milestone_id}
              type="button"
              onClick={() => selectNarrativeItem("milestone", milestone.milestone_id, { switchModule: "timeline" })}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                selected
                  ? "border-white/50 bg-white/12 text-white"
                  : "border-bm-border/35 bg-white/5 text-bm-muted hover:border-white/25 hover:text-bm-text"
              }`}
            >
              {milestone.title}
            </button>
          );
        })}
      </div>
    </section>
  );
}
