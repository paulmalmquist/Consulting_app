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
// Authoritative State Lockdown — Phase 3
// getFundBaseScenario is no longer called from the fund page. KPI cards
// come from the authoritative-state contract via useAuthoritativeState.
// See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md.
const mockGetReV2AuthoritativeState = vi.fn();
const mockGetFundExposureInsights = vi.fn();

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  // Authoritative State Lockdown — Phase 3
  // The fund page now reads ?quarter= and ?audit_mode= from
  // useSearchParams. The test fixture does not exercise URL params, so
  // we return a minimal stub that yields null for both keys.
  useSearchParams: () => new URLSearchParams(),
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
    getReV2AuthoritativeState: (...args: unknown[]) => mockGetReV2AuthoritativeState(...args),
    getFundExposureInsights: (...args: unknown[]) => mockGetFundExposureInsights(...args),
  };
});

describe("fund detail narrative dashboard", () => {
  function makeExposurePayload(overrides?: Record<string, unknown>) {
    return {
      fund_id: "fund-1",
      quarter: "2026Q1",
      scenario_id: null,
      sector_allocation: [
        { label: "industrial", value: 180_000_000, pct: 100, source_count: 2 },
      ],
      geographic_allocation: [
        { label: "Dallas", value: 180_000_000, pct: 100, source_count: 2 },
      ],
      total_weight: 180_000_000,
      sector_summary: {
        total_weight: 180_000_000,
        classified_weight: 180_000_000,
        unclassified_weight: 0,
        coverage_pct: 100,
      },
      geographic_summary: {
        total_weight: 180_000_000,
        classified_weight: 180_000_000,
        unclassified_weight: 0,
        coverage_pct: 100,
      },
      weighting_basis_used: "mixed",
      ...overrides,
    };
  }

  function renderPage() {
    return render(
      <ToastProvider>
        <FundDetailPage params={{ envId: "env-1", fundId: "fund-1" }} />
      </ToastProvider>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();

    // Authoritative State Lockdown — Phase 3
    // Default the authoritative-state fetch to a "no released snapshot"
    // shape so the page falls through to legacy quarter-state for
    // tests that don't exercise the lockdown path.
    mockGetReV2AuthoritativeState.mockResolvedValue({
      entity_type: "fund",
      entity_id: "fund-1",
      quarter: "2026Q1",
      requested_quarter: "2026Q1",
      period_exact: false,
      state_origin: "fallback",
      audit_run_id: null,
      snapshot_version: null,
      promotion_state: null,
      trust_status: "missing_source",
      breakpoint_layer: null,
      null_reason: "authoritative_state_not_released",
      state: null,
      null_reasons: { state: "authoritative_state_not_released" },
      formulas: {},
      provenance: [],
      artifact_paths: {},
    });

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

    mockGetFundExposureInsights.mockResolvedValue(makeExposurePayload());

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
      await screen.findByTestId("decision-strip"),
      await screen.findByTestId("kpi-group-capital"),
      await screen.findByTestId("kpi-group-performance"),
      await screen.findByTestId("portfolio-snapshot"),
      await screen.findByTestId("fund-value-creation"),
      await screen.findByTestId("top-value-contributors"),
      await screen.findByTestId("exposure-risk-panel"),
      await screen.findByTestId("capital-efficiency"),
      await screen.findByTestId("performance-drivers"),
      await screen.findByTestId("exposure-insights"),
      await screen.findByTestId("portfolio-holdings"),
      await screen.findByTestId("asset-contribution-table"),
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
    await waitFor(() => {
      expect(within(snapshot).getByText("Assets")).toBeInTheDocument();
    });
    expect(snapshot).toHaveTextContent("21");
    expect(snapshot).toHaveTextContent("94.4%");
    expect(snapshot).toHaveTextContent("$18.6M");

    const allocation = await screen.findByTestId("exposure-risk-panel");
    expect(allocation).toHaveTextContent(/industrial/i);
    expect(allocation).toHaveTextContent("100.0%");
  });

  it("renders partial exposure coverage instead of false empty states", async () => {
    mockGetFundExposureInsights.mockResolvedValueOnce(makeExposurePayload({
      sector_allocation: [
        { label: "industrial", value: 180_000_000, pct: 78.2609, source_count: 2 },
        { label: "Unclassified", value: 50_000_000, pct: 21.7391, source_count: 1 },
      ],
      geographic_allocation: [
        { label: "Dallas", value: 180_000_000, pct: 78.2609, source_count: 2 },
        { label: "Unknown", value: 50_000_000, pct: 21.7391, source_count: 1 },
      ],
      total_weight: 230_000_000,
      sector_summary: {
        total_weight: 230_000_000,
        classified_weight: 180_000_000,
        unclassified_weight: 50_000_000,
        coverage_pct: 78.2609,
      },
      geographic_summary: {
        total_weight: 230_000_000,
        classified_weight: 180_000_000,
        unclassified_weight: 50_000_000,
        coverage_pct: 78.2609,
      },
    }));

    renderPage();

    const exposure = await screen.findByTestId("exposure-insights");
    expect(exposure).toHaveTextContent("Coverage: 78% classified");
    expect(exposure).toHaveTextContent("Industrial");
    expect(exposure).toHaveTextContent("Unclassified");
    expect(screen.queryByText("No sector allocation is available yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("No geographic exposure is available yet.")).not.toBeInTheDocument();
  });

  it("shows a loading skeleton while exposure data is still resolving", async () => {
    let resolveExposure!: (value: ReturnType<typeof makeExposurePayload>) => void;
    mockGetFundExposureInsights.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveExposure = resolve;
      })
    );

    renderPage();

    // Wait for the loading skeleton itself (not just the container) to appear —
    // avoids a race where the container renders before the fund loads (loading=false)
    // and the skeleton only appears after the fund effect re-runs (loading=true).
    const exposure = await screen.findByTestId("exposure-insights");
    await waitFor(() => {
      expect(within(exposure).getByTestId("exposure-insights-loading")).toBeInTheDocument();
    });
    expect(within(exposure).queryByText("No sector allocation is available yet.")).not.toBeInTheDocument();

    resolveExposure(makeExposurePayload());

    await waitFor(() => {
      expect(within(exposure).queryByTestId("exposure-insights-loading")).not.toBeInTheDocument();
    });
  });

  // REPE UI redesign — Phase 1 replaced the nested expand-row investment
  // table with AssetContributionTable. Expand-row (Cash Flow / Debt / Exit
  // sub-tabs per asset) is deferred to Phase 1c per
  // /Users/paulmalmquist/.claude/plans/whimsical-doodling-pixel.md §3.3.
  // Re-enable this test alongside that work.
  it.skip("expands an investment row to show asset-level metrics (deferred with expand-row)", async () => {});

  // Authoritative State Lockdown — Phase 3
  // The base-scenario summary card and performance bridge previously
  // rendered from getFundBaseScenario(). The lockdown removed that data
  // source for any released period: KPIs come from useAuthoritativeState
  // and the audit lineage view is the AuditDrawer (?audit_mode=1).
  // The legacy bridge UI is replaced by the gross_to_net_bridge inside
  // the authoritative-state response. The verification harness asserts
  // the new flow end-to-end. See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md.
  it.skip("renders the base scenario summary and performance bridge (replaced by lockdown)", async () => {
    // This test is intentionally skipped — see comment above.
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
            notes: expect.arrayContaining([expect.stringMatching(/2026Q[1-4]/)]),
          }),
        })
      );
    });
  });
});
