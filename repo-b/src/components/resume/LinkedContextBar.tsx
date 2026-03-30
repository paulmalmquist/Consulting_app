"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";

export default function LinkedContextBar() {
  const {
    workspace,
    highlightArchitectureNodeIds,
    selectedBiEntityId,
    modelPresetId,
    activeModule,
    setActiveModule,
    lastBiEntitySource,
    lastModelPresetSource,
  } = useResumeWorkspaceStore(
    useShallow((state) => ({
      workspace: state.workspace,
      highlightArchitectureNodeIds: state.highlightArchitectureNodeIds,
      selectedBiEntityId: state.selectedBiEntityId,
      modelPresetId: state.modelPresetId,
      activeModule: state.activeModule,
      setActiveModule: state.setActiveModule,
      lastBiEntitySource: state.lastBiEntitySource,
      lastModelPresetSource: state.lastModelPresetSource,
    })),
  );

  const chips = useMemo(() => {
    if (!workspace) return [];
    const items: Array<{ module: "architecture" | "bi" | "modeling"; label: string; fromTimeline: boolean }> = [];

    if (highlightArchitectureNodeIds.length > 0) {
      const names = highlightArchitectureNodeIds
        .map((id) => workspace.architecture.nodes.find((n) => n.node_id === id)?.label)
        .filter(Boolean)
        .slice(0, 3);
      if (names.length > 0) {
        items.push({
          module: "architecture",
          label: `Architecture: ${names.join(", ")}`,
          fromTimeline: true,
        });
      }
    }

    if (selectedBiEntityId && selectedBiEntityId !== workspace.bi.root_entity_id) {
      const entity = workspace.bi.entities.find((e) => e.entity_id === selectedBiEntityId);
      if (entity) {
        items.push({
          module: "bi",
          label: `BI: ${entity.name}`,
          fromTimeline: lastBiEntitySource === "timeline",
        });
      }
    }

    const preset = workspace.modeling.presets.find((p) => p.preset_id === modelPresetId);
    if (preset && workspace.modeling.presets.length > 1) {
      items.push({
        module: "modeling",
        label: `Modeling: ${preset.label}`,
        fromTimeline: lastModelPresetSource === "timeline",
      });
    }

    return items;
  }, [workspace, highlightArchitectureNodeIds, selectedBiEntityId, modelPresetId, lastBiEntitySource, lastModelPresetSource]);

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-3">
      <span className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Linked</span>
      {chips.map((chip) => (
        <button
          key={chip.module}
          type="button"
          onClick={() => setActiveModule(chip.module)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
            activeModule === chip.module
              ? "border-white/30 bg-white/12 text-white"
              : "border-bm-border/35 bg-white/5 text-bm-muted hover:border-white/20 hover:text-bm-text"
          }`}
        >
          {chip.fromTimeline ? (
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          ) : null}
          {chip.label}
        </button>
      ))}
    </div>
  );
}
