import { describe, expect, it } from "vitest";
import { computeResumeScenario } from "../modelingMath";
import { deriveResumeBiSlice } from "../biMath";
import type { ResumeBi } from "@/lib/bos-api";

describe("computeResumeScenario", () => {
  it("produces waterfall and positive distributions for the base scenario", () => {
    const result = computeResumeScenario(
      {
        purchase_price: 128000000,
        exit_cap_rate: 0.055,
        hold_period: 5,
        noi_growth_pct: 0.035,
        debt_pct: 0.58,
      },
      {
        entry_cap_rate: 0.059,
        debt_rate: 0.062,
        exit_cost_pct: 0.018,
        lp_equity_share: 0.9,
        gp_equity_share: 0.1,
        pref_rate: 0.08,
        catch_up_ratio: 0.3,
        residual_lp_split: 0.7,
        residual_gp_split: 0.3,
      },
    );

    expect(result.annualCashFlows).toHaveLength(5);
    expect(result.waterfall[result.waterfall.length - 1]?.isTotal).toBe(true);
    expect(result.lpDistribution).toBeGreaterThan(result.gpDistribution);
    expect(result.tvpi).toBeGreaterThan(1);
  });
});

describe("deriveResumeBiSlice", () => {
  it("aggregates descendants and preserves breadcrumb context", () => {
    const bi: ResumeBi = {
      root_entity_id: "portfolio-root",
      levels: ["portfolio", "fund", "investment", "asset"],
      markets: ["Phoenix"],
      property_types: ["Multifamily"],
      periods: ["2025-01"],
      entities: [
        {
          entity_id: "portfolio-root",
          parent_id: null,
          level: "portfolio",
          name: "Portfolio",
          market: null,
          property_type: null,
          sector: null,
          coordinates: null,
          metrics: { portfolio_value: 0, noi: 0, occupancy: 0, irr: 0 },
          trend: [],
          story: "root",
          linked_architecture_node_ids: [],
          linked_timeline_ids: [],
        },
        {
          entity_id: "fund-1",
          parent_id: "portfolio-root",
          level: "fund",
          name: "Fund 1",
          market: null,
          property_type: null,
          sector: null,
          coordinates: null,
          metrics: { portfolio_value: 0, noi: 0, occupancy: 0, irr: 0 },
          trend: [],
          story: "fund",
          linked_architecture_node_ids: [],
          linked_timeline_ids: [],
        },
        {
          entity_id: "asset-1",
          parent_id: "fund-1",
          level: "asset",
          name: "Asset 1",
          market: "Phoenix",
          property_type: "Multifamily",
          sector: "Residential",
          coordinates: { x: 0.5, y: 0.5 },
          metrics: { portfolio_value: 100, noi: 10, occupancy: 0.95, irr: 0.17 },
          trend: [{ period: "2025-01", noi: 10, occupancy: 0.95, value: 100, irr: 0.17 }],
          story: "asset",
          linked_architecture_node_ids: [],
          linked_timeline_ids: [],
        },
      ],
    };

    const slice = deriveResumeBiSlice(bi, "fund-1", {
      market: "All Markets",
      propertyType: "All Types",
      period: "2025-01",
    });

    expect(slice.breadcrumb.map((item) => item.entity_id)).toEqual(["portfolio-root", "fund-1"]);
    expect(slice.kpis.portfolio_value).toBe(100);
    expect(slice.kpis.noi).toBe(10);
    expect(slice.sectorBreakdown[0]?.name).toBe("Residential");
  });
});
