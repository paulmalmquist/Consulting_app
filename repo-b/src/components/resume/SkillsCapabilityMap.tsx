"use client";

import { useCallback, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";
import { SKILLS, getSkillsByMilestoneId, getSkillsByPhaseId, getSkillsByCapabilityTag } from "./skillsData";
import type { SkillId, SkillDefinition } from "./skillsData";
import SkillDetailView, { SkillLogo } from "./SkillDetailView";

/**
 * Replaces LinkedContextBar with an interactive skills capability map.
 *
 * - Icon grid: 2 rows on mobile, evenly spaced logos only (no pills)
 * - Clicking an icon navigates to a skill detail view
 * - Timeline selection highlights relevant skills (only after explicit user interaction)
 * - Skill selection can filter/annotate the timeline via capability layer toggles
 */
export default function SkillsCapabilityMap() {
  const {
    selectedSkillId,
    setSelectedSkillId,
    selectedNarrativeKind,
    selectedNarrativeId,
    workspace,
    toggleCapabilityLayer,
    enabledCapabilityLayerIds,
    setHighlightedSystemId,
  } = useResumeWorkspaceStore(
    useShallow((state) => ({
      selectedSkillId: state.selectedSkillId,
      setSelectedSkillId: state.setSelectedSkillId,
      selectedNarrativeKind: state.selectedNarrativeKind,
      selectedNarrativeId: state.selectedNarrativeId,
      workspace: state.workspace,
      toggleCapabilityLayer: state.toggleCapabilityLayer,
      enabledCapabilityLayerIds: state.enabledCapabilityLayerIds,
      setHighlightedSystemId: state.setHighlightedSystemId,
    })),
  );

  // Track the initial narrative ID so we don't highlight skills on page load.
  // Only highlight after the user explicitly selects something different.
  const initialNarrativeIdRef = useRef<string | null | undefined>(undefined);
  if (initialNarrativeIdRef.current === undefined && selectedNarrativeId != null) {
    initialNarrativeIdRef.current = selectedNarrativeId;
  }

  const isUserDrivenSelection =
    selectedNarrativeId != null && selectedNarrativeId !== initialNarrativeIdRef.current;

  /** Skills highlighted by current timeline selection */
  const highlightedSkillIds = useMemo(() => {
    if (!isUserDrivenSelection || !selectedNarrativeId || !workspace) return new Set<SkillId>();

    let matched: SkillDefinition[] = [];

    if (selectedNarrativeKind === "milestone") {
      matched = getSkillsByMilestoneId(selectedNarrativeId);
    } else if (selectedNarrativeKind === "phase") {
      matched = getSkillsByPhaseId(selectedNarrativeId);
    } else if (selectedNarrativeKind === "layer") {
      matched = getSkillsByCapabilityTag(selectedNarrativeId);
    } else if (selectedNarrativeKind === "initiative") {
      // Find milestones linked to this initiative and map skills
      const initiative = workspace.timeline.initiatives.find(
        (i) => i.initiative_id === selectedNarrativeId,
      );
      if (initiative) {
        const fromTags = initiative.capability_tags.flatMap((tag) => getSkillsByCapabilityTag(tag));
        matched = [...new Map(fromTags.map((s) => [s.id, s])).values()];
      }
    } else if (selectedNarrativeKind === "role") {
      // Match by phase
      const role = workspace.timeline.roles.find(
        (r) => r.timeline_role_id === selectedNarrativeId,
      );
      if (role) {
        const fromPhase = workspace.timeline.phases.find(
          (p) =>
            p.start_date <= role.start_date &&
            (!p.end_date || p.end_date >= (role.end_date ?? "9999")),
        );
        if (fromPhase) {
          matched = getSkillsByPhaseId(fromPhase.phase_id);
        }
      }
    }

    return new Set(matched.map((s) => s.id));
  }, [isUserDrivenSelection, selectedNarrativeKind, selectedNarrativeId, workspace]);

  const selectedSkill = useMemo(
    () => (selectedSkillId ? SKILLS.find((s) => s.id === selectedSkillId) ?? null : null),
    [selectedSkillId],
  );

  const handleSkillClick = useCallback(
    (skillId: SkillId) => {
      if (selectedSkillId === skillId) {
        setSelectedSkillId(null);
        return;
      }
      setSelectedSkillId(skillId);
      // Clear timeline-driven system highlight — skill filtering takes over
      setHighlightedSystemId(null);

      // Ensure capability layers are visible on the timeline
      const skill = SKILLS.find((s) => s.id === skillId);
      if (skill) {
        for (const tag of skill.capabilityTags) {
          if (!enabledCapabilityLayerIds.includes(tag)) {
            toggleCapabilityLayer(tag);
          }
        }
      }
    },
    [selectedSkillId, setSelectedSkillId, setHighlightedSystemId, enabledCapabilityLayerIds, toggleCapabilityLayer],
  );

  const handleBack = useCallback(() => {
    setSelectedSkillId(null);
  }, [setSelectedSkillId]);

  // If a skill is selected, show the detail view
  if (selectedSkill) {
    return (
      <div className="pt-3">
        <SkillDetailView
          skill={selectedSkill}
          onBack={handleBack}
          isHighlighted={highlightedSkillIds.has(selectedSkill.id)}
        />
      </div>
    );
  }

  // Icon grid — logos only, 2 rows on mobile, evenly spaced
  return (
    <div className="pt-3">
      <p
        className="resume-label mb-2.5 text-[10px] tracking-[0.2em]"
        style={{ color: "var(--ros-text-dim)" }}
      >
        <span style={{ color: "var(--ros-text)" }}>Skills</span>{" "}
        &amp; Capabilities
      </p>
      <div className="grid grid-cols-6 gap-x-2 gap-y-3 md:flex md:flex-wrap md:gap-3">
        {SKILLS.map((skill) => {
          const isHighlighted = highlightedSkillIds.has(skill.id);
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => handleSkillClick(skill.id)}
              title={skill.name}
              className="group relative flex flex-col items-center gap-1.5 rounded-lg p-2 transition"
              style={{
                background: isHighlighted
                  ? "rgba(56,189,248,0.10)"
                  : "var(--ros-pill-bg, rgba(255,255,255,0.07))",
                boxShadow: isHighlighted ? "inset 0 0 0 1px rgba(56,189,248,0.30)" : "none",
              }}
            >
              <div
                className="transition"
                style={{
                  color: isHighlighted
                    ? skill.color
                    : "var(--ros-icon-inactive, rgba(210,195,175,0.70))",
                }}
              >
                <SkillLogo skillId={skill.id} size={28} />
              </div>
              <span
                className="text-[9px] font-medium uppercase tracking-[0.08em] transition md:text-[10px]"
                style={{
                  color: isHighlighted
                    ? "var(--ros-text, rgba(255,255,255,0.90))"
                    : "var(--ros-text-dim, rgba(255,255,255,0.60))",
                }}
              >
                {skill.shortName}
              </span>
              {isHighlighted && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-sky-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
