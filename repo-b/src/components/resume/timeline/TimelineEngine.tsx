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
    <section className="rounded-[20px] border border-bm-border/60 bg-bm-surface/30 p-3 shadow-[0_24px_64px_-48px_rgba(5,12,18,0.95)] md:rounded-[28px] md:p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 md:gap-4">
        <h2 className="shrink-0 text-base font-semibold md:text-lg">
          <span className="md:hidden">Capability Timeline</span>
          <span className="hidden md:inline">Compounding Capability</span>
        </h2>
        <div className="flex gap-1.5">
          <EmployerBadge
            label="JLL"
            color="#DC2626"
            isActive={selectedEventId === "phase-jll-2014-2018" || selectedEventId === "phase-jll-2025-present"}
            onClick={() => handleSelectEvent("phase-jll-2025-present")}
          />
          <EmployerBadge
            label="Kayne"
            color="#2563EB"
            isActive={selectedEventId === "phase-kayne-2018-2025"}
            onClick={() => handleSelectEvent("phase-kayne-2018-2025")}
          />
        </div>
      </div>

      {/* Capability strip — interactive skill icons */}
      <div className="mt-3 md:mt-4">
        <CapabilityStrip
          selectedCapabilityId={selectedCapabilityId}
          selectedEventId={selectedEventId}
          onSelectCapability={handleSelectCapability}
        />
      </div>

      {/* The graph — centerpiece */}
      <div className="mt-3 md:mt-4">
        <CompoundingCurve
          selectedEventId={selectedEventId}
          selectedSystemId={selectedSystemId}
          selectedCapabilityId={selectedCapabilityId}
          onSelectEvent={handleSelectEvent}
          onSelectSystem={handleSelectSystem}
          onHoverEvent={handleHoverEvent}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Employer badge — top-right filter buttons
// ---------------------------------------------------------------------------

function EmployerBadge({
  label,
  color,
  isActive,
  onClick,
}: {
  label: string;
  color: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition md:px-3 md:py-1.5 md:text-xs ${
        isActive
          ? "font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
          : "text-white/50 hover:text-white/70"
      }`}
      style={{
        backgroundColor: isActive ? `${color}25` : "rgba(255,255,255,0.05)",
        borderColor: isActive ? `${color}40` : "transparent",
      }}
    >
      {label}
    </button>
  );
}
