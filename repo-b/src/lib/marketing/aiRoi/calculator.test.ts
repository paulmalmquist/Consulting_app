import { describe, expect, it } from "vitest";
import { computeRoiReframe } from "./calculator";

describe("computeRoiReframe", () => {
  it("computes the illustrative range for the default sample", () => {
    const result = computeRoiReframe({
      annualCompensation: 120000,
      freedHoursPerWeek: 3,
      roleType: "analyst",
      servedAudience: "executive_board",
      outputType: "decision_packet",
    });

    expect(result.nullReason).toBeNull();
    expect(result.recoverableHoursPerYear).toBe(156);
    expect(result.baseSalaryEquivalentAnnual).toBe(9000);
    expect(result.selectedCombinedMultiplier).toBe(8.57);
    expect(result.annualIllustrativeValue).toBe(77130);
    expect(result.annualIllustrativeRangeLow).toBe(57848);
    expect(result.annualIllustrativeRangeHigh).toBe(96413);
    expect(result.monthlyIllustrativeRangeLow).toBe(4821);
    expect(result.monthlyIllustrativeRangeHigh).toBe(8034);
  });

  it("returns null fields with a reason for missing numeric input", () => {
    const result = computeRoiReframe({
      annualCompensation: Number.NaN,
      freedHoursPerWeek: 3,
      roleType: "analyst",
      servedAudience: "team",
      outputType: "task",
    });

    expect(result.annualIllustrativeValue).toBeNull();
    expect(result.comparisons).toEqual([]);
    expect(result.nullReason).toBe("Annual compensation must be a positive number.");
  });

  it("caps the combined multiplier", () => {
    const result = computeRoiReframe({
      annualCompensation: 120000,
      freedHoursPerWeek: 3,
      roleType: "revenue_or_client",
      servedAudience: "customer_investor",
      outputType: "customer_asset",
    });

    expect(result.selectedCombinedMultiplier).toBe(24);
    expect(result.annualIllustrativeValue).toBe(216000);
  });
});

