"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { fmtMoney, fmtPct, fmtMultiple } from "@/lib/format-utils";
import type {
  ResumeAccomplishmentCard,
  ResumeArchitecture,
  ResumeBiEntity,
  ResumeMetricAnchor,
  ResumeStory,
  ResumeTimeline,
} from "@/lib/bos-api";
import type { ResumeScenarioOutputs } from "./modelingMath";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";

type SelectionKind = "phase" | "milestone" | "initiative" | "layer" | "metric" | "role" | null;

function SnapshotMiniDiagram({ spec }: { spec: Record<string, unknown> }) {
  const before = (spec.before as Record<string, unknown> | undefined) ?? {};
  const after = (spec.after as Record<string, unknown> | undefined) ?? {};
  const beforeNodes = Array.isArray(before.nodes) ? before.nodes.map(String) : [];
  const afterNodes = Array.isArray(after.nodes) ? after.nodes.map(String) : [];

  if (beforeNodes.length === 0 && afterNodes.length === 0) return null;

  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div className="rounded-2xl border border-rose-300/20 bg-rose-500/8 p-3">
        <p className="text-[10px] uppercase tracking-[0.16em] text-rose-100/80">
          {String(before.label ?? "Before")}
        </p>
        <div className="mt-3 space-y-2">
          {beforeNodes.map((node) => (
            <div key={node} className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm text-bm-text">
              {node}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/8 p-3">
        <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-100/80">
          {String(after.label ?? "After")}
        </p>
        <div className="mt-3 space-y-2">
          {afterNodes.map((node) => (
            <div key={node} className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm text-bm-text">
              {node}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatMetricEntry([key, value]: [string, string | number]) {
  const label = key.replaceAll("_", " ");
  return `${label}: ${value}`;
}

function getMetricCards(anchor: ResumeMetricAnchor, cards: ResumeAccomplishmentCard[]) {
  return cards.filter((card) => {
    if (card.metric_key === anchor.hero_metric_key) return true;
    if (card.milestone_id && anchor.linked_milestone_ids.includes(card.milestone_id)) return true;
    if (card.phase_id && anchor.linked_phase_ids.includes(card.phase_id)) return true;
    return card.capability_tags.some((tag) => anchor.linked_capability_layer_ids.includes(tag));
  });
}

function buildFallbackSelectionSummary(
  timeline: ResumeTimeline,
  kind: SelectionKind,
  id: string | null,
) {
  if (!kind || !id) return null;

  if (kind === "phase") {
    const phase = timeline.phases.find((item) => item.phase_id === id);
    if (!phase) return null;
    return {
      title: phase.phase_name,
      summary: phase.description ?? "Career phase",
      before: "Fragmented workflows and disconnected execution patterns.",
      after: "A stronger operating system and clearer decision support.",
      stakeholders: phase.company,
    };
  }

  if (kind === "milestone") {
    const milestone = timeline.milestones.find((item) => item.milestone_id === id);
    if (!milestone) return null;
    return {
      title: milestone.title,
      summary: milestone.summary,
      before: "Manual or fragmented workflow before the inflection point.",
      after: milestone.summary,
      stakeholders: milestone.capability_tags.join(" • ") || "Cross-functional stakeholders",
    };
  }

  if (kind === "initiative") {
    const initiative = timeline.initiatives.find((item) => item.initiative_id === id);
    if (!initiative) return null;
    return {
      title: initiative.title,
      summary: initiative.summary,
      before: initiative.business_challenge,
      after: initiative.measurable_outcome,
      stakeholders: initiative.stakeholder_group,
    };
  }

  if (kind === "role") {
    const role = timeline.roles.find((item) => item.timeline_role_id === id);
    if (!role) return null;
    return {
      title: role.title,
      summary: role.summary,
      before: role.summary,
      after: role.scope,
      stakeholders: role.company,
    };
  }

  if (kind === "layer") {
    const layer = timeline.capability_layers.find((item) => item.layer_id === id);
    if (!layer) return null;
    return {
      title: layer.name,
      summary: layer.description ?? "Capability layer",
      before: "This capability existed in isolated or immature form.",
      after: "It became an explicit reusable layer in the operating system.",
      stakeholders: "Operators, executives, and delivery stakeholders",
    };
  }

  if (kind === "metric") {
    const anchor = timeline.metric_anchors.find((item) => item.hero_metric_key === id);
    if (!anchor) return null;
    return {
      title: anchor.title,
      summary: anchor.narrative_hint ?? "Metric anchor",
      before: "The headline claim needed evidence.",
      after: "The timeline now reveals the specific region and accomplishments behind the KPI.",
      stakeholders: "Executive and hiring stakeholders",
    };
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
    selectedNarrativeKind,
    selectedNarrativeId,
    hoveredNarrativeKind,
    hoveredNarrativeId,
    setActiveModule,
  } = useResumeWorkspaceStore(
    useShallow((state) => ({
      activeModule: state.activeModule,
      selectedNarrativeKind: state.selectedNarrativeKind,
      selectedNarrativeId: state.selectedNarrativeId,
      hoveredNarrativeKind: state.hoveredNarrativeKind,
      hoveredNarrativeId: state.hoveredNarrativeId,
      setActiveModule: state.setActiveModule,
    })),
  );

  const effectiveKind = selectedNarrativeId ? selectedNarrativeKind : hoveredNarrativeKind;
  const effectiveId = selectedNarrativeId ?? hoveredNarrativeId;

  const activeStory =
    stories.find((story) => story.module === activeModule) ??
    stories[0] ?? {
      title: "Resume story",
      why_it_matters: "The visual resume is staying available even when some supporting narrative data is sparse.",
      audience: "Operators and executives",
      before_state: "Manual and fragmented workflows",
      after_state: "Connected systems and clearer decision support",
    };

  const { header, cards, fallbackSummary } = useMemo(() => {
    if (!effectiveKind || !effectiveId) {
      return {
        header: "Story Evidence",
        cards: [] as ResumeAccomplishmentCard[],
        fallbackSummary: null as ReturnType<typeof buildFallbackSelectionSummary> | null,
      };
    }

    if (effectiveKind === "metric") {
      const anchor = timeline.metric_anchors.find((item) => item.hero_metric_key === effectiveId);
      return {
        header: anchor?.title ?? "Metric evidence",
        cards: anchor ? getMetricCards(anchor, timeline.accomplishment_cards) : [],
        fallbackSummary: buildFallbackSelectionSummary(timeline, effectiveKind, effectiveId),
      };
    }

    if (effectiveKind === "milestone") {
      return {
        header: "Selected Moment",
        cards: timeline.accomplishment_cards.filter((card) => card.milestone_id === effectiveId),
        fallbackSummary: buildFallbackSelectionSummary(timeline, effectiveKind, effectiveId),
      };
    }

    if (effectiveKind === "phase") {
      return {
        header: "Selected Phase",
        cards: timeline.accomplishment_cards.filter((card) => card.phase_id === effectiveId),
        fallbackSummary: buildFallbackSelectionSummary(timeline, effectiveKind, effectiveId),
      };
    }

    if (effectiveKind === "layer") {
      return {
        header: "Capability Layer",
        cards: timeline.accomplishment_cards.filter((card) => card.capability_tags.includes(effectiveId)),
        fallbackSummary: buildFallbackSelectionSummary(timeline, effectiveKind, effectiveId),
      };
    }

    return {
      header: "Selection",
      cards: [],
      fallbackSummary: buildFallbackSelectionSummary(timeline, effectiveKind, effectiveId),
    };
  }, [effectiveId, effectiveKind, timeline]);

  const moduleFallback =
    activeModule === "modeling"
      ? {
          title: "Waterfall engine perspective",
          summary: "The model shows how live parameters reshape IRR, TVPI, and LP/GP economics.",
          before: "Spreadsheet scenarios were slow and fragile.",
          after: `${fmtPct(modelingOutputs.irr)} IRR and ${fmtMultiple(modelingOutputs.tvpi)} TVPI update instantly.`,
          stakeholders: "Investment committee, finance, and operations",
        }
      : activeModule === "bi"
        ? {
            title: biEntity.name,
            summary: biEntity.story,
            before: "Data had to be interpreted separately at each level.",
            after: `${fmtMoney(Number(biEntity.metrics.portfolio_value ?? 0))} visible value with drill context preserved.`,
            stakeholders: "Executives and client-facing delivery leads",
          }
        : activeModule === "architecture"
          ? {
              title: "Architecture layer",
              summary: "The systems view shows how governed data and AI layers fit together.",
              before: "Architecture lived behind implementation details.",
              after: "Business meaning is visible in the system map.",
              stakeholders: architecture.nodes[0]?.real_example ?? "Platform reviewers",
            }
          : {
              title: activeStory.title,
              summary: activeStory.why_it_matters,
              before: activeStory.before_state,
              after: activeStory.after_state,
              stakeholders: activeStory.audience,
            };

  const railCards = cards.length > 0 ? cards : [];
  const summary = fallbackSummary ?? moduleFallback;

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-bm-border/60 bg-bm-surface/35 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="bm-section-label">{header}</p>
            <h2 className="mt-2 text-xl">{summary.title}</h2>
            <p className="mt-3 text-sm leading-6 text-bm-muted">{summary.summary}</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
            {selectedNarrativeId ? "Locked" : hoveredNarrativeId ? "Preview" : "Default"}
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="rounded-2xl border border-bm-border/30 bg-black/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Before</p>
            <p className="mt-2 text-bm-text">{summary.before}</p>
          </div>
          <div className="rounded-2xl border border-bm-border/30 bg-black/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">After</p>
            <p className="mt-2 text-bm-text">{summary.after}</p>
          </div>
          <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-sky-200/80">Stakeholders</p>
            <p className="mt-2 text-sky-50">{summary.stakeholders}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {["timeline", "architecture", "modeling", "bi"].map((module) => (
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
        <p className="bm-section-label">Evidence Rail</p>
        {railCards.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-bm-border/35 bg-black/10 p-4 text-sm text-bm-muted">
            This selection has limited authored evidence so far. The summary above remains the active fallback until more cards are added.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {railCards.map((card) => (
              <article key={card.card_id} className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{card.card_type}</p>
                    <h3 className="mt-2 text-lg">{card.title}</h3>
                  </div>
                  {card.company ? (
                    <span className="rounded-full border border-bm-border/35 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
                      {card.company}
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 text-sm leading-6 text-bm-muted">{card.short_narrative}</p>

                {card.context ? (
                  <div className="mt-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Context</p>
                    <p className="mt-1 text-sm text-bm-text">{card.context}</p>
                  </div>
                ) : null}

                {card.action ? (
                  <div className="mt-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Action</p>
                    <p className="mt-1 text-sm text-bm-text">{card.action}</p>
                  </div>
                ) : null}

                {card.impact ? (
                  <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-500/8 p-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-100/80">Impact</p>
                    <p className="mt-1 text-sm text-emerald-50">{card.impact}</p>
                  </div>
                ) : null}

                {card.stakeholders ? (
                  <div className="mt-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Stakeholders</p>
                    <p className="mt-1 text-sm text-bm-text">{card.stakeholders}</p>
                  </div>
                ) : null}

                {Object.keys(card.metrics_json).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(card.metrics_json).map((entry) => (
                      <span key={entry[0]} className="rounded-full border border-bm-border/35 bg-white/5 px-3 py-1 text-xs text-bm-muted2">
                        {formatMetricEntry(entry)}
                      </span>
                    ))}
                  </div>
                ) : null}

                <SnapshotMiniDiagram spec={card.snapshot_spec} />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
