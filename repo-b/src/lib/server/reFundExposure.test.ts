import { describe, expect, it } from "vitest";

import {
  aggregateFundExposureFromAssets,
  type FundExposureInsightsResult,
} from "./reFundExposure";
import type { BaseScenarioAssetContribution } from "./reBaseScenario";

function makeAsset(overrides: Partial<BaseScenarioAssetContribution>): BaseScenarioAssetContribution {
  return {
    asset_id: overrides.asset_id ?? "asset-1",
    asset_name: overrides.asset_name ?? "Asset",
    investment_id: overrides.investment_id ?? "inv-1",
    investment_name: overrides.investment_name ?? "Investment",
    investment_type: overrides.investment_type ?? "equity",
    asset_status: overrides.asset_status ?? "active",
    status_category: overrides.status_category ?? "active",
    property_type: "property_type" in overrides ? (overrides.property_type ?? null) : "industrial",
    market: "market" in overrides ? (overrides.market ?? null) : "Dallas",
    city: "city" in overrides ? (overrides.city ?? null) : null,
    state: "state" in overrides ? (overrides.state ?? null) : null,
    msa: "msa" in overrides ? (overrides.msa ?? null) : null,
    valuation_method: overrides.valuation_method ?? "cap_rate",
    ownership_percent: overrides.ownership_percent ?? 1,
    attributable_equity_basis: overrides.attributable_equity_basis ?? 0,
    gross_asset_value: overrides.gross_asset_value ?? 0,
    debt_balance: overrides.debt_balance ?? 0,
    net_asset_value: overrides.net_asset_value ?? 0,
    attributable_gross_value: overrides.attributable_gross_value ?? 0,
    attributable_nav: overrides.attributable_nav ?? 0,
    attributable_noi: overrides.attributable_noi ?? 0,
    attributable_net_cash_flow: overrides.attributable_net_cash_flow ?? 0,
    gross_sale_price: overrides.gross_sale_price ?? 0,
    sale_costs: overrides.sale_costs ?? 0,
    debt_payoff: overrides.debt_payoff ?? 0,
    net_sale_proceeds: overrides.net_sale_proceeds ?? 0,
    attributable_realized_proceeds: overrides.attributable_realized_proceeds ?? 0,
    attributable_hypothetical_proceeds: overrides.attributable_hypothetical_proceeds ?? 0,
    current_value_contribution: overrides.current_value_contribution ?? 0,
    realized_gain_loss: overrides.realized_gain_loss ?? 0,
    unrealized_gain_loss: overrides.unrealized_gain_loss ?? 0,
    has_sale_assumption: overrides.has_sale_assumption ?? false,
    sale_assumption_id: overrides.sale_assumption_id ?? null,
    sale_date: overrides.sale_date ?? null,
    source: overrides.source ?? "seed",
    notes: overrides.notes ?? [],
  };
}

function findBucket(result: FundExposureInsightsResult, key: "sector_allocation" | "geographic_allocation", label: string) {
  return result[key].find((row) => row.label === label);
}

describe("aggregateFundExposureFromAssets", () => {
  it("uses NAV first, then current value, then cost basis without dropping usable rows", () => {
    const result = aggregateFundExposureFromAssets([
      makeAsset({
        asset_id: "asset-nav",
        investment_id: "inv-1",
        property_type: "industrial",
        market: "Dallas",
        attributable_nav: 120,
        current_value_contribution: 120,
        attributable_equity_basis: 90,
      }),
      makeAsset({
        asset_id: "asset-current",
        investment_id: "inv-2",
        property_type: "retail",
        market: "Atlanta",
        attributable_nav: 0,
        current_value_contribution: 60,
        attributable_equity_basis: 50,
      }),
      makeAsset({
        asset_id: "asset-cost",
        investment_id: "inv-3",
        investment_type: "debt",
        property_type: null,
        market: null,
        attributable_nav: 0,
        current_value_contribution: 0,
        attributable_equity_basis: 40,
      }),
    ], { includeDebug: true });

    expect(result.weighting_basis_used).toBe("mixed");
    expect(result.total_weight).toBe(220);
    expect(findBucket(result, "sector_allocation", "industrial")?.value).toBe(120);
    expect(findBucket(result, "sector_allocation", "retail")?.value).toBe(60);
    expect(findBucket(result, "sector_allocation", "debt")?.value).toBe(40);
    expect(findBucket(result, "geographic_allocation", "Unknown")?.value).toBe(40);
    expect(result.geographic_summary.coverage_pct).toBeCloseTo((180 / 220) * 100, 2);
    expect(result.debug).toMatchObject({
      nav_weight_rows: 1,
      current_value_fallback_rows: 1,
      cost_basis_fallback_rows: 1,
    });
  });

  it("falls back to dominant investment-level classifications when an asset row is sparse", () => {
    const result = aggregateFundExposureFromAssets([
      makeAsset({
        asset_id: "asset-1",
        investment_id: "inv-1",
        property_type: "industrial",
        market: "Dallas",
        attributable_nav: 80,
        current_value_contribution: 80,
      }),
      makeAsset({
        asset_id: "asset-2",
        investment_id: "inv-1",
        property_type: null,
        market: null,
        city: null,
        state: null,
        msa: null,
        attributable_nav: 0,
        current_value_contribution: 20,
        attributable_equity_basis: 20,
      }),
    ]);

    expect(result.sector_summary.coverage_pct).toBe(100);
    expect(result.geographic_summary.coverage_pct).toBe(100);
    expect(findBucket(result, "sector_allocation", "industrial")?.value).toBe(100);
    expect(findBucket(result, "geographic_allocation", "Dallas")?.value).toBe(100);
  });

  it("does not resurrect disposed assets through cost-basis fallback", () => {
    const result = aggregateFundExposureFromAssets([
      makeAsset({
        asset_id: "disposed-asset",
        status_category: "disposed",
        asset_status: "exited",
        property_type: "retail",
        market: "Atlanta",
        attributable_nav: 0,
        current_value_contribution: 0,
        attributable_equity_basis: 90,
      }),
      makeAsset({
        asset_id: "active-asset",
        property_type: "office",
        market: "Chicago",
        attributable_nav: 30,
        current_value_contribution: 30,
      }),
    ]);

    expect(result.total_weight).toBe(30);
    expect(result.sector_allocation).toEqual([
      expect.objectContaining({ label: "office", value: 30 }),
    ]);
  });
});
