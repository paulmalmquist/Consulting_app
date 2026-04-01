"use client";

import { create } from "zustand";
import type {
  ResumeArchitectureNode,
  ResumeAssistantContext,
  ResumeBi,
  ResumeModeling,
  ResumeScenarioInputs,
  ResumeTimeline,
  ResumeTimelineViewMode,
} from "@/lib/bos-api";
import type { ResumeWorkspaceViewModel } from "@/lib/resume/workspace";
import type {
  ImpactMetricKey,
  NarrativeSelectionKind,
} from "./capabilityGraphData";
import type { SkillId } from "./skillsData";

type ResumeModule = "timeline" | "architecture" | "modeling" | "bi";

type ResumeWorkspaceState = {
  workspace: ResumeWorkspaceViewModel | null;
  activeModule: ResumeModule;
  timelineView: ResumeTimelineViewMode;
  playStory: boolean;
  playIndex: number;
  selectedTimelineId: string | null;
  selectedNarrativeKind: NarrativeSelectionKind | null;
  selectedNarrativeId: string | null;
  hoveredNarrativeKind: NarrativeSelectionKind | null;
  hoveredNarrativeId: string | null;
  selectedArchitectureNodeId: string | null;
  highlightArchitectureNodeIds: string[];
  architectureView: "technical" | "business";
  modelPresetId: string;
  modelInputs: ResumeScenarioInputs;
  selectedBiEntityId: string;
  biFilters: {
    market: string;
    propertyType: string;
    period: string;
  };
  capabilityHoveredLayer: string | null;
  enabledCapabilityLayerIds: string[];
  selectedImpactMetric: ImpactMetricKey;
  selectedSkillId: SkillId | null;
  lastBiEntitySource: "timeline" | "bi" | "init";
  lastModelPresetSource: "timeline" | "modeling" | "init";
  initialize: (workspace: ResumeWorkspaceViewModel) => void;
  setSelectedSkillId: (skillId: SkillId | null) => void;
  setActiveModule: (module: ResumeModule) => void;
  setTimelineView: (view: ResumeTimelineViewMode) => void;
  togglePlayStory: () => void;
  setPlayIndex: (index: number) => void;
  selectTimelineItem: (itemId: string, options?: { switchModule?: ResumeModule | null }) => void;
  selectNarrativeItem: (
    kind: NarrativeSelectionKind,
    itemId: string,
    options?: { switchModule?: ResumeModule | null; timelineView?: ResumeTimelineViewMode | null },
  ) => void;
  previewNarrativeItem: (kind: NarrativeSelectionKind | null, itemId: string | null) => void;
  clearNarrativeSelection: () => void;
  selectArchitectureNode: (nodeId: string | null) => void;
  setArchitectureView: (view: "technical" | "business") => void;
  setModelPreset: (presetId: string) => void;
  setModelInputs: (patch: Partial<ResumeScenarioInputs>) => void;
  selectBiEntity: (entityId: string) => void;
  setBiFilters: (patch: Partial<ResumeWorkspaceState["biFilters"]>) => void;
  setCapabilityHoveredLayer: (layerId: string | null) => void;
  toggleCapabilityLayer: (layerId: string) => void;
  resetCapabilityLayers: () => void;
  setSelectedImpactMetric: (metric: ImpactMetricKey) => void;
  buildAssistantContext: () => ResumeAssistantContext;
};

function resolveLinkedTimelineSelection(
  timeline: ResumeTimeline,
  id: string,
): {
  linkedArchitectureNodeIds: string[];
  linkedBiEntityIds: string[];
  linkedModelPreset: string | null;
} {
  for (const milestone of timeline.milestones) {
    if (milestone.milestone_id === id) {
      return {
        linkedArchitectureNodeIds: milestone.linked_architecture_node_ids,
        linkedBiEntityIds: milestone.linked_bi_entity_ids,
        linkedModelPreset: milestone.linked_model_preset,
      };
    }
  }

  for (const role of timeline.roles) {
    if (role.timeline_role_id === id) {
      const nodes = new Set<string>();
      const biIds = new Set<string>();
      let linkedModelPreset: string | null = null;
      role.initiatives.forEach((initiative) => {
        initiative.linked_architecture_node_ids.forEach((nodeId) => nodes.add(nodeId));
        initiative.linked_bi_entity_ids.forEach((entityId) => biIds.add(entityId));
        if (!linkedModelPreset && initiative.linked_model_preset) linkedModelPreset = initiative.linked_model_preset;
      });
      return {
        linkedArchitectureNodeIds: [...nodes],
        linkedBiEntityIds: [...biIds],
        linkedModelPreset,
      };
    }
    for (const initiative of role.initiatives) {
      if (initiative.initiative_id === id) {
        return {
          linkedArchitectureNodeIds: initiative.linked_architecture_node_ids,
          linkedBiEntityIds: initiative.linked_bi_entity_ids,
          linkedModelPreset: initiative.linked_model_preset,
        };
      }
    }
  }

  const topLevelInitiative = timeline.initiatives.find((initiative) => initiative.initiative_id === id);
  if (topLevelInitiative) {
    return {
      linkedArchitectureNodeIds: topLevelInitiative.linked_architecture_node_ids,
      linkedBiEntityIds: topLevelInitiative.linked_bi_entity_ids,
      linkedModelPreset: topLevelInitiative.linked_model_preset,
    };
  }

  return { linkedArchitectureNodeIds: [], linkedBiEntityIds: [], linkedModelPreset: null };
}

function resolveNarrativeTimelineId(
  timeline: ResumeTimeline,
  kind: NarrativeSelectionKind,
  id: string,
): string | null {
  if (kind === "milestone" || kind === "initiative" || kind === "role") {
    return id;
  }

  if (kind === "phase") {
    return (
      timeline.milestones
        .filter((milestone) => milestone.phase_id === id)
        .sort((left, right) => {
          const leftOrder = left.play_order ?? 999;
          const rightOrder = right.play_order ?? 999;
          if (leftOrder !== rightOrder) return leftOrder - rightOrder;
          return left.date.localeCompare(right.date);
        })[0]?.milestone_id ??
      timeline.initiatives.find((initiative) => initiative.phase_id === id)?.initiative_id ??
      null
    );
  }

  if (kind === "layer") {
    return (
      timeline.milestones.find((milestone) => milestone.capability_tags.includes(id))?.milestone_id ??
      timeline.initiatives.find((initiative) => initiative.capability_tags.includes(id))?.initiative_id ??
      null
    );
  }

  if (kind === "metric") {
    const anchor = timeline.metric_anchors.find((item) => item.hero_metric_key === id);
    if (!anchor) return null;
    return (
      anchor.linked_milestone_ids[0] ??
      (anchor.linked_phase_ids[0] ? resolveNarrativeTimelineId(timeline, "phase", anchor.linked_phase_ids[0]) : null) ??
      (anchor.linked_capability_layer_ids[0]
        ? resolveNarrativeTimelineId(timeline, "layer", anchor.linked_capability_layer_ids[0])
        : null) ??
      null
    );
  }

  return null;
}

function pickDefaultPreset(modeling: ResumeModeling) {
  return modeling.presets[0]?.preset_id ?? "base_case";
}

function getVisibleCapabilityLayerIds(timeline: ResumeTimeline) {
  const visible = timeline.capability_layers.filter((layer) => layer.is_visible).map((layer) => layer.layer_id);
  return visible.length > 0 ? visible : timeline.capability_layers.map((layer) => layer.layer_id);
}

export const useResumeWorkspaceStore = create<ResumeWorkspaceState>((set, get) => ({
  workspace: null,
  activeModule: "timeline",
  timelineView: "career",
  playStory: false,
  playIndex: 0,
  selectedTimelineId: null,
  selectedNarrativeKind: null,
  selectedNarrativeId: null,
  hoveredNarrativeKind: null,
  hoveredNarrativeId: null,
  selectedArchitectureNodeId: null,
  highlightArchitectureNodeIds: [],
  architectureView: "technical",
  modelPresetId: "base_case",
  modelInputs: {
    purchase_price: 0,
    exit_cap_rate: 0,
    hold_period: 5,
    noi_growth_pct: 0,
    debt_pct: 0,
  },
  selectedBiEntityId: "portfolio-root",
  biFilters: {
    market: "All Markets",
    propertyType: "All Types",
    period: "2025-12",
  },
  capabilityHoveredLayer: null,
  enabledCapabilityLayerIds: [],
  selectedImpactMetric: "impact_composite",
  selectedSkillId: null,
  lastBiEntitySource: "init",
  lastModelPresetSource: "init",
  setSelectedSkillId: (skillId) => set({ selectedSkillId: skillId }),
  initialize: (workspace) => {
    // Pick the strongest milestone as default — warehouse/semantic layer milestone shows the most
    // cross-module connections (architecture, BI, modeling). Fall back to first play step or first milestone.
    const preferredMilestone = workspace.timeline.milestones.find(
      (m) => m.milestone_id === "milestone-kayne-warehouse-semantic",
    );
    const defaultTimelineId =
      preferredMilestone?.milestone_id ??
      workspace.timeline.play_story_steps[0]?.milestone_id ??
      workspace.timeline.milestones[0]?.milestone_id ??
      workspace.timeline.roles[0]?.timeline_role_id ??
      null;
    // Resolve linked modules for the default milestone so the page opens with full context.
    const linked = defaultTimelineId
      ? resolveLinkedTimelineSelection(workspace.timeline, defaultTimelineId)
      : null;
    set({
      workspace,
      activeModule: "timeline",
      timelineView: workspace.timeline.default_view,
      playStory: false,
      playIndex: 0,
      selectedTimelineId: defaultTimelineId,
      selectedNarrativeKind: defaultTimelineId ? "milestone" : null,
      selectedNarrativeId: defaultTimelineId,
      hoveredNarrativeKind: null,
      hoveredNarrativeId: null,
      highlightArchitectureNodeIds: linked?.linkedArchitectureNodeIds ?? [],
      selectedArchitectureNodeId: null,
      architectureView: workspace.architecture.default_view,
      modelPresetId: linked?.linkedModelPreset ?? pickDefaultPreset(workspace.modeling),
      modelInputs: { ...workspace.modeling.defaults },
      selectedBiEntityId: linked?.linkedBiEntityIds[0] ?? workspace.bi.root_entity_id,
      biFilters: {
        market: "All Markets",
        propertyType: "All Types",
        period: workspace.bi.periods[workspace.bi.periods.length - 1] ?? "2025-12",
      },
      capabilityHoveredLayer: null,
      enabledCapabilityLayerIds: getVisibleCapabilityLayerIds(workspace.timeline),
      selectedImpactMetric: "impact_composite",
      selectedSkillId: null,
      lastBiEntitySource: "init",
      lastModelPresetSource: "init",
    });
  },
  setActiveModule: (module) => set({ activeModule: module }),
  setTimelineView: (view) => set({ timelineView: view }),
  togglePlayStory: () => set((state) => ({ playStory: !state.playStory })),
  setPlayIndex: (index) => set({ playIndex: index }),
  selectTimelineItem: (itemId, options) => {
    const workspace = get().workspace;
    if (!workspace) return;
    const linked = resolveLinkedTimelineSelection(workspace.timeline, itemId);
    set((state) => ({
      selectedTimelineId: itemId,
      selectedNarrativeKind:
        workspace.timeline.milestones.some((item) => item.milestone_id === itemId)
          ? "milestone"
          : workspace.timeline.roles.some((item) => item.timeline_role_id === itemId)
            ? "role"
            : "initiative",
      selectedNarrativeId: itemId,
      hoveredNarrativeKind: null,
      hoveredNarrativeId: null,
      highlightArchitectureNodeIds: linked.linkedArchitectureNodeIds,
      selectedArchitectureNodeId: linked.linkedArchitectureNodeIds[0] ?? state.selectedArchitectureNodeId,
      selectedBiEntityId: linked.linkedBiEntityIds[0] ?? state.selectedBiEntityId,
      lastBiEntitySource: linked.linkedBiEntityIds[0] ? "timeline" : state.lastBiEntitySource,
      modelPresetId: linked.linkedModelPreset ?? state.modelPresetId,
      lastModelPresetSource: linked.linkedModelPreset ? "timeline" : state.lastModelPresetSource,
      modelInputs:
        linked.linkedModelPreset
          ? {
              ...(workspace.modeling.presets.find((preset) => preset.preset_id === linked.linkedModelPreset)?.inputs ??
                state.modelInputs),
            }
          : state.modelInputs,
      activeModule: options?.switchModule ?? state.activeModule,
    }));
  },
  selectNarrativeItem: (kind, itemId, options) => {
    const workspace = get().workspace;
    if (!workspace) return;

    const resolvedTimelineId = resolveNarrativeTimelineId(workspace.timeline, kind, itemId);
    const linked = resolvedTimelineId
      ? resolveLinkedTimelineSelection(workspace.timeline, resolvedTimelineId)
      : { linkedArchitectureNodeIds: [], linkedBiEntityIds: [], linkedModelPreset: null };
    const anchor =
      kind === "metric"
        ? workspace.timeline.metric_anchors.find((item) => item.hero_metric_key === itemId) ?? null
        : null;

    set((state) => ({
      selectedNarrativeKind: kind,
      selectedNarrativeId: itemId,
      selectedTimelineId: resolvedTimelineId ?? state.selectedTimelineId,
      hoveredNarrativeKind: null,
      hoveredNarrativeId: null,
      highlightArchitectureNodeIds: linked.linkedArchitectureNodeIds,
      selectedArchitectureNodeId: linked.linkedArchitectureNodeIds[0] ?? state.selectedArchitectureNodeId,
      selectedBiEntityId: linked.linkedBiEntityIds[0] ?? state.selectedBiEntityId,
      lastBiEntitySource: linked.linkedBiEntityIds[0] ? "timeline" : state.lastBiEntitySource,
      modelPresetId: linked.linkedModelPreset ?? state.modelPresetId,
      lastModelPresetSource: linked.linkedModelPreset ? "timeline" : state.lastModelPresetSource,
      modelInputs:
        linked.linkedModelPreset
          ? {
              ...(workspace.modeling.presets.find((preset) => preset.preset_id === linked.linkedModelPreset)?.inputs ??
                state.modelInputs),
            }
          : state.modelInputs,
      activeModule: options?.switchModule ?? state.activeModule,
      timelineView:
        options?.timelineView ??
        anchor?.default_view ??
        state.timelineView,
    }));
  },
  previewNarrativeItem: (kind, itemId) =>
    set({
      hoveredNarrativeKind: kind,
      hoveredNarrativeId: itemId,
    }),
  clearNarrativeSelection: () =>
    set((state) => ({
      selectedTimelineId: null,
      selectedNarrativeKind: null,
      selectedNarrativeId: null,
      hoveredNarrativeKind: null,
      hoveredNarrativeId: null,
      highlightArchitectureNodeIds: [],
      selectedArchitectureNodeId: state.selectedArchitectureNodeId,
    })),
  selectArchitectureNode: (nodeId) => set({ selectedArchitectureNodeId: nodeId }),
  setArchitectureView: (view) => set({ architectureView: view }),
  setModelPreset: (presetId) => {
    const workspace = get().workspace;
    const preset = workspace?.modeling.presets.find((item) => item.preset_id === presetId);
    set((state) => ({
      modelPresetId: presetId,
      modelInputs: preset ? { ...preset.inputs } : state.modelInputs,
      lastModelPresetSource: "modeling",
    }));
  },
  setModelInputs: (patch) => set((state) => ({ modelInputs: { ...state.modelInputs, ...patch } })),
  selectBiEntity: (entityId) => set({ selectedBiEntityId: entityId, lastBiEntitySource: "bi" }),
  setBiFilters: (patch) => set((state) => ({ biFilters: { ...state.biFilters, ...patch } })),
  setCapabilityHoveredLayer: (layerId) => set({ capabilityHoveredLayer: layerId }),
  toggleCapabilityLayer: (layerId) => {
    const workspace = get().workspace;
    if (!workspace) return;
    set((state) => {
      const enabled = state.enabledCapabilityLayerIds.includes(layerId)
        ? state.enabledCapabilityLayerIds.filter((id) => id !== layerId)
        : [...state.enabledCapabilityLayerIds, layerId];
      return {
        enabledCapabilityLayerIds: enabled.length > 0 ? enabled : getVisibleCapabilityLayerIds(workspace.timeline),
        selectedNarrativeKind: "layer",
        selectedNarrativeId: layerId,
      };
    });
  },
  resetCapabilityLayers: () => {
    const workspace = get().workspace;
    if (!workspace) return;
    set({
      enabledCapabilityLayerIds: getVisibleCapabilityLayerIds(workspace.timeline),
    });
  },
  setSelectedImpactMetric: (metric) => set({ selectedImpactMetric: metric }),
  buildAssistantContext: () => {
    const state = get();
    return {
      active_module: state.activeModule,
      selected_timeline_id: state.selectedTimelineId,
      selected_architecture_node_id: state.selectedArchitectureNodeId,
      selected_bi_entity_id: state.selectedBiEntityId,
      architecture_view: state.architectureView,
      timeline_view: state.timelineView,
      model_preset_id: state.modelPresetId,
      model_inputs: Object.fromEntries(
        Object.entries(state.modelInputs).filter(([, v]) => v != null),
      ) as Record<string, string | number>,
      filters: {
        market: state.biFilters.market,
        propertyType: state.biFilters.propertyType,
        period: state.biFilters.period,
      },
      metrics: {
        impact_metric: state.selectedImpactMetric,
      },
    };
  },
}));

export function getLinkedArchitectureNodes(
  nodes: ResumeArchitectureNode[],
  highlightIds: string[],
): ResumeArchitectureNode[] {
  if (highlightIds.length === 0) return [];
  const lookup = new Set(highlightIds);
  return nodes.filter((node) => lookup.has(node.node_id));
}

export function getBiRootId(bi: ResumeBi) {
  return bi.root_entity_id;
}
