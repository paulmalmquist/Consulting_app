"use client";

import { useMemo } from "react";
import { SkillLogo } from "../SkillDetailView";
import {
  CAPABILITIES,
  TIMELINE_EVENTS,
  type Capability,
  type CompanyId,
} from "./timelineData";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CapabilityStripProps {
  selectedCapabilityId: string | null;
  selectedEventId: string | null;
  onSelectCapability: (capabilityId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CapabilityStrip({
  selectedCapabilityId,
  selectedEventId,
  onSelectCapability,
}: CapabilityStripProps) {
  // When an event is selected, highlight capabilities used in that phase
  const activeCapabilityIds = useMemo(() => {
    if (!selectedEventId) return new Set<string>();
    const event = TIMELINE_EVENTS.find((e) => e.id === selectedEventId);
    if (!event) return new Set<string>();
    return new Set(event.capabilities_used);
  }, [selectedEventId]);

  return (
    <div
      className="flex items-center justify-center gap-1 md:gap-3"
      style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
    >
      {CAPABILITIES.map((capability) => {
        const isSelected = selectedCapabilityId === capability.id;
        const isActive =
          activeCapabilityIds.size === 0 || activeCapabilityIds.has(capability.id);
        const isDimmed = activeCapabilityIds.size > 0 && !isActive && !isSelected;

        return (
          <button
            key={capability.id}
            type="button"
            onClick={() =>
              onSelectCapability(isSelected ? null : capability.id)
            }
            title={capability.name}
            className={`group relative flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-1.5 py-1 transition-all duration-200 md:gap-1 md:px-3 md:py-2 ${
              isSelected
                ? "bg-white/12 shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
                : isDimmed
                  ? "opacity-55"
                  : "hover:bg-white/8"
            }`}
          >
            {/* Icon */}
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-all md:h-9 md:w-9"
              style={{
                backgroundColor: isSelected
                  ? `${capability.color}25`
                  : "var(--ros-pill-bg, rgba(255,255,255,0.07))",
                border: isSelected
                  ? `1px solid ${capability.color}40`
                  : "1px solid transparent",
                color: capability.color,
              }}
            >
              <SkillLogo skillId={capability.id} size={isMobileCheck() ? 16 : 22} />
            </div>

            {/* Label */}
            <span
              className="text-[9px] font-medium leading-none transition-colors md:text-[11px]"
              style={{
                color: isSelected
                  ? "var(--ros-text-bright, #fff)"
                  : "var(--ros-text-muted, rgba(255,255,255,0.82))",
              }}
            >
              {capability.name}
            </span>

            {/* Active indicator dot */}
            {isSelected && (
              <div
                className="absolute -bottom-0.5 h-0.5 w-4 rounded-full"
                style={{ backgroundColor: capability.color }}
              />
            )}

            {/* Company dots showing when this skill was used */}
            <ActiveRangeDots capability={capability} isVisible={isSelected} />
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active range dots — shows which companies used this skill
// ---------------------------------------------------------------------------

function ActiveRangeDots({
  capability,
  isVisible,
}: {
  capability: Capability;
  isVisible: boolean;
}) {
  if (!isVisible) return null;

  const companies = [...new Set(capability.active_ranges.map((r) => r.company))];

  return (
    <div className="mt-0.5 flex gap-1">
      {companies.map((company) => (
        <CompanyBadge key={company} company={company} />
      ))}
    </div>
  );
}

function CompanyBadge({ company }: { company: CompanyId }) {
  const labels: Record<CompanyId, string> = {
    jll: "JLL",
    kayne: "KA",
    winston: "W",
  };
  const colors: Record<CompanyId, string> = {
    jll: "rgba(220,38,38,0.45)",
    kayne: "rgba(37,99,235,0.45)",
    winston: "rgba(115,115,115,0.45)",
  };

  return (
    <span
      className="rounded px-1 py-0.5 text-[9px] font-semibold leading-none text-white/75"
      style={{ backgroundColor: colors[company] }}
    >
      {labels[company]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function isMobileCheck(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768;
}
