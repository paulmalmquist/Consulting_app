"use client";

import { useCallback, useEffect, useState } from "react";
import CompoundingCurve from "./CompoundingCurve";
import CapabilityStrip from "./CapabilityStrip";
import { useResumeWorkspaceStore } from "../useResumeWorkspaceStore";
import { SYSTEM_MAP, getEventForSystem } from "./timelineData";

/**
 * TimelineEngine — graph-only timeline with employer color bands and milestone dots.
 *
 * Selection state propagates to the Zustand store so skills, systems, and
 * context rail all react to timeline interactions.
 */
export default function TimelineEngine() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>("phase-jll-2025-present");
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string | null>(null);

  const selectNarrativeItem = useResumeWorkspaceStore((s) => s.selectNarrativeItem);
  const setHighlightedSystemId = useResumeWorkspaceStore((s) => s.setHighlightedSystemId);

  // Propagate timeline selections to global store for cross-section reactivity
  useEffect(() => {
    if (selectedSystemId) {
      const system = SYSTEM_MAP.get(selectedSystemId);
      if (system) {
        const parent = getEventForSystem(selectedSystemId);
        selectNarrativeItem("milestone", selectedSystemId, {
          switchModule: null,
        });
        setHighlightedSystemId(selectedSystemId);
      }
    } else if (selectedEventId) {
      selectNarrativeItem("phase", selectedEventId, { switchModule: null });
      setHighlightedSystemId(null);
    }
  }, [selectedEventId, selectedSystemId, selectNarrativeItem, setHighlightedSystemId]);

  const handleSelectEvent = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
    setSelectedSystemId(null);
  }, []);

  const handleSelectSystem = useCallback((systemId: string) => {
    setSelectedSystemId(systemId);
  }, []);

  const handleSelectCapability = useCallback((capabilityId: string | null) => {
    setSelectedCapabilityId(capabilityId);
    setSelectedSystemId(null);
  }, []);

  const handleHoverEvent = useCallback((_eventId: string | null) => {
    // Could add hover preview state here if needed
  }, []);

  return (
    <section
      className="relative overflow-hidden rounded-2xl md:rounded-3xl"
      style={{
        background: "var(--ros-card-bg, rgba(14,10,6,0.6))",
        border: "1px solid var(--ros-border-light, rgba(200,146,58,0.18))",
        boxShadow: "0 32px 80px -40px rgba(4,2,1,0.9)",
      }}
    >
      {/* Capability strip */}
      <div className="px-2 pt-3 md:px-5 md:pt-5">
        <CapabilityStrip
          selectedCapabilityId={selectedCapabilityId}
          selectedEventId={selectedEventId}
          onSelectCapability={handleSelectCapability}
        />
      </div>

      {/* The graph */}
      <div className="mt-1 px-1.5 pb-2 md:mt-3 md:px-4 md:pb-5">
        <CompoundingCurve
          selectedEventId={selectedEventId}
          selectedSystemId={selectedSystemId}
          selectedCapabilityId={selectedCapabilityId}
          onSelectEvent={handleSelectEvent}
          onSelectSystem={handleSelectSystem}
          onHoverEvent={handleHoverEvent}
        />
      </div>

      {/* Chart interpretation line */}
      <p
        className="px-3 pb-3 text-center text-[12px] leading-relaxed md:px-5 md:pb-5 md:text-[12px]"
        style={{ color: "var(--ros-text-dim)" }}
      >
        Skill layers compound over time — each new system builds on the last
      </p>
    </section>
  );
}

