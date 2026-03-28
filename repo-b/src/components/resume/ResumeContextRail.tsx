"use client";

import { fmtMoney, fmtPct, fmtMultiple } from "@/lib/format-utils";
import type {
  ResumeArchitecture,
  ResumeBiEntity,
  ResumeStory,
  ResumeTimeline,
} from "@/lib/bos-api";
import type { ResumeScenarioOutputs } from "./modelingMath";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";

function resolveTimelineSelection(timeline: ResumeTimeline, selectedId: string | null) {
  if (!selectedId) return null;
  for (const milestone of timeline.milestones) {
    if (milestone.milestone_id === selectedId) {
      return {
        title: milestone.title,
        summary: milestone.summary,
        audience: "Leadership and delivery stakeholders",
        beforeState: "Manual, slower, or fragmented operating patterns",
        afterState: milestone.summary,
        linkedModules: milestone.linked_modules,
      };
    }
  }
  for (const role of timeline.roles) {
    if (role.timeline_role_id === selectedId) {
      return {
        title: role.title,
        summary: role.summary,
        audience: role.lane,
        beforeState: role.summary,
        afterState: role.scope,
        linkedModules: ["timeline"],
      };
    }
    for (const initiative of role.initiatives) {
      if (initiative.initiative_id === selectedId) {
        return {
          title: initiative.title,
          summary: initiative.summary,
          audience: initiative.stakeholder_group,
          beforeState: initiative.business_challenge,
          afterState: initiative.measurable_outcome,
          linkedModules: initiative.linked_modules,
        };
      }
    }
  }
  return null;
}

export default function ResumeContextRail({
  timeline,
  architecture,
  stories,
  modelingOutputs,
  biEntity,
}: {
  timeline: ResumeTimeline;
  architecture: ResumeArchitecture;
  stories: ResumeStory[];
  modelingOutputs: ResumeScenarioOutputs;
  biEntity: ResumeBiEntity;
}) {
  const {
    activeModule,
    selectedTimelineId,
    selectedArchitectureNodeId,
    setActiveModule,
  } = useResumeWorkspaceStore((state) => ({
    activeModule: state.activeModule,
    selectedTimelineId: state.selectedTimelineId,
    selectedArchitectureNodeId: state.selectedArchitectureNodeId,
    setActiveModule: state.setActiveModule,
  }));

  const timelineSelection = resolveTimelineSelection(timeline, selectedTimelineId);
  const selectedNode =
    architecture.nodes.find((node) => node.node_id === selectedArchitectureNodeId) ?? null;
  const activeStory = stories.find((story) => story.module === activeModule) ?? stories[0];

  const content =
    activeModule === "timeline" && timelineSelection
      ? {
          title: timelineSelection.title,
          summary: timelineSelection.summary,
          audience: timelineSelection.audience,
          beforeState: timelineSelection.beforeState,
          afterState: timelineSelection.afterState,
          whyItMatters: "The timeline is the narrative spine: each click should make the rest of the system easier to understand.",
          linkedModules: timelineSelection.linkedModules,
        }
      : activeModule === "architecture" && selectedNode
        ? {
            title: selectedNode.label,
            summary: selectedNode.description,
            audience: selectedNode.real_example,
            beforeState: selectedNode.business_problem,
            afterState: selectedNode.outcomes.join(" • "),
            whyItMatters: "This layer only matters because it changed delivery speed, trust, or operating leverage.",
            linkedModules: ["timeline", "bi"],
          }
        : activeModule === "modeling"
          ? {
              title: "Waterfall engine perspective",
              summary: "The model is intentionally simplified but still shows how live parameters reshape IRR, TVPI, and LP/GP economics.",
              audience: "Investment committee, finance, and operations",
              beforeState: "Spreadsheet scenarios were slow and fragile.",
              afterState: `${fmtPct(modelingOutputs.irr)} IRR and ${fmtMultiple(modelingOutputs.tvpi)} TVPI update instantly.`,
              whyItMatters: "It demonstrates financial modeling depth and systems thinking at the same time.",
              linkedModules: ["timeline", "bi", "architecture"],
            }
          : {
              title: biEntity.name,
              summary: biEntity.story,
              audience: "Executives and client-facing delivery leads",
              beforeState: "Data had to be interpreted separately at each level.",
              afterState: `${fmtMoney(Number(biEntity.metrics.portfolio_value ?? 0))} visible value with drill context preserved.`,
              whyItMatters: "This is what productized reporting feels like: filters, drill paths, and breadcrumbs stay coherent.",
              linkedModules: ["timeline", "architecture"],
            };

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-bm-border/60 bg-bm-surface/35 p-5">
        <p className="bm-section-label">Context Rail</p>
        <h2 className="mt-2 text-xl">{content.title}</h2>
        <p className="mt-3 text-sm leading-6 text-bm-muted">{content.summary}</p>

        <div className="mt-4 space-y-3 text-sm">
          <div className="rounded-2xl border border-bm-border/30 bg-black/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Who used it</p>
            <p className="mt-2 text-bm-text">{content.audience}</p>
          </div>
          <div className="rounded-2xl border border-bm-border/30 bg-black/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Before</p>
            <p className="mt-2 text-bm-text">{content.beforeState}</p>
          </div>
          <div className="rounded-2xl border border-bm-border/30 bg-black/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">After</p>
            <p className="mt-2 text-bm-text">{content.afterState}</p>
          </div>
          <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-sky-200/80">Why this matters</p>
            <p className="mt-2 text-sky-50">{content.whyItMatters}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {content.linkedModules.map((module) => (
            <button
              key={module}
              type="button"
              onClick={() => setActiveModule(module as "timeline" | "architecture" | "modeling" | "bi")}
              className="rounded-full border border-bm-border/35 bg-white/5 px-3 py-1.5 text-xs text-bm-muted transition hover:border-white/25 hover:text-bm-text"
            >
              Open {module}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-bm-border/60 bg-bm-surface/35 p-5">
        <p className="bm-section-label">Story Layer</p>
        <h3 className="mt-2 text-lg">{activeStory.title}</h3>
        <p className="mt-3 text-sm text-bm-muted">{activeStory.why_it_matters}</p>
        <div className="mt-4 rounded-2xl border border-bm-border/30 bg-black/10 p-4 text-sm">
          <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Audience</p>
          <p className="mt-2 text-bm-text">{activeStory.audience}</p>
          <p className="mt-4 text-[10px] uppercase tracking-[0.16em] text-bm-muted2">State Change</p>
          <p className="mt-2 text-bm-text">{activeStory.before_state}</p>
          <p className="mt-1 text-bm-text">{activeStory.after_state}</p>
        </div>
      </section>
    </div>
  );
}
