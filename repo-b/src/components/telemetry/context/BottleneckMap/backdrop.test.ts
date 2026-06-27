import { describe, expect, it } from "vitest";

import { EVENTS, NODE_BACKDROPS, THEME_BACKDROPS, resolveBackdrop } from "./data";
import type { EventBackdrop, InnovationKey } from "./types";

// Phase 9B — the Overview hero backdrop resolver. Pure mapping over the existing event model; no new
// source claims, no evidence values. Resolution: per-event override → curated node photo → era theme.
describe("resolveBackdrop (Phase 9B era backdrops)", () => {
  it("returns null when no event is selected (Overview falls back to its gradient)", () => {
    expect(resolveBackdrop(null)).toBeNull();
  });

  it("maps a node with a curated era photo to its committed image (credited, not evidence)", () => {
    const apollo = EVENTS.find((e) => e.id === "apollo11")!;
    const bd = resolveBackdrop(apollo)!;
    expect(bd).toBe(NODE_BACKDROPS.apollo11);
    expect(bd.sourceKind).toBe("curated");
    expect(bd.image).toMatch(/^\/telemetry\/backdrops\/nodes\/apollo11\.jpg$/);
    expect(bd.credit).toMatch(/Wikimedia Commons/);
  });

  it("falls back to the era theme art for a node with no curated photo", () => {
    const terran1 = EVENTS.find((e) => e.id === "terran1")!; // Relativity — no freely-licensed image
    expect(resolveBackdrop(terran1)).toBe(THEME_BACKDROPS.manufacturing);
    const falcon1 = EVENTS.find((e) => e.id === "falcon1")!; // intentionally not fetched
    expect(resolveBackdrop(falcon1)).toBe(THEME_BACKDROPS.cost);
  });

  it("lets a per-event backdrop override win over node photo and era theme", () => {
    const base = EVENTS.find((e) => e.id === "apollo11")!; // has a node photo
    const override: EventBackdrop = { alt: "custom override", tone: "#ffffff", sourceKind: "curated" };
    expect(resolveBackdrop({ ...base, backdrop: override })).toBe(override);
  });

  it("every curated node backdrop is credited and points at a committed jpg", () => {
    for (const [id, bd] of Object.entries(NODE_BACKDROPS)) {
      expect(bd.image).toBe(`/telemetry/backdrops/nodes/${id}.jpg`);
      expect(bd.sourceKind).toBe("curated");
      expect(bd.credit && bd.credit.length > 0).toBe(true);
    }
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
