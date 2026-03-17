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
const mockGetFundBaseScenario = vi.fn();

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

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 400 }}>{children}</div>
    ),
  };
});

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
    getFundBaseScenario: (...args: unknown[]) => mockGetFundBaseScenario(...args),
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

    mockGetFundBaseScenario.mockResolvedValue({
      fund_id: "fund-1",
      fund_name: "Institutional Growth Fund VII",
      quarter: "2026Q1",
      scenario_id: null,
      liquidation_mode: "current_state",
      as_of_date: "2026-03-31",
      summary: {
        active_assets: 1,
        disposed_assets: 1,
        pipeline_assets: 0,
        attributable_nav: 182_000_000,
        attributable_unrealized_nav: 182_000_000,
        hypothetical_asset_value: 182_000_000,
        realized_proceeds: 46_000_000,
        retained_realized_cash: 18_000_000,
        current_distributable_proceeds: 18_000_000,
        remaining_value: 200_000_000,
        total_value: 340_000_000,
        paid_in_capital: 320_000_000,
        distributed_capital: 140_000_000,
        total_committed: 500_000_000,
        dpi: 0.4375,
        rvpi: 0.625,
        tvpi: 1.0625,
        gross_irr: 0.185,
        net_irr: 0.152,
        net_tvpi: 0.9844,
        unrealized_gain_loss: 48_000_000,
        realized_gain_loss: 12_000_000,
        management_fees: 9_500_000,
        fund_expenses: 3_200_000,
        carry_shadow: 2_400_000,
        lp_historical_distributed: 128_000_000,
        gp_historical_distributed: 12_000_000,
        lp_liquidation_allocation: 186_000_000,
        gp_liquidation_allocation: 14_000_000,
        promote_earned: 2_400_000,
        preferred_return_shortfall: 0,
        preferred_return_excess: 0,
      },
      value_composition: {
        historical_realized_proceeds: 46_000_000,
        retained_realized_cash: 18_000_000,
        attributable_unrealized_nav: 182_000_000,
        hypothetical_liquidation_value: 182_000_000,
        remaining_value: 200_000_000,
        total_value: 340_000_000,
      },
      waterfall: {
        definition_id: "wf-1",
        waterfall_type: "european",
        total_liquidation_value: 200_000_000,
        lp_total: 186_000_000,
        gp_total: 14_000_000,
        promote_total: 2_400_000,
        tiers: [
          {
            tier_code: "return_of_capital",
            tier_label: "Return of Capital",
            lp_amount: 150_000_000,
            gp_amount: 10_000_000,
            total_amount: 160_000_000,
            remaining_after: 40_000_000,
          },
          {
            tier_code: "split",
            tier_label: "Residual Split",
            lp_amount: 36_000_000,
            gp_amount: 4_000_000,
            total_amount: 40_000_000,
            remaining_after: 0,
          },
        ],
        partner_allocations: [
          {
            partner_id: "lp-1",
            name: "State Pension Fund",
            partner_type: "lp",
            committed: 200_000_000,
            contributed: 128_000_000,
            distributed: 56_000_000,
            nav_share: 72_000_000,
            dpi: 0.4375,
            rvpi: 0.5625,
            tvpi: 1,
            irr: 0.144,
            waterfall_allocation: {
              return_of_capital: 60_000_000,
              preferred_return: 0,
              catch_up: 0,
              split: 12_000_000,
              total: 72_000_000,
            },
          },
        ],
      },
      bridge: [
        { label: "Paid-In Capital", amount: -320_000_000, kind: "base" },
        { label: "Distributed Capital", amount: 140_000_000, kind: "positive" },
        { label: "Historical Realized Proceeds", amount: 46_000_000, kind: "positive" },
        { label: "Remaining Asset Value", amount: 182_000_000, kind: "positive" },
        { label: "Fees and Expenses", amount: -12_700_000, kind: "negative" },
        { label: "Promote / Carry", amount: -2_400_000, kind: "negative" },
        { label: "Ending Total Value", amount: 340_000_000, kind: "total" },
      ],
      assets: [
        {
          asset_id: "asset-1",
          asset_name: "Harborview Building A",
          investment_id: "inv-1",
          investment_name: "Harborview Logistics Park",
          asset_status: "active",
          status_category: "active",
          property_type: "industrial",
          market: "Dallas",
          valuation_method: "cap_rate",
          ownership_percent: 0.85,
          attributable_equity_basis: 74_000_000,
          gross_asset_value: 185_000_000,
          debt_balance: 88_000_000,
          net_asset_value: 123_000_000,
          attributable_gross_value: 157_250_000,
          attributable_nav: 104_550_000,
          attributable_noi: 7_140_000,
          attributable_net_cash_flow: 5_900_000,
          gross_sale_price: 0,
          sale_costs: 0,
          debt_payoff: 0,
          net_sale_proceeds: 0,
          attributable_realized_proceeds: 0,
          attributable_hypothetical_proceeds: 0,
          current_value_contribution: 104_550_000,
          realized_gain_loss: 0,
          unrealized_gain_loss: 30_550_000,
          has_sale_assumption: false,
          sale_assumption_id: null,
          sale_date: null,
          source: "current_mark",
          notes: [],
        },
        {
          asset_id: "asset-2",
          asset_name: "Legacy Retail Center",
          investment_id: "inv-2",
          investment_name: "Legacy Retail Center",
          asset_status: "exited",
          status_category: "disposed",
          property_type: "retail",
          market: "Atlanta",
          valuation_method: "sale",
          ownership_percent: 1,
          attributable_equity_basis: 34_000_000,
          gross_asset_value: 0,
          debt_balance: 0,
          net_asset_value: 0,
          attributable_gross_value: 0,
          attributable_nav: 0,
          attributable_noi: 0,
          attributable_net_cash_flow: 0,
          gross_sale_price: 62_000_000,
          sale_costs: 1_500_000,
          debt_payoff: 14_500_000,
          net_sale_proceeds: 46_000_000,
          attributable_realized_proceeds: 46_000_000,
          attributable_hypothetical_proceeds: 0,
          current_value_contribution: 0,
          realized_gain_loss: 12_000_000,
          unrealized_gain_loss: 0,
          has_sale_assumption: false,
          sale_assumption_id: null,
          sale_date: "2025-11-15",
          source: "seed",
          notes: [],
        },
      ],
      assumptions: {
        ownership_model: "Direct asset ownership uses JV ownership when present; LP/GP economics are applied in the fund waterfall layer.",
        realized_allocation_method: "Historical asset realizations use explicit asset events when available and otherwise allocate deal-level realized distributions by cost basis.",
        liquidation_mode: "current_state",
        notes: [
          "Paid-in capital uses contribution ledger entries through the selected quarter.",
        ],
      },
    });

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
      await screen.findByTestId("portfolio-snapshot"),
      await screen.findByTestId("fund-value-creation"),
      await screen.findByTestId("portfolio-allocation"),
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

  it("renders the portfolio snapshot and allocation context from seeded rollups", async () => {
    renderPage();

    const snapshot = await screen.findByTestId("portfolio-snapshot");
    expect(within(snapshot).getByText("Assets")).toBeInTheDocument();
    expect(snapshot).toHaveTextContent("21");
    expect(snapshot).toHaveTextContent("94.4%");
    expect(snapshot).toHaveTextContent("$18.6M");

    const allocation = await screen.findByTestId("portfolio-allocation");
    expect(allocation).toHaveTextContent("Industrial");
    expect(allocation).toHaveTextContent("100.0%");
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

  it("renders the base scenario summary and performance bridge", async () => {
    const user = userEvent.setup();

    renderPage();

    const summary = await screen.findByTestId("base-scenario-summary");
    expect(summary).toHaveTextContent("Current Fund Economics");
    expect(summary).toHaveTextContent("Disposed Assets");
    expect(summary).toHaveTextContent("$46.0M");

    await user.click(screen.getByRole("button", { name: "Performance" }));

    const returns = await screen.findByTestId("returns-section");
    expect(within(returns).getByTestId("value-composition-card")).toHaveTextContent("Historical Realized Proceeds");
    expect(within(returns).getByTestId("fund-returns-card")).toHaveTextContent("TVPI");
    expect(within(returns).getByTestId("waterfall-allocation-card")).toHaveTextContent("Promote Earned");
    expect(within(returns).getByTestId("asset-contribution-table")).toHaveTextContent("Legacy Retail Center");
    expect(within(returns).getByTestId("waterfall-tier-results")).toHaveTextContent("Return of Capital");
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
