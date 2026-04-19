/**
 * Phase 5 contract test: TrendLineChart fails closed.
 *
 * Per INV-5 revised plan: "Charts render NULL gaps for untrusted data."
 *
 * We pin the contract as a pure boolean: the public `showNullGaps` prop
 * (default true) must map to Recharts' `connectNulls=false`. Testing the
 * SVG output directly is brittle in JSDOM, so we assert the relationship
 * via the exported helper that the component itself uses.
 */
import { describe, expect, it } from "vitest";

import { connectNullsFromShowNullGaps } from "./TrendLineChart";

describe("TrendLineChart — Phase 5 null-gap contract", () => {
  it("default showNullGaps=true → connectNulls=false (fail-closed)", () => {
    expect(connectNullsFromShowNullGaps(true)).toBe(false);
  });

  it("explicit showNullGaps=false → connectNulls=true (opt-in interpolation)", () => {
    expect(connectNullsFromShowNullGaps(false)).toBe(true);
  });
});
