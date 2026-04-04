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
        background: "rgba(14,10,6,0.6)",
        border: "1px solid rgba(200,146,58,0.18)",
        boxShadow: "0 32px 80px -40px rgba(4,2,1,0.9)",
      }}
    >
      {/* Header row: Kayne logo | title | JLL logo */}
      <div
        className="flex items-center justify-between gap-4 px-4 pt-4 md:px-6 md:pt-5"
      >
        {/* Kayne Anderson mark */}
        <button
          type="button"
          onClick={() => handleSelectEvent("phase-kayne-2018-2025")}
          className={`flex shrink-0 items-center gap-2 transition-opacity ${
            selectedEventId === "phase-kayne-2018-2025" ? "opacity-100" : "opacity-50 hover:opacity-75"
          }`}
        >
          <span
            className="resume-editorial text-[28px] leading-none md:text-[34px]"
            style={{ color: "#c8923a", fontWeight: 600 }}
          >
            𝒦
          </span>
          <div className="hidden sm:block">
            <div
              className="resume-label text-[9px] tracking-[0.26em]"
              style={{ color: "#c8923a" }}
            >
              Kayne Anderson
            </div>
            <div
              className="resume-label text-[7px] tracking-[0.3em] opacity-55"
              style={{ color: "#c8923a" }}
            >
              Real Estate
            </div>
          </div>
        </button>

        {/* Center title */}
        <div className="text-center">
          <h2
            className="resume-label text-[10px] tracking-[0.28em] md:text-[11px]"
            style={{ color: "rgba(200,176,144,0.6)" }}
          >
            <span className="sm:hidden">Capability Arc</span>
            <span className="hidden sm:inline">Compounding Capability</span>
          </h2>
        </div>

        {/* JLL mark */}
        <button
          type="button"
          onClick={() => handleSelectEvent("phase-jll-2025-present")}
          className={`flex shrink-0 flex-col items-end transition-opacity ${
            selectedEventId === "phase-jll-2014-2018" || selectedEventId === "phase-jll-2025-present"
              ? "opacity-100"
              : "opacity-50 hover:opacity-75"
          }`}
        >
          <span
            className="resume-label text-[18px] tracking-[0.15em] leading-none"
            style={{ color: "#c84b2a" }}
          >
            JLL
          </span>
          <span
            className="resume-label hidden text-[7px] tracking-[0.24em] opacity-55 sm:block"
            style={{ color: "#c84b2a" }}
          >
            Present
          </span>
        </button>
      </div>

      {/* Capability strip */}
      <div className="mt-3 px-3 md:mt-4 md:px-5">
        <CapabilityStrip
          selectedCapabilityId={selectedCapabilityId}
          selectedEventId={selectedEventId}
          onSelectCapability={handleSelectCapability}
        />
      </div>

      {/* The graph */}
      <div className="mt-2 px-2 pb-3 md:mt-3 md:px-4 md:pb-5">
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

