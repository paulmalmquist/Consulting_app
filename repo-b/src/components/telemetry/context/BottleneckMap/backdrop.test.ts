import { describe, expect, it } from "vitest";

import { EVENTS, THEME_BACKDROPS, resolveBackdrop } from "./data";
import type { EventBackdrop, InnovationKey } from "./types";

// Phase 9B — the Overview hero backdrop resolver. Pure mapping over the existing event model; no new
// source claims, no evidence values.
describe("resolveBackdrop (Phase 9B era backdrops)", () => {
  it("returns null when no event is selected (Overview falls back to its gradient)", () => {
    expect(resolveBackdrop(null)).toBeNull();
  });

  it("maps an event to its era theme backdrop by innovation type", () => {
    const mission = EVENTS.find((e) => e.type === "mission")!;
    expect(resolveBackdrop(mission)).toBe(THEME_BACKDROPS.mission);
    const dataops = EVENTS.find((e) => e.type === "dataops")!;
    expect(resolveBackdrop(dataops)).toBe(THEME_BACKDROPS.dataops);
  });

  it("lets a per-event backdrop override win over the era theme", () => {
    const base = EVENTS.find((e) => e.type === "mission")!;
    const override: EventBackdrop = { alt: "custom override", tone: "#ffffff", sourceKind: "curated" };
    expect(resolveBackdrop({ ...base, backdrop: override })).toBe(override);
  });

  it("provides an illustrative generative backdrop for every innovation era", () => {
    const eras: InnovationKey[] = ["mission", "cost", "reuse", "manufacturing", "dataops"];
    for (const era of eras) {
      const bd = THEME_BACKDROPS[era];
      expect(bd.sourceKind).toBe("generative");
      expect(bd.alt).toMatch(/illustrative/i);
      expect(bd.image).toMatch(/^\/telemetry\/backdrops\/.+\.svg$/);
    }
  });
});
