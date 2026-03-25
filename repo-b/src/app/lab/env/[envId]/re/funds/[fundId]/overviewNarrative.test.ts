import { describe, expect, it } from "vitest";
import {
  buildExposureInsights,
  buildFundHealthSummary,
  buildPerformanceDrivers,
  buildPortfolioTableRows,
  getDominantPropertyTypeKey,
  mergeValueCreationSeries,
} from "./overviewNarrative";

describe("fund overview narrative helpers", () => {
  it("merges quarter-aligned value creation series with fill-forward cumulative values", () => {
    const merged = mergeValueCreationSeries(
      [
        { quarter: "2025Q1", gross_irr: null, net_irr: null, portfolio_nav: "100", dpi: null, tvpi: null },
        { quarter: "2025Q3", gross_irr: null, net_irr: null, portfolio_nav: "160", dpi: null, tvpi: null },
      ],
      [
        { quarter: "2025Q2", total_called: "120", total_distributed: "10" },
        { quarter: "2025Q3", total_called: "150", total_distributed: "30" },
      ]
    );

    expect(merged).toEqual([
      { quarter: "2025Q1", calledCapital: 0, distributions: 0, nav: 100, totalValue: 100 },
      { quarter: "2025Q2", calledCapital: 120, distributions: 10, nav: 100, totalValue: 110 },
      { quarter: "2025Q3", calledCapital: 150, distributions: 30, nav: 160, totalValue: 190 },
    ]);
  });

  it("weights exposure by fund nav contribution with current value fallback", () => {
    const insights = buildExposureInsights([
      {
        investment_id: "inv-1",
        name: "Harborview Logistics Park",
        sector_mix: { industrial: 0.6, office: 0.4 },
        fund_nav_contribution: 100,
        primary_market: "Dallas",
      },
      {
        investment_id: "inv-2",
        name: "Sunrise Retail Center",
        sector_mix: { retail: 1 },
        total_asset_value: 50,
        primary_market: "Atlanta",
      },
    ]);

    expect(insights.sector.map((row) => row.label)).toEqual(["industrial", "retail", "office"]);
    expect(insights.sector[0].value).toBeCloseTo(60);
    expect(insights.geography[0]).toMatchObject({ label: "Dallas" });
    expect(insights.geography[0].pct).toBeCloseTo(66.666, 2);
  });

  it("picks the dominant property type and maps hybrid table metrics from existing rollup data", () => {
    expect(getDominantPropertyTypeKey({ office: 0.25, industrial: 0.75 })).toBe("industrial");

    const rows = buildPortfolioTableRows(
      [
        {
          investment_id: "inv-1",
          fund_id: "fund-1",
          name: "Harborview Logistics Park",
          investment_type: "equity",
          stage: "operating",
          committed_capital: 15_000_000,
          invested_capital: 12_000_000,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      new Map([
        [
          "inv-1",
          {
            investment_id: "inv-1",
            name: "Harborview Logistics Park",
            primary_market: "Dallas",
            sector_mix: { industrial: 0.75, office: 0.25 },
            invested_capital: 12_000_000,
            committed_capital: 15_000_000,
            total_asset_value: 21_000_000,
            gross_irr: 0.167,
            total_noi: 1_850_000,
            weighted_occupancy: 0.94,
            computed_ltv: 0.52,
          },
        ],
      ])
    );

    expect(rows[0]).toMatchObject({
      propertyTypeKey: "industrial",
      market: "Dallas",
      equityInvested: 12_000_000,
      currentValue: 21_000_000,
      irr: 0.167,
      noi: 1_850_000,
      occupancy: 0.94,
      ltv: 0.52,
    });
  });

  it("returns a sparse-data health summary fallback when fund-level metrics are missing", () => {
    const summary = buildFundHealthSummary({
      fundState: null,
      exposureInsights: { sector: [], geography: [] },
      performanceDrivers: [],
    });

    expect(summary.label).toBe("Developing");
    expect(summary.headline).toContain("limited fund-level return history");
    expect(summary.detail).toContain("capital activity and valuations accumulate");
  });

  it("derives strong performance drivers against current fund nav", () => {
    const drivers = buildPerformanceDrivers(
      [
        {
          investment_id: "inv-1",
          investment_name: "Harborview Logistics Park",
          investment_irr: "0.167",
          investment_tvpi: "2.4",
          fund_nav_contribution: "180",
          irr_contribution: "180",
        },
        {
          investment_id: "inv-2",
          investment_name: "Midtown Residential",
          investment_irr: "0.151",
          investment_tvpi: "2.1",
          fund_nav_contribution: "120",
          irr_contribution: "120",
        },
      ],
      600
    );

    const summary = buildFundHealthSummary({
      fundState: {
        id: "state-1",
        fund_id: "fund-1",
        quarter: "2026Q1",
        run_id: "run-1",
        inputs_hash: "hash",
        created_at: "2026-03-15T00:00:00Z",
        total_distributed: 240,
        portfolio_nav: 360,
        tvpi: 1.8,
        net_irr: 0.161,
      },
      exposureInsights: {
        sector: [{ label: "industrial", value: 300, pct: 60 }],
        geography: [{ label: "Dallas", value: 220, pct: 44 }],
      },
      performanceDrivers: drivers,
    });

    expect(summary.label).toBe("Strong");
    expect(summary.headline).toContain("TVPI of 1.80x");
    expect(summary.detail).toContain("60% of value remains unrealized");
    expect(summary.detail).toContain("industrial");
  });
});
