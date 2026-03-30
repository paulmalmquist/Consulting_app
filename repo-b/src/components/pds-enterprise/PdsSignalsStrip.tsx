"use client";
import React from "react";

import type { PdsV2AlertFilter } from "@/lib/bos-api";

const TONE_STYLES: Record<string, string> = {
  danger: "border-pds-signalRed/30 bg-pds-signalRed/10 text-pds-signalRed",
  warn: "border-pds-signalOrange/30 bg-pds-signalOrange/10 text-pds-signalOrange",
  positive: "border-pds-signalGreen/20 bg-pds-signalGreen/10 text-pds-signalGreen",
  neutral: "border-bm-border/50 bg-bm-surface/20 text-bm-muted2",
};

export function PdsSignalsStrip({
  filters,
  activeFilterKey,
  onFilterSelect,
}: {
  filters: PdsV2AlertFilter[];
  activeFilterKey?: string | null;
  onFilterSelect?: (filter: PdsV2AlertFilter) => void;
}) {
  return (
    <section className="flex flex-wrap gap-2" data-testid="pds-signals-strip">
      {filters.map((filter) => {
        const active = filter.key === activeFilterKey;
        return (
          <button
            key={filter.key}
            type="button"
            onClick={() => onFilterSelect?.(filter)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
              TONE_STYLES[filter.tone] || TONE_STYLES.neutral
            } ${active ? "ring-1 ring-pds-accent/50" : ""}`}
            title={filter.description || filter.label}
          >
            {filter.label}
          </button>
        );
      })}
    </section>
  );
}
