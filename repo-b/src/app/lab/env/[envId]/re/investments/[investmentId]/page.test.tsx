import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import InvestmentSummaryPage from "@/app/lab/env/[envId]/re/investments/[investmentId]/page";

const mockRouterReplace = vi.fn();
let currentSearchParams = new URLSearchParams();

const mockGetReV2Investment = vi.fn();
const mockGetRepeFund = vi.fn();
const mockListReV2Jvs = vi.fn();
const mockListReV2Models = vi.fn();
const mockListReV2Scenarios = vi.fn();
const mockGetReV2InvestmentHistory = vi.fn();
const mockGetReV2InvestmentQuarterState = vi.fn();
const mockGetReV2InvestmentAssets = vi.fn();
const mockGetReV2InvestmentLineage = vi.fn();
const mockGetReV2FundQuarterState = vi.fn();
const mockListReV2ScenarioVersions = vi.fn();
const mockPublishAssistantPageContext = vi.fn();
const mockResetAssistantPageContext = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => currentSearchParams,
}));

vi.mock("@/components/repe/workspace/ReEnvProvider", () => ({
  useReEnv: () => ({ businessId: "biz-1" }),
}));

vi.mock("@/lib/commandbar/appContextBridge", () => ({
  publishAssistantPageContext: (...args: unknown[]) => mockPublishAssistantPageContext(...args),
  resetAssistantPageContext: () => mockResetAssistantPageContext(),
}));

vi.mock("@/components/charts/TrendLineChart", () => ({
  default: () => <div data-testid="trend-line-chart" />,
}));

vi.mock("@/components/charts/QuarterlyBarChart", () => ({
  default: () => <div data-testid="quarterly-bar-chart" />,
}));

vi.mock("@/components/repe/EntityLineagePanel", () => ({
  EntityLineagePanel: () => <div data-testid="entity-lineage-panel" />,
}));

vi.mock("@/components/repe/RepeEntityDocuments", () => ({
  default: () => <div data-testid="attachments-panel" />,
}));

vi.mock("@/lib/bos-api", () => ({
  getReV2Investment: (...args: unknown[]) => mockGetReV2Investment(...args),
  getRepeFund: (...args: unknown[]) => mockGetRepeFund(...args),
  listReV2Jvs: (...args: unknown[]) => mockListReV2Jvs(...args),
  listReV2Models: (...args: unknown[]) => mockListReV2Models(...args),
  listReV2Scenarios: (...args: unknown[]) => mockListReV2Scenarios(...args),
  getReV2InvestmentHistory: (...args: unknown[]) => mockGetReV2InvestmentHistory(...args),
  getReV2InvestmentQuarterState: (...args: unknown[]) => mockGetReV2InvestmentQuarterState(...args),
  getReV2InvestmentAssets: (...args: unknown[]) => mockGetReV2InvestmentAssets(...args),
  getReV2InvestmentLineage: (...args: unknown[]) => mockGetReV2InvestmentLineage(...args),
  getReV2FundQuarterState: (...args: unknown[]) => mockGetReV2FundQuarterState(...args),
  listReV2ScenarioVersions: (...args: unknown[]) => mockListReV2ScenarioVersions(...args),
}));

describe("investment briefing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearchParams = new URLSearchParams();

    mockGetReV2Investment.mockResolvedValue({
      investment_id: "inv-1",
      fund_id: "fund-1",
      name: "Meridian Office Tower",
      investment_type: "Equity Investment",
      stage: "operating",
      sponsor: "Apex Partners",
      target_close_date: "2020-03-15",
      committed_capital: 45000000,
      invested_capital: 43000000,
      realized_distributions: 12000000,
      as_of_quarter: "2026Q1",
      created_at: "2026-03-01T00:00:00Z",
    });
    mockGetRepeFund.mockResolvedValue({
      fund: {
        fund_id: "fund-1",
        business_id: "biz-1",
        name: "Institutional Growth Fund VII",
        vintage_year: 2020,
        fund_type: "closed_end",
        strategy: "equity",
        sub_strategy: "Value Add",
        status: "investing",
        base_currency: "USD",
        quarter_cadence: "quarterly",
        created_at: "2020-01-01T00:00:00Z",
      },
      terms: [],
    });
    mockListReV2Jvs.mockResolvedValue([]);
    mockListReV2Models.mockResolvedValue([{ model_id: "model-1", name: "Base Model" }]);
    mockListReV2Scenarios.mockResolvedValue([{ scenario_id: "scn-1", model_id: "model-1", name: "Base Case", is_base: true }]);
    mockGetReV2InvestmentHistory.mockResolvedValue({
      investment_id: "inv-1",
      fund_id: "fund-1",
      as_of_quarter: "2026Q1",
      scenario_id: null,
      version_id: null,
      operating_history: [
        { quarter: "2025Q1", noi: 950000, revenue: 2100000, opex: 1150000, occupancy: 0.89, asset_value: 76000000, debt_balance: 28000000 },
        { quarter: "2025Q2", noi: 980000, revenue: 2140000, opex: 1160000, occupancy: 0.9, asset_value: 77200000, debt_balance: 27600000 },
        { quarter: "2025Q3", noi: 1010000, revenue: 2190000, opex: 1180000, occupancy: 0.91, asset_value: 78100000, debt_balance: 27100000 },
        { quarter: "2025Q4", noi: 1030000, revenue: 2240000, opex: 1210000, occupancy: 0.915, asset_value: 79000000, debt_balance: 26800000 },
        { quarter: "2026Q1", noi: 1100000, revenue: 2290000, opex: 1190000, occupancy: 0.922, asset_value: 78900000, debt_balance: 26300000 },
      ],
      returns_history: [
        { quarter: "2025Q4", nav: 50000000, gross_irr: 0.108, net_irr: 0.091, equity_multiple: 2.88, fund_nav_contribution: 50000000 },
        { quarter: "2026Q1", nav: 52600000, gross_irr: 0.116, net_irr: 0.098, equity_multiple: 3.03, fund_nav_contribution: 52600000 },
      ],
    });
    mockGetReV2InvestmentQuarterState.mockResolvedValue({
      investment_id: "inv-1",
      quarter: "2026Q1",
      nav: 52600000,
      committed_capital: 45000000,
      invested_capital: 43000000,
      realized_distributions: 12000000,
      gross_irr: 0.116,
      net_irr: 0.098,
      equity_multiple: 3.03,
      noi: 1100000,
      gross_asset_value: 78900000,
      debt_balance: 26300000,
      debt_service: 640000,
      cash_balance: 2500000,
      fund_nav_contribution: 52600000,
    });
    mockGetReV2InvestmentAssets.mockResolvedValue([
      {
        asset_id: "asset-1",
        deal_id: "inv-1",
        asset_type: "property",
        name: "Meridian Asset",
        cost_basis: 45000000,
        property_type: "Office",
        market: "Denver CBD",
        msa: "Denver CBD",
        occupancy: 0.922,
        noi: 1100000,
        debt_balance: 26300000,
        asset_value: 78900000,
        nav: 52600000,
      },
    ]);
    mockGetReV2InvestmentLineage.mockResolvedValue({
      entity_type: "investment",
      entity_id: "inv-1",
      quarter: "2026Q1",
      generated_at: "2026-03-01T00:00:00Z",
      widgets: [],
      issues: [],
    });
    mockGetReV2FundQuarterState.mockResolvedValue({
      fund_id: "fund-1",
      quarter: "2026Q1",
      portfolio_nav: 425000000,
    });
    mockListReV2ScenarioVersions.mockResolvedValue([{ version_id: "ver-1", version_number: 1, label: "Locked Base", is_locked: true }]);
  });

  test("renders the institutional briefing structure and hero metric order", async () => {
    const { container } = render(
      <InvestmentSummaryPage params={{ envId: "env-1", investmentId: "inv-1" }} />
    );

    await screen.findByText("Generate Report");

    const orderedSections = [
      await screen.findByTestId("section-position-snapshot"),
      await screen.findByTestId("section-operating-performance"),
      await screen.findByTestId("section-investor-returns"),
      await screen.findByTestId("section-capital-structure"),
      await screen.findByTestId("section-portfolio-exposure"),
      await screen.findByTestId("section-supporting-detail"),
    ];
    for (let i = 1; i < orderedSections.length; i += 1) {
      expect(
        orderedSections[i - 1].compareDocumentPosition(orderedSections[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }

    const heroMetrics = [
      await screen.findByTestId("hero-metric-nav"),
      await screen.findByTestId("hero-metric-gross-irr"),
      await screen.findByTestId("hero-metric-moic"),
      await screen.findByTestId("hero-metric-noi"),
    ];
    for (let i = 1; i < heroMetrics.length; i += 1) {
      expect(
        heroMetrics[i - 1].compareDocumentPosition(heroMetrics[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }

    await screen.findByText("Generate Report");
    await screen.findByText("View Lineage");
    await screen.findByText("Open Sustainability Module");
  });

  test("fetches history and quarter-state without scenario/version params", async () => {
    currentSearchParams = new URLSearchParams("quarter=2026Q1");

    render(<InvestmentSummaryPage params={{ envId: "env-1", investmentId: "inv-1" }} />);

    await waitFor(() => {
      expect(mockGetReV2InvestmentHistory).toHaveBeenCalledWith("inv-1", {});
    });
  });

  test("publishes assistant context with investment, fund, and valuation quarter", async () => {
    render(<InvestmentSummaryPage params={{ envId: "env-1", investmentId: "inv-1" }} />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith("?quarter=2026Q1", { scroll: false });
    });

    await waitFor(() => {
      expect(mockPublishAssistantPageContext).toHaveBeenCalledWith(
        expect.objectContaining({
          page_entity_type: "investment",
          page_entity_id: "inv-1",
          page_entity_name: "Meridian Office Tower",
          visible_data: expect.objectContaining({
            notes: expect.arrayContaining([
              expect.stringContaining("Institutional Growth Fund VII"),
              expect.stringContaining("2026Q1"),
            ]),
          }),
        })
      );
    });
  });
});
