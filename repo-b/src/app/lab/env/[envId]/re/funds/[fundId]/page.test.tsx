import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FundDetailPage from "@/app/lab/env/[envId]/re/funds/[fundId]/page";
import { ToastProvider } from "@/components/ui/Toast";

const mockRouterPush = vi.fn();
const mockPublishAssistantPageContext = vi.fn();
const mockResetAssistantPageContext = vi.fn();

const mockDeleteRepeFund = vi.fn();
const mockGetRepeFund = vi.fn();
const mockListRepeDeals = vi.fn();
const mockListReV2Investments = vi.fn();
const mockListReV2Runs = vi.fn();
const mockGetReV2FundQuarterState = vi.fn();
const mockGetReV2FundLineage = vi.fn();
const mockGetReV2FundInvestmentRollup = vi.fn();
const mockGetReV2InvestmentAssets = vi.fn();
const mockListReV2Scenarios = vi.fn();
const mockGetFiWatchlist = vi.fn();
const mockSeedReV2Data = vi.fn();
const mockGetFundValuationRollup = vi.fn();
const mockGetIrrTimeline = vi.fn();
const mockGetCapitalTimeline = vi.fn();
const mockGetIrrContribution = vi.fn();

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock("@/components/repe/workspace/ReEnvProvider", () => ({
  useReEnv: () => ({ envId: "env-1", businessId: "biz-1" }),
}));

vi.mock("@/lib/commandbar/appContextBridge", () => ({
  publishAssistantPageContext: (...args: unknown[]) => mockPublishAssistantPageContext(...args),
  resetAssistantPageContext: () => mockResetAssistantPageContext(),
}));

vi.mock("@/components/repe/DebugFooter", () => ({
  DebugFooter: () => <div data-testid="debug-footer" />,
}));

vi.mock("@/components/repe/EntityLineagePanel", () => ({
  EntityLineagePanel: () => <div data-testid="entity-lineage-panel" />,
}));

vi.mock("@/components/repe/FundDeleteDialog", () => ({
  FundDeleteDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="fund-delete-dialog" /> : null),
}));

vi.mock("@/lib/bos-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bos-api")>("@/lib/bos-api");
  return {
    ...actual,
    deleteRepeFund: (...args: unknown[]) => mockDeleteRepeFund(...args),
    getRepeFund: (...args: unknown[]) => mockGetRepeFund(...args),
    listRepeDeals: (...args: unknown[]) => mockListRepeDeals(...args),
    listReV2Investments: (...args: unknown[]) => mockListReV2Investments(...args),
    listReV2Runs: (...args: unknown[]) => mockListReV2Runs(...args),
    getReV2FundQuarterState: (...args: unknown[]) => mockGetReV2FundQuarterState(...args),
    getReV2FundLineage: (...args: unknown[]) => mockGetReV2FundLineage(...args),
    getReV2FundInvestmentRollup: (...args: unknown[]) => mockGetReV2FundInvestmentRollup(...args),
    getReV2InvestmentAssets: (...args: unknown[]) => mockGetReV2InvestmentAssets(...args),
    listReV2Scenarios: (...args: unknown[]) => mockListReV2Scenarios(...args),
    getFiWatchlist: (...args: unknown[]) => mockGetFiWatchlist(...args),
    seedReV2Data: (...args: unknown[]) => mockSeedReV2Data(...args),
    getFundValuationRollup: (...args: unknown[]) => mockGetFundValuationRollup(...args),
    getIrrTimeline: (...args: unknown[]) => mockGetIrrTimeline(...args),
    getCapitalTimeline: (...args: unknown[]) => mockGetCapitalTimeline(...args),
    getIrrContribution: (...args: unknown[]) => mockGetIrrContribution(...args),
  };
});

describe("fund detail narrative dashboard", () => {
  function renderPage() {
    return render(
      <ToastProvider>
        <FundDetailPage params={{ envId: "env-1", fundId: "fund-1" }} />
      </ToastProvider>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetRepeFund.mockResolvedValue({
      fund: {
        fund_id: "fund-1",
        business_id: "biz-1",
        name: "Institutional Growth Fund VII",
        vintage_year: 2024,
        fund_type: "closed_end",
        strategy: "equity",
        sub_strategy: "Growth",
        target_size: 500_000_000,
        status: "investing",
        base_currency: "USD",
        quarter_cadence: "quarterly",
        created_at: "2024-01-01T00:00:00Z",
      },
      terms: [
        {
          fund_term_id: "term-1",
          fund_id: "fund-1",
          effective_from: "2024-01-01",
          preferred_return_rate: 0.08,
          carry_rate: 0.2,
          waterfall_style: "european",
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
    });

    mockListRepeDeals.mockResolvedValue([
      {
        deal_id: "deal-1",
        fund_id: "fund-1",
        name: "Harborview Logistics Park",
        deal_type: "equity",
        stage: "operating",
        sponsor: "Apex Partners",
        created_at: "2024-03-01T00:00:00Z",
      },
    ]);

    mockListReV2Investments.mockResolvedValue([
      {
        investment_id: "inv-1",
        fund_id: "fund-1",
        name: "Harborview Logistics Park",
        investment_type: "equity",
        stage: "operating",
        sponsor: "Apex Partners",
        committed_capital: 82_000_000,
        invested_capital: 74_000_000,
        created_at: "2024-03-01T00:00:00Z",
      },
    ]);

    mockListReV2Scenarios.mockResolvedValue([
      { scenario_id: "scn-1", name: "Base Case", is_base: true },
    ]);

    mockGetReV2FundQuarterState.mockResolvedValue({
      id: "state-1",
      fund_id: "fund-1",
      quarter: "2026Q1",
      run_id: "run-1",
      inputs_hash: "hash",
      created_at: "2026-03-15T00:00:00Z",
      portfolio_nav: 600_000_000,
      total_committed: 500_000_000,
      total_called: 320_000_000,
      total_distributed: 140_000_000,
      dpi: 0.44,
      tvpi: 1.82,
      gross_irr: 0.19,
      net_irr: 0.161,
    });

    mockGetReV2FundInvestmentRollup.mockResolvedValue([
      {
        investment_id: "inv-1",
        name: "Harborview Logistics Park",
        deal_type: "equity",
        stage: "operating",
        sponsor: "Apex Partners",
        asset_count: 2,
        sector_mix: { industrial: 1 },
        primary_market: "Dallas",
        invested_capital: 74_000_000,
        committed_capital: 82_000_000,
        total_asset_value: 185_000_000,
        total_noi: 8_400_000,
        weighted_occupancy: 0.95,
        computed_ltv: 0.48,
        gross_irr: 0.167,
        fund_nav_contribution: 180_000_000,
      },
    ]);

    mockGetReV2FundLineage.mockResolvedValue({
      entity_type: "fund",
      entity_id: "fund-1",
      quarter: "2026Q1",
      generated_at: "2026-03-15T00:00:00Z",
      widgets: [],
      issues: [],
    });

    mockListReV2Runs.mockResolvedValue([
      { run_type: "quarter_close", status: "success", quarter: "2025Q4" },
    ]);

    mockGetFiWatchlist.mockResolvedValue([]);
    mockSeedReV2Data.mockResolvedValue({});
    mockDeleteRepeFund.mockResolvedValue({ deleted: { investments: 1, assets: 2 } });

    mockGetFundValuationRollup.mockResolvedValue({
      fund_id: "fund-1",
      quarter: "2026Q1",
      scenario_id: null,
      summary: {
        asset_count: 21,
        total_portfolio_value: 1_120_000_000,
        total_equity: 600_000_000,
        total_debt: 520_000_000,
        total_noi: 18_600_000,
        weighted_avg_cap_rate: 0.061,
        weighted_avg_ltv: 0.465,
        weighted_avg_occupancy: 0.944,
      },
      assets: [],
    });

    mockGetIrrTimeline.mockResolvedValue([
      { quarter: "2025Q3", gross_irr: "0.14", net_irr: "0.12", portfolio_nav: "510000000", dpi: "0.31", tvpi: "1.58" },
      { quarter: "2025Q4", gross_irr: "0.17", net_irr: "0.145", portfolio_nav: "560000000", dpi: "0.38", tvpi: "1.71" },
      { quarter: "2026Q1", gross_irr: "0.19", net_irr: "0.161", portfolio_nav: "600000000", dpi: "0.44", tvpi: "1.82" },
    ]);

    mockGetCapitalTimeline.mockResolvedValue([
      { quarter: "2025Q3", total_called: "240000000", total_distributed: "90000000" },
      { quarter: "2025Q4", total_called: "280000000", total_distributed: "110000000" },
      { quarter: "2026Q1", total_called: "320000000", total_distributed: "140000000" },
    ]);

    mockGetIrrContribution.mockResolvedValue([
      {
        investment_id: "inv-1",
        investment_name: "Harborview Logistics Park",
        investment_irr: "0.167",
        investment_tvpi: "2.44",
        fund_nav_contribution: "180000000",
        irr_contribution: "180000000",
      },
      {
        investment_id: "inv-2",
        investment_name: "Sunrise Multifamily",
        investment_irr: "0.151",
        investment_tvpi: "2.12",
        fund_nav_contribution: "145000000",
        irr_contribution: "145000000",
      },
    ]);

    mockGetReV2InvestmentAssets.mockResolvedValue([
      {
        asset_id: "asset-1",
        deal_id: "inv-1",
        asset_type: "property",
        name: "Harborview Building A",
        property_type: "industrial",
        market: "Dallas",
        city: "Dallas",
        state: "TX",
        cost_basis: 74_000_000,
        asset_value: 185_000_000,
        nav: 123_000_000,
        noi: 8_400_000,
        occupancy: 0.95,
        debt_balance: 88_000_000,
      },
    ]);
  });

  it("renders the narrative overview order and actions menu", async () => {
    const user = userEvent.setup();

    renderPage();

    await screen.findByText("Institutional Growth Fund VII");

    const orderedSections = [
      await screen.findByTestId("fund-overview-header"),
      await screen.findByTestId("fund-health-summary"),
      await screen.findByTestId("kpi-group-capital"),
      await screen.findByTestId("kpi-group-performance"),
      await screen.findByTestId("fund-value-creation"),
      await screen.findByTestId("portfolio-snapshot"),
      await screen.findByTestId("performance-drivers"),
      await screen.findByTestId("capital-activity"),
      await screen.findByTestId("exposure-insights"),
      await screen.findByTestId("portfolio-holdings"),
    ];

    for (let index = 1; index < orderedSections.length; index += 1) {
      expect(
        orderedSections[index - 1].compareDocumentPosition(orderedSections[index]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }

    expect(screen.queryByTestId("delete-fund-detail")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /actions/i }));

    expect(screen.getByRole("menuitem", { name: "Export Excel Workbook" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete Fund" })).toBeInTheDocument();
  });

  it("expands an investment row to show asset-level metrics", async () => {
    const user = userEvent.setup();

    renderPage();

    await screen.findByTestId("portfolio-holdings");

    await user.click(screen.getByTestId("investment-row-inv-1"));

    const assetLink = await screen.findByRole("link", { name: "Harborview Building A" });
    const assetRow = assetLink.closest("tr");
    expect(assetRow).not.toBeNull();

    const cells = within(assetRow as HTMLTableRowElement).getAllByRole("cell");
    expect(cells[4]).toHaveClass("text-right");
    expect(cells[4]).toHaveTextContent("$185.0M");
    expect(cells[6]).toHaveTextContent("$8.4M");
    expect(cells[7]).toHaveTextContent("95.0%");
  });

  it("publishes fund assistant context once the route resolves", async () => {
    renderPage();

    await waitFor(() => {
      expect(mockPublishAssistantPageContext).toHaveBeenCalledWith(
        expect.objectContaining({
          page_entity_type: "fund",
          page_entity_id: "fund-1",
          page_entity_name: "Institutional Growth Fund VII",
          visible_data: expect.objectContaining({
            notes: expect.arrayContaining([expect.stringContaining("2026Q1")]),
          }),
        })
      );
    });
  });
});
