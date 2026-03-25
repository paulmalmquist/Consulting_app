import { describe, expect, it } from "vitest";
import { projectFundUnderwriting } from "./underwriting";
import { runWaterfall } from "./waterfall";

describe("REPE engines", () => {
  it("projects fund underwriting with deterministic outputs", () => {
    const output = projectFundUnderwriting([
      {
        assetId: "asset-1",
        assetName: "Meridian Office Tower",
        currentNoi: 2_800_000,
        occupancy: 0.88,
        latestRevenue: 4_950_000,
        latestOtherIncome: 120_000,
        latestOpex: 2_050_000,
        latestDebtService: 950_000,
        latestCapex: 180_000,
      },
    ], {
      rentGrowthPct: 0.04,
      expenseRatio: 0.36,
      exitCapRate: 0.0575,
    });

    expect(output.assets).toHaveLength(1);
    expect(output.totals.modeled.revenue).toBeGreaterThan(output.totals.base.revenue);
    expect(output.totals.modeled.noi).toBeGreaterThan(0);
    expect(output.totals.modeled.cashFlow).toBeLessThan(output.totals.modeled.noi);
    expect(output.calcTrace.some((entry) => entry.includes("Exit value"))).toBe(true);
  });

  it("allocates a four-tier waterfall through split residual", () => {
    const result = runWaterfall({
      totalDistributable: 450_000_000,
      partners: [
        { partnerId: "gp", name: "Winston GP", partnerType: "gp", committedAmount: 10_000_000 },
        { partnerId: "lp1", name: "State Pension", partnerType: "lp", committedAmount: 200_000_000 },
        { partnerId: "lp2", name: "Endowment", partnerType: "lp", committedAmount: 140_000_000 },
      ],
      tiers: [
        { tierOrder: 1, tierType: "return_of_capital" },
        { tierOrder: 2, tierType: "preferred_return", hurdleRate: 0.08 },
        { tierOrder: 3, tierType: "catch_up", catchUpPercent: 1 },
        { tierOrder: 4, tierType: "split", splitGp: 0.2, splitLp: 0.8 },
      ],
    });

    expect(result.tierResults).toHaveLength(4);
    expect(result.tierResults[0].amount).toBeGreaterThan(0);
    expect(result.tierResults[1].amount).toBeGreaterThan(0);
    expect(result.tierResults[2].amount).toBeGreaterThan(0);
    expect(result.tierResults[3].amount).toBeGreaterThan(0);
    const gp = result.partnerResults.find((partner) => partner.partnerId === "gp");
    expect(gp?.totalDistribution || 0).toBeGreaterThan(0);
    expect(result.remaining).toBeLessThanOrEqual(0.01);
  });
});
