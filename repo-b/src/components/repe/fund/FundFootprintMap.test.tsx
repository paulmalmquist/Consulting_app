import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FundFootprintMap } from "@/components/repe/fund/FundFootprintMap";

const mockGetFundFootprintAnalytics = vi.fn();

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockFundFootprintMapInner(props: {
      viewMode: "assets" | "markets";
      onSelectAsset: (assetId: string) => void;
      onSelectMarket: (marketKey: string) => void;
    }) {
      return (
        <div data-testid="mock-fund-footprint-map-inner">
          <span>{props.viewMode}</span>
          <button type="button" onClick={() => props.onSelectAsset("asset-1")}>
            Select asset
          </button>
          <button type="button" onClick={() => props.onSelectMarket("dallas-tx")}>
            Select market
          </button>
        </div>
      );
    },
}));

vi.mock("@/lib/bos-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bos-api")>("@/lib/bos-api");
  return {
    ...actual,
    getFundFootprintAnalytics: (...args: unknown[]) => mockGetFundFootprintAnalytics(...args),
  };
});

function makePayload() {
  return {
    summary: {
      total_nav: 250_000_000,
      owned_assets: 2,
      pipeline_assets: 0,
      disposed_assets: 1,
      markets: 2,
      geography_allocation: [
        { region: "South", total_nav: 150_000_000, asset_count: 1, share_of_nav: 0.6 },
        { region: "West", total_nav: 100_000_000, asset_count: 2, share_of_nav: 0.4 },
      ],
      top_markets: [
        {
          market_key: "dallas-tx",
          market_label: "Dallas, TX",
          total_nav: 150_000_000,
          share_of_nav: 0.6,
          avg_occupancy: 0.95,
          avg_dscr: 1.4,
          integrity_issues: 0,
          performance_state: "outperforming" as const,
        },
      ],
      performance_by_market: [],
      signals: ["Overexposed market: Dallas, TX (60% NAV)"],
    },
    selection_defaults: { mode: "portfolio" as const },
    asset_points: [
      {
        asset_id: "asset-1",
        name: "Meridian Industrial One",
        status: "owned" as const,
        lifecycle: "stabilized" as const,
        property_type: "Industrial",
        market: "Dallas, TX",
        market_key: "dallas-tx",
        city: "Dallas",
        state: "TX",
        lat: 32.7767,
        lon: -96.797,
        cost_basis: 95_000_000,
        asset_value: 150_000_000,
        noi: 8_400_000,
        occupancy: 0.95,
        dscr: 1.42,
        ltv: 0.55,
        valuation_quarter: "2026Q1",
        trust_status: "trusted",
        dscr_trust_state: "verified",
        dscr_reason: null,
        integrity_reason: null,
      },
      {
        asset_id: "asset-2",
        name: "Phoenix Flex",
        status: "disposed" as const,
        lifecycle: "stabilized" as const,
        property_type: "Industrial",
        market: "Phoenix, AZ",
        market_key: "phoenix-az",
        city: "Phoenix",
        state: "AZ",
        lat: 33.4484,
        lon: -112.074,
        cost_basis: 45_000_000,
        asset_value: 100_000_000,
        noi: 4_100_000,
        occupancy: 0.88,
        dscr: null,
        ltv: 0.61,
        valuation_quarter: "2026Q1",
        trust_status: "trusted",
        dscr_trust_state: "missing_inputs",
        dscr_reason: "missing_loan_debt_service",
        integrity_reason: "missing_loan_debt_service",
      },
    ],
    market_rollups: [
      {
        market_key: "dallas-tx",
        market_label: "Dallas, TX",
        state: "TX",
        lat: 32.7767,
        lon: -96.797,
        asset_count: 1,
        total_nav: 150_000_000,
        avg_occupancy: 0.95,
        avg_dscr: 1.42,
        avg_irr: null,
        integrity_issues: 0,
        status_breakdown: { owned: 1, pipeline: 0, disposed: 0 },
        performance_state: "outperforming" as const,
        lead_asset_ids: ["asset-1"],
      },
    ],
    asset_series: {
      "asset-1": [
        { quarter: "2025Q4", noi: 7_900_000, occupancy: 0.93, asset_value: 145_000_000, dscr: 1.35, ltv: 0.57 },
        { quarter: "2026Q1", noi: 8_400_000, occupancy: 0.95, asset_value: 150_000_000, dscr: 1.42, ltv: 0.55 },
      ],
    },
    market_series: {
      "dallas-tx": [
        { quarter: "2025Q4", total_nav: 145_000_000, total_noi: 7_900_000, avg_occupancy: 0.93, avg_dscr: 1.35 },
        { quarter: "2026Q1", total_nav: 150_000_000, total_noi: 8_400_000, avg_occupancy: 0.95, avg_dscr: 1.42 },
      ],
    },
  };
}

describe("FundFootprintMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockGetFundFootprintAnalytics.mockResolvedValue(makePayload());
  });

  test("renders the dual-pane portfolio surface with analytics summary", async () => {
    render(
      <FundFootprintMap
        envId="env-1"
        businessId="biz-1"
        fundId="fund-1"
        quarter="2026Q1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Decision Surface")).toBeInTheDocument();
    });

    expect(screen.getByText("Geographic Allocation")).toBeInTheDocument();
    expect(screen.getByText("Market Concentration Risk")).toBeInTheDocument();
    expect(screen.getByText("Overexposed market: Dallas, TX (60% NAV)")).toBeInTheDocument();
    expect(screen.getByTestId("mock-fund-footprint-map-inner")).toBeInTheDocument();
  });

  test("switches into asset and market deep-dive views from map-driven selection", async () => {
    const user = userEvent.setup();

    render(
      <FundFootprintMap
        envId="env-1"
        businessId="biz-1"
        fundId="fund-1"
        quarter="2026Q1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Decision Surface")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Select asset" }));

    expect(screen.getByText("Asset Trend")).toBeInTheDocument();
    expect(screen.getByText("Debt + Action")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "markets" }));
    await user.click(screen.getByRole("button", { name: "Select market" }));

    expect(screen.getByText("Market Trend")).toBeInTheDocument();
    expect(screen.getByText("Assets In Market")).toBeInTheDocument();
  });
});
