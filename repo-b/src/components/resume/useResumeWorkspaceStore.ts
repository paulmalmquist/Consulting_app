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

type ResumeModule = "timeline" | "architecture" | "modeling" | "bi";

type ResumeWorkspaceState = {
  workspace: ResumeWorkspaceViewModel | null;
  activeModule: ResumeModule;
  timelineView: ResumeTimelineViewMode;
  playStory: boolean;
  playIndex: number;
  selectedTimelineId: string | null;
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
  capabilityHoveredYear: number | null;
  capabilityPlaybackYear: number | null;
  initialize: (workspace: ResumeWorkspaceViewModel) => void;
  setActiveModule: (module: ResumeModule) => void;
  setTimelineView: (view: ResumeTimelineViewMode) => void;
  togglePlayStory: () => void;
  setPlayIndex: (index: number) => void;
  selectTimelineItem: (itemId: string, options?: { switchModule?: ResumeModule | null }) => void;
  selectArchitectureNode: (nodeId: string | null) => void;
  setArchitectureView: (view: "technical" | "business") => void;
  setModelPreset: (presetId: string) => void;
  setModelInputs: (patch: Partial<ResumeScenarioInputs>) => void;
  selectBiEntity: (entityId: string) => void;
  setBiFilters: (patch: Partial<ResumeWorkspaceState["biFilters"]>) => void;
  setCapabilityHoveredLayer: (layerId: string | null) => void;
  setCapabilityHoveredYear: (year: number | null) => void;
  setCapabilityPlaybackYear: (year: number | null) => void;
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

  return { linkedArchitectureNodeIds: [], linkedBiEntityIds: [], linkedModelPreset: null };
}

function pickDefaultPreset(modeling: ResumeModeling) {
  return modeling.presets[0]?.preset_id ?? "base_case";
}

export const useResumeWorkspaceStore = create<ResumeWorkspaceState>((set, get) => ({
  workspace: null,
  activeModule: "timeline",
  timelineView: "career",
  playStory: false,
  playIndex: 0,
  selectedTimelineId: null,
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
  capabilityHoveredYear: null,
  capabilityPlaybackYear: null,
  initialize: (workspace) =>
    set({
      workspace,
      activeModule: "timeline",
      timelineView: workspace.timeline.default_view,
      selectedTimelineId: workspace.timeline.roles[0]?.timeline_role_id ?? null,
      highlightArchitectureNodeIds: [],
      selectedArchitectureNodeId: null,
      architectureView: workspace.architecture.default_view,
      modelPresetId: pickDefaultPreset(workspace.modeling),
      modelInputs: { ...workspace.modeling.defaults },
      selectedBiEntityId: workspace.bi.root_entity_id,
      biFilters: {
        market: "All Markets",
        propertyType: "All Types",
        period: workspace.bi.periods[workspace.bi.periods.length - 1] ?? "2025-12",
      },
    }),
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
      highlightArchitectureNodeIds: linked.linkedArchitectureNodeIds,
      selectedArchitectureNodeId: linked.linkedArchitectureNodeIds[0] ?? state.selectedArchitectureNodeId,
      selectedBiEntityId: linked.linkedBiEntityIds[0] ?? state.selectedBiEntityId,
      modelPresetId: linked.linkedModelPreset ?? state.modelPresetId,
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
  selectArchitectureNode: (nodeId) => set({ selectedArchitectureNodeId: nodeId }),
  setArchitectureView: (view) => set({ architectureView: view }),
  setModelPreset: (presetId) => {
    const workspace = get().workspace;
    const preset = workspace?.modeling.presets.find((item) => item.preset_id === presetId);
    set((state) => ({
      modelPresetId: presetId,
      modelInputs: preset ? { ...preset.inputs } : state.modelInputs,
    }));
  },
  setModelInputs: (patch) => set((state) => ({ modelInputs: { ...state.modelInputs, ...patch } })),
  selectBiEntity: (entityId) => set({ selectedBiEntityId: entityId }),
  setBiFilters: (patch) => set((state) => ({ biFilters: { ...state.biFilters, ...patch } })),
  setCapabilityHoveredLayer: (layerId) => set({ capabilityHoveredLayer: layerId }),
  setCapabilityHoveredYear: (year) => set({ capabilityHoveredYear: year }),
  setCapabilityPlaybackYear: (year) => set({ capabilityPlaybackYear: year }),
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
      model_inputs: state.modelInputs,
      filters: {
        market: state.biFilters.market,
        propertyType: state.biFilters.propertyType,
        period: state.biFilters.period,
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
