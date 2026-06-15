import { describe, test, expect } from "vitest";
import { hasUsableSourceRef } from "./IntelligenceCard";

// PR 8.6: the Investigate action is enabled only when the card has a usable source_ref
// (a non-empty object) to ground the session on. Empty/absent -> disabled, fail-closed.

describe("hasUsableSourceRef", () => {
  test("enabled for a card with a non-empty source_ref", () => {
    expect(hasUsableSourceRef({ source_ref: { type: "environment", env_id: "e1" } })).toBe(true);
    expect(hasUsableSourceRef({ source_ref: { card_id: "c1" } })).toBe(true);
  });

  test("disabled for an empty source_ref", () => {
    expect(hasUsableSourceRef({ source_ref: {} })).toBe(false);
  });

  test("disabled for a missing/non-object source_ref", () => {
    // The IntelCard type says source_ref is an object, but defend against bad data.
    expect(hasUsableSourceRef({ source_ref: null as unknown as Record<string, unknown> })).toBe(false);
    expect(hasUsableSourceRef({ source_ref: undefined as unknown as Record<string, unknown> })).toBe(false);
  });
});
