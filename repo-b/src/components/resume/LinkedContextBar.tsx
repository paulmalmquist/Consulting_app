"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";

type EvidenceSection = {
  module: "architecture" | "bi" | "modeling";
  title: string;
  bullets: string[];
  fromTimeline: boolean;
};

/**
 * Mobile-only outcome-driven evidence, derived from real career data.
 * Each bullet starts with a strong verb and communicates
 * WHAT was built + WHY it mattered in ≤60 characters.
 */
function buildMobileEvidence(
  chips: Array<{ module: "architecture" | "bi" | "modeling"; label: string; fromTimeline: boolean }>,
): EvidenceSection[] {
  return chips.map((chip) => {
    if (chip.module === "architecture") {
      return {
        module: "architecture",
        title: "Data Platform & Architecture",
        bullets: [
          "Built $4B+ AUM warehouse on Databricks + Azure",
          "Unified DealCloud, MRI, Yardi into gold tables",
          "Delivered semantic layer across 6 business units",
        ],
        fromTimeline: chip.fromTimeline,
      };
    }
    if (chip.module === "bi") {
      return {
        module: "bi",
        title: "BI & Investor Reporting",
        bullets: [
          "Cut DDQ turnaround by 50% via governed data",
          "Accelerated quarter-close by 10 days",
          "Shipped exec dashboards for 500+ properties",
        ],
        fromTimeline: chip.fromTimeline,
      };
    }
    return {
      module: "modeling",
      title: "Waterfall & Financial Modeling",
      bullets: [
        "Built Python waterfall replacing fragile Excel",
        "Enabled near-instant LP/GP scenario analysis",
        "Automated fund distribution modeling end-to-end",
      ],
      fromTimeline: chip.fromTimeline,
    };
  });
}

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

  const mobileEvidence = useMemo(() => buildMobileEvidence(chips), [chips]);

  if (chips.length === 0) return null;

  return (
    <>
      {/* Desktop: pill chips — unchanged */}
      <div className="hidden flex-wrap items-center gap-2 pt-3 md:flex">
        <span className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Linked</span>
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

      {/* Mobile: outcome-driven evidence cards */}
      <div className="space-y-2 pt-2.5 md:hidden">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-bm-muted">
          Linked Evidence
        </p>
        {mobileEvidence.map((section) => (
          <button
            key={section.module}
            type="button"
            onClick={() => setActiveModule(section.module)}
            className={`block w-full rounded-lg border px-3 py-2.5 text-left transition ${
              activeModule === section.module
                ? "border-white/25 bg-white/8"
                : "border-bm-border/25 bg-bm-surface/15 hover:border-white/15"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {section.fromTimeline && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
              )}
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-bm-text/90">
                {section.title}
              </p>
            </div>
            <ul className="mt-1.5 space-y-1">
              {section.bullets.map((bullet) => (
                <li
                  key={bullet}
                  className="flex items-start gap-1.5 text-[12px] leading-[1.4] text-bm-muted"
                >
                  <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-bm-muted2/60" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>
    </>
  );
}
