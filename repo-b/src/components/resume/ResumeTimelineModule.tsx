"use client";

import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type {
  ResumeTimeline,
  ResumeTimelineInitiative,
  ResumeTimelineMilestone,
  ResumeTimelineRole,
  ResumeTimelineViewMode,
} from "@/lib/bos-api";
import ResumeFallbackCard from "./ResumeFallbackCard";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";

const COLOR_MAP: Record<string, string> = {
  bi: "from-sky-500/85 to-sky-400/60 border-sky-400/60",
  ai: "from-fuchsia-500/85 to-violet-500/60 border-fuchsia-400/60",
  automation: "from-emerald-500/85 to-emerald-400/60 border-emerald-400/60",
  governance: "from-amber-500/85 to-amber-400/60 border-amber-300/60",
  modeling: "from-indigo-500/85 to-purple-500/60 border-indigo-300/60",
  foundation: "from-slate-500/80 to-slate-400/50 border-slate-300/40",
};

type TimelineRow =
  | { id: string; label: string; sublabel: string; kind: "role"; role: ResumeTimelineRole }
  | {
      id: string;
      label: string;
      sublabel: string;
      kind: "group";
      initiatives: ResumeTimelineInitiative[];
    };

function pctBetween(start: Date, end: Date, value: Date) {
  const total = end.getTime() - start.getTime();
  if (!Number.isFinite(total) || total <= 0) return 0;
  return ((value.getTime() - start.getTime()) / total) * 100;
}

function initiativeWindow(
  initiative: ResumeTimelineInitiative,
  start: Date,
  end: Date,
) {
  const initiativeStart = new Date(initiative.start_date);
  const initiativeEnd = new Date(initiative.end_date);
  return {
    left: `${pctBetween(start, end, initiativeStart)}%`,
    width: `${Math.max(pctBetween(start, end, initiativeEnd) - pctBetween(start, end, initiativeStart), 4)}%`,
  };
}

function groupRows(timeline: ResumeTimeline, view: ResumeTimelineViewMode): TimelineRow[] {
  if (view === "career") {
    return timeline.roles.map((role) => ({
      id: role.timeline_role_id,
      label: role.title,
      sublabel: role.company,
      kind: "role",
      role,
    }));
  }

  const initiatives = timeline.roles.flatMap((role) => role.initiatives);
  const groupKey = view === "capability" ? "capability" : view === "impact" ? "impact_area" : "role_id";
  const groups = new Map<string, ResumeTimelineInitiative[]>();

  initiatives.forEach((initiative) => {
    const key = String(initiative[groupKey]);
    const existing = groups.get(key) ?? [];
    existing.push(initiative);
    groups.set(key, existing);
  });

  return [...groups.entries()].map(([key, groupInitiatives]) => ({
    id: key,
    label:
      view === "delivery"
        ? timeline.roles.find((role) => role.timeline_role_id === key)?.title ?? key
        : key.replaceAll("_", " "),
    sublabel:
      view === "capability"
        ? "Capability lens"
        : view === "impact"
          ? "Impact lens"
          : "Delivery lens",
    kind: "group",
    initiatives: groupInitiatives,
  }));
}

export default function ResumeTimelineModule({ timeline }: { timeline: ResumeTimeline }) {
  const {
    timelineView,
    setTimelineView,
    playStory,
    togglePlayStory,
    playIndex,
    setPlayIndex,
    selectedTimelineId,
    selectTimelineItem,
    setActiveModule,
  } = useResumeWorkspaceStore(
    useShallow((state) => ({
      timelineView: state.timelineView,
      setTimelineView: state.setTimelineView,
      playStory: state.playStory,
      togglePlayStory: state.togglePlayStory,
      playIndex: state.playIndex,
      setPlayIndex: state.setPlayIndex,
      selectedTimelineId: state.selectedTimelineId,
      selectTimelineItem: state.selectTimelineItem,
      setActiveModule: state.setActiveModule,
    })),
  );

  const rows = useMemo(() => groupRows(timeline, timelineView), [timeline, timelineView]);
  const rangeStart = useMemo(() => new Date(timeline.start_date), [timeline.start_date]);
  const rangeEnd = useMemo(() => new Date(timeline.end_date), [timeline.end_date]);
  const hasRoles = timeline.roles.length > 0;
  const hasMilestones = timeline.milestones.length > 0;
  const hasValidRange =
    Number.isFinite(rangeStart.getTime()) &&
    Number.isFinite(rangeEnd.getTime()) &&
    rangeEnd.getTime() >= rangeStart.getTime();
  const years = useMemo(() => {
    if (!hasValidRange) return [] as number[];
    const startYear = rangeStart.getFullYear();
    const endYear = rangeEnd.getFullYear();
    return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
  }, [hasValidRange, rangeStart, rangeEnd]);

  useEffect(() => {
    if (!playStory || !hasMilestones) return undefined;
    const timer = window.setInterval(() => {
      const nextIndex = (playIndex + 1) % timeline.milestones.length;
      const nextMilestone = timeline.milestones[nextIndex];
      setPlayIndex(nextIndex);
      selectTimelineItem(nextMilestone.milestone_id);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [hasMilestones, playStory, playIndex, timeline.milestones, setPlayIndex, selectTimelineItem]);

  if (!hasRoles || !hasValidRange || rows.length === 0) {
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="bm-section-label">Build Journey</p>
          <h2 className="mt-2 text-2xl">Execution timeline as system backbone</h2>
          <p className="mt-2 max-w-3xl text-sm text-bm-muted">
            Career progression, initiative overlap, and milestone moments are all wired into the architecture, waterfall, and BI modules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["career", "delivery", "capability", "impact"] as ResumeTimelineViewMode[]).map((view) => (
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
              {view === "career" ? "Career View" : view === "delivery" ? "Delivery View" : view === "capability" ? "Capability View" : "Impact View"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-bm-border/40 bg-black/10 px-4 py-3 text-xs text-bm-muted2">
        <span className="font-semibold text-bm-text">Play Story</span>
        <button
          type="button"
          disabled={!hasMilestones}
          onClick={() => {
            if (!playStory) {
              const activeMilestone = timeline.milestones[playIndex] ?? timeline.milestones[0];
              if (activeMilestone) selectTimelineItem(activeMilestone.milestone_id);
            }
            togglePlayStory();
          }}
          className={`rounded-full border border-bm-border/40 px-3 py-1 transition hover:border-bm-border/70 hover:text-bm-text ${!hasMilestones ? "cursor-not-allowed opacity-40" : ""}`}
        >
          {playStory ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          disabled={!hasMilestones}
          onClick={() => {
            if (!hasMilestones) return;
            const nextIndex = (playIndex - 1 + timeline.milestones.length) % timeline.milestones.length;
            setPlayIndex(nextIndex);
            selectTimelineItem(timeline.milestones[nextIndex].milestone_id);
          }}
          className={`rounded-full border border-bm-border/40 px-3 py-1 transition hover:border-bm-border/70 hover:text-bm-text ${!hasMilestones ? "cursor-not-allowed opacity-40" : ""}`}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!hasMilestones}
          onClick={() => {
            if (!hasMilestones) return;
            const nextIndex = (playIndex + 1) % timeline.milestones.length;
            setPlayIndex(nextIndex);
            selectTimelineItem(timeline.milestones[nextIndex].milestone_id);
          }}
          className={`rounded-full border border-bm-border/40 px-3 py-1 transition hover:border-bm-border/70 hover:text-bm-text ${!hasMilestones ? "cursor-not-allowed opacity-40" : ""}`}
        >
          Next
        </button>
        {timeline.milestones[playIndex] ? (
          <span className="ml-auto text-bm-text">{timeline.milestones[playIndex].title}</span>
        ) : (
          <span className="ml-auto">Timeline milestones unavailable</span>
        )}
      </div>

      <div className="mt-6 overflow-x-auto">
        <div className="min-w-[1100px]">
          <div className="relative rounded-[24px] border border-bm-border/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-4">
            <div className="ml-[280px] flex items-center gap-0 border-b border-bm-border/20 pb-3">
              {years.map((year) => (
                <div key={year} className="relative flex-1">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">{year}</span>
                  <div className="mt-2 h-4 border-l border-dashed border-white/10" />
                </div>
              ))}
            </div>

            <div className="pointer-events-none absolute left-[280px] right-4 top-[58px] h-8">
              {timeline.milestones.map((milestone) => {
                const left = pctBetween(rangeStart, rangeEnd, new Date(milestone.date));
                return (
                  <div
                    key={milestone.milestone_id}
                    className="absolute top-0"
                    style={{ left: `${left}%` }}
                  >
                    <div className={`h-3 w-3 rounded-full border-2 ${selectedTimelineId === milestone.milestone_id ? "border-white bg-white shadow-[0_0_24px_rgba(255,255,255,0.45)]" : "border-amber-300 bg-amber-400/80"}`} />
                  </div>
                );
              })}
            </div>

            <div className="mt-6 space-y-4">
              {rows.map((row) => (
                <div key={row.id} className="grid grid-cols-[260px_minmax(0,1fr)] gap-5">
                  <div className="rounded-2xl border border-bm-border/35 bg-white/5 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">{row.sublabel}</p>
                    <h3 className="mt-2 text-base">{row.label}</h3>
                    {row.kind === "role" ? (
                      <>
                        <p className="mt-2 text-sm text-bm-muted">{row.role.summary}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {row.role.technologies.slice(0, 4).map((tech) => (
                            <span key={tech} className="rounded-full border border-bm-border/40 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
                              {tech}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-bm-muted">
                        {row.initiatives.length} initiatives grouped into this lens.
                      </p>
                    )}
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-bm-border/35 bg-black/10 px-4 py-3">
                    {row.kind === "role" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => selectTimelineItem(row.role.timeline_role_id)}
                          className={`absolute left-4 right-4 top-3 h-9 rounded-xl border text-left transition ${
                            selectedTimelineId === row.role.timeline_role_id
                              ? "border-white/40 bg-white/12"
                              : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/8"
                          }`}
                          style={{
                            left: initiativeWindow(
                              {
                                initiative_id: row.role.timeline_role_id,
                                role_id: row.role.timeline_role_id,
                                title: row.role.title,
                                summary: row.role.summary,
                                team_context: row.role.scope,
                                business_challenge: row.role.summary,
                                measurable_outcome: row.role.scope,
                                stakeholder_group: row.role.lane,
                                scale: "Role scope",
                                architecture: row.role.scope,
                                start_date: row.role.start_date,
                                end_date: row.role.end_date ?? timeline.end_date,
                                category: "foundation",
                                capability: "Career",
                                impact_area: "career",
                                technologies: row.role.technologies,
                                impact_tag: row.role.company,
                                linked_modules: ["timeline"],
                                linked_architecture_node_ids: [],
                                linked_bi_entity_ids: [],
                                linked_model_preset: null,
                              },
                              rangeStart,
                              rangeEnd,
                            ).left,
                            width: initiativeWindow(
                              {
                                initiative_id: row.role.timeline_role_id,
                                role_id: row.role.timeline_role_id,
                                title: row.role.title,
                                summary: row.role.summary,
                                team_context: row.role.scope,
                                business_challenge: row.role.summary,
                                measurable_outcome: row.role.scope,
                                stakeholder_group: row.role.lane,
                                scale: "Role scope",
                                architecture: row.role.scope,
                                start_date: row.role.start_date,
                                end_date: row.role.end_date ?? timeline.end_date,
                                category: "foundation",
                                capability: "Career",
                                impact_area: "career",
                                technologies: row.role.technologies,
                                impact_tag: row.role.company,
                                linked_modules: ["timeline"],
                                linked_architecture_node_ids: [],
                                linked_bi_entity_ids: [],
                                linked_model_preset: null,
                              },
                              rangeStart,
                              rangeEnd,
                            ).width,
                          }}
                        >
                          <span className="inline-flex h-full items-center px-4 text-sm font-medium text-bm-text">
                            {row.role.title}
                          </span>
                        </button>
                        <div className="mt-14 space-y-3 pb-2">
                          {row.role.initiatives.map((initiative) => {
                            const style = initiativeWindow(initiative, rangeStart, rangeEnd);
                            const color = COLOR_MAP[initiative.category] ?? COLOR_MAP.foundation;
                            const isSelected = selectedTimelineId === initiative.initiative_id;
                            return (
                              <div key={initiative.initiative_id} className="relative h-12">
                                <button
                                  type="button"
                                  onClick={() => selectTimelineItem(initiative.initiative_id)}
                                  className={`group absolute h-10 rounded-xl border bg-gradient-to-r px-3 text-left text-sm text-white shadow-lg transition hover:-translate-y-0.5 ${color} ${isSelected ? "ring-2 ring-white/70" : ""}`}
                                  style={style}
                                >
                                  <span className="block truncate font-medium">{initiative.title}</span>
                                  <span className="block truncate text-[11px] text-white/75">{initiative.impact_tag}</span>
                                  <span className="pointer-events-none absolute left-0 top-full z-20 mt-3 hidden w-72 rounded-2xl border border-bm-border/40 bg-[#08101A] p-4 text-left text-xs leading-5 text-bm-muted shadow-2xl group-hover:block">
                                    <span className="text-sm font-semibold text-bm-text">{initiative.title}</span>
                                    <span className="mt-2 block">{initiative.summary}</span>
                                    <span className="mt-2 block text-bm-text">Challenge: {initiative.business_challenge}</span>
                                    <span className="mt-1 block text-bm-text">Outcome: {initiative.measurable_outcome}</span>
                                  </span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3 py-2">
                        {row.initiatives.map((initiative) => {
                          const style = initiativeWindow(initiative, rangeStart, rangeEnd);
                          const color = COLOR_MAP[initiative.category] ?? COLOR_MAP.foundation;
                          const isSelected = selectedTimelineId === initiative.initiative_id;
                          return (
                            <div key={initiative.initiative_id} className="relative h-12">
                              <button
                                type="button"
                                onClick={() => selectTimelineItem(initiative.initiative_id)}
                                className={`group absolute h-10 rounded-xl border bg-gradient-to-r px-3 text-left text-sm text-white transition hover:-translate-y-0.5 ${color} ${isSelected ? "ring-2 ring-white/70" : ""}`}
                                style={style}
                              >
                                <span className="block truncate font-medium">{initiative.title}</span>
                                <span className="block truncate text-[11px] text-white/75">{initiative.impact_tag}</span>
                                <span className="pointer-events-none absolute left-0 top-full z-20 mt-3 hidden w-72 rounded-2xl border border-bm-border/40 bg-[#08101A] p-4 text-left text-xs leading-5 text-bm-muted shadow-2xl group-hover:block">
                                  <span className="text-sm font-semibold text-bm-text">{initiative.title}</span>
                                  <span className="mt-2 block">{initiative.summary}</span>
                                  <span className="mt-2 block text-bm-text">Team: {initiative.team_context}</span>
                                  <span className="mt-1 block text-bm-text">Outcome: {initiative.measurable_outcome}</span>
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-t border-bm-border/20 pt-4 text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
              {Object.entries({
                "Blue": "BI / analytics",
                "Purple": "AI / platform",
                "Green": "Automation / production",
                "Amber": "Governance / operating model",
                "Slate": "Foundational role scope",
              }).map(([label, copy]) => (
                <span key={label} className="rounded-full border border-bm-border/35 px-3 py-1">
                  {label} · {copy}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {hasMilestones ? (
          timeline.milestones.map((milestone) => (
            <button
              key={milestone.milestone_id}
              type="button"
              onClick={() => {
                selectTimelineItem(milestone.milestone_id);
                setActiveModule("timeline");
              }}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                selectedTimelineId === milestone.milestone_id
                  ? "border-white/50 bg-white/12 text-white"
                  : "border-bm-border/35 bg-white/5 text-bm-muted hover:border-white/25 hover:text-bm-text"
              }`}
            >
              {milestone.title}
            </button>
          ))
        ) : (
          <p className="text-sm text-bm-muted2">Timeline milestones are temporarily unavailable, so guided playback is paused.</p>
        )}
      </div>
    </section>
  );
}
