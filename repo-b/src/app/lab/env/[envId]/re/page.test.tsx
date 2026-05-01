import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import ReFundListPage from "@/app/lab/env/[envId]/re/page";

const mockUseReEnv = vi.fn();
const mockPushToast = vi.fn();
const mockListReV1Funds = vi.fn();
const mockGetPortfolioAuthoritativeStates = vi.fn();
const mockGetReV2EnvironmentPortfolioKpis = vi.fn();
const mockGetEnvironmentFundTrend = vi.fn();
const mockGetFundPortfolioCoherent = vi.fn();
const mockDeleteRepeFund = vi.fn();

vi.mock("@/components/repe/workspace/ReEnvProvider", () => ({
  useReEnv: (...args: unknown[]) => mockUseReEnv(...args),
  useMaybeReEnv: (...args: unknown[]) => mockUseReEnv(...args),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ push: mockPushToast }),
}));

vi.mock("@/lib/bos-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bos-api")>("@/lib/bos-api");
  return {
    ...actual,
    listReV1Funds: (...args: unknown[]) => mockListReV1Funds(...args),
    getPortfolioAuthoritativeStates: (...args: unknown[]) =>
      mockGetPortfolioAuthoritativeStates(...args),
    getReV2EnvironmentPortfolioKpis: (...args: unknown[]) =>
      mockGetReV2EnvironmentPortfolioKpis(...args),
    getEnvironmentFundTrend: (...args: unknown[]) =>
      mockGetEnvironmentFundTrend(...args),
    getFundPortfolioCoherent: (...args: unknown[]) =>
      mockGetFundPortfolioCoherent(...args),
    deleteRepeFund: (...args: unknown[]) => mockDeleteRepeFund(...args),
    getAssetMapPoints: vi.fn().mockResolvedValue([]),
  };
});

function coherentPayload(overrides: Record<string, unknown> = {}) {
  return {
    env_id: "env-1",
    business_id: "biz-1",
    quarter: "2026Q2",
    portfolio_summary: {
      fund_count: 3,
      total_commitments: "490000000",
      portfolio_nav: null,
      active_assets: 12,
      gross_irr: null,
      net_irr: null,
      weighted_dscr: null,
    },
    fund_rows: [],
    diagnostics: [],
    provenance: { irr_method: "nav_weighted_average", irr_method_n_funds: 0 },
    ...overrides,
  };
}

describe("RE environment portfolio page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReEnv.mockReturnValue({
      envId: "env-1",
      businessId: "biz-1",
    });
    mockListReV1Funds.mockResolvedValue([]);
    mockDeleteRepeFund.mockResolvedValue({
      fund_id: "fund-1",
      deleted: { investments: 2, assets: 4, analytics_rows: 8 },
    });
    mockGetReV2EnvironmentPortfolioKpis.mockResolvedValue({
      env_id: "env-1",
      business_id: "biz-1",
      quarter: "2026Q1",
      scenario_id: null,
      fund_count: 3,
      total_commitments: "490000000",
      portfolio_nav: null,
      active_assets: 12,
      warnings: ["No fund quarter state rows found."],
    });
    mockGetEnvironmentFundTrend.mockResolvedValue({
      env_id: "env-1",
      metric: "ending_nav",
      quarters: 12,
      funds: [],
    });
    mockGetPortfolioAuthoritativeStates.mockResolvedValue({
      env_id: "env-1",
      business_id: "biz-1",
      quarter: "2026Q2",
      count: 0,
      states: [],
    });
    mockGetFundPortfolioCoherent.mockResolvedValue(coherentPayload());
  });

  test("renders portfolio NAV as unavailable when quarter state is missing", async () => {
    render(<ReFundListPage />);

    await waitFor(() =>
      expect(mockGetFundPortfolioCoherent).toHaveBeenCalledWith(
        "env-1",
        expect.stringMatching(/^\d{4}Q[1-4]$/)
      )
    );

    expect(await screen.findByText("$490.0M")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create your first fund" })).toBeInTheDocument();
    const navCard = screen.getByText("Portfolio NAV").closest("div");
    expect(navCard?.textContent).toContain("Unavailable");
  });

  test("DSCR KPI always renders — shows 'Unavailable' when no DSCR data", async () => {
    render(<ReFundListPage />);

    await waitFor(() =>
      expect(mockGetFundPortfolioCoherent).toHaveBeenCalled()
    );

    // The KPI strip must always include the DSCR tile, even when no funds have DSCR data.
    expect(await screen.findByText("Wtd DSCR")).toBeInTheDocument();
    const dscrLabel = screen.getByText("Wtd DSCR");
    const dscrCard = dscrLabel.closest("div");
    expect(dscrCard?.textContent).toContain("Unavailable");
  });

  test("IRR Range signal renders when ≥2 released funds have trusted gross_irr", async () => {
    mockListReV1Funds.mockResolvedValue([
      { fund_id: "fund-1", business_id: "biz-1", name: "Alpha Fund", vintage_year: 2022, fund_type: "closed_end", strategy: "equity", status: "investing", created_at: "2026-01-01T00:00:00Z" },
      { fund_id: "fund-2", business_id: "biz-1", name: "Beta Fund", vintage_year: 2023, fund_type: "closed_end", strategy: "equity", status: "investing", created_at: "2026-01-01T00:00:00Z" },
    ]);
    mockGetPortfolioAuthoritativeStates.mockResolvedValue({
      env_id: "env-1",
      business_id: "biz-1",
      quarter: "2026Q2",
      count: 2,
      states: [
        {
          entity_type: "fund", entity_id: "fund-1", quarter: "2026Q2",
          requested_quarter: "2026Q2", period_exact: true,
          state_origin: "authoritative", audit_run_id: null,
          snapshot_version: "v1", promotion_state: "released",
          trust_status: "trusted", breakpoint_layer: null, null_reason: null,
          state: {
            period_start: "2026-04-01", period_end: "2026-06-30",
            canonical_metrics: { ending_nav: "100000000", gross_irr: "0.15", irr_trust_state: "trusted" },
            display_metrics: {},
          },
          null_reasons: { gross_irr: null }, formulas: {}, provenance: [], artifact_paths: {},
        },
        {
          entity_type: "fund", entity_id: "fund-2", quarter: "2026Q2",
          requested_quarter: "2026Q2", period_exact: true,
          state_origin: "authoritative", audit_run_id: null,
          snapshot_version: "v1", promotion_state: "released",
          trust_status: "trusted", breakpoint_layer: null, null_reason: null,
          state: {
            period_start: "2026-04-01", period_end: "2026-06-30",
            canonical_metrics: { ending_nav: "200000000", gross_irr: "0.22", irr_trust_state: "trusted" },
            display_metrics: {},
          },
          null_reasons: { gross_irr: null }, formulas: {}, provenance: [], artifact_paths: {},
        },
      ],
    });
    mockGetFundPortfolioCoherent.mockResolvedValue(coherentPayload({
      portfolio_summary: {
        fund_count: 2,
        total_commitments: "300000000",
        portfolio_nav: "300000000",
        active_assets: 0,
        gross_irr: "0.19",
        net_irr: null,
        weighted_dscr: null,
      },
      fund_rows: [
        {
          fund_id: "fund-1",
          name: "Alpha Fund",
          vintage_year: 2022,
          strategy: "equity",
          status: "investing",
          total_committed: "100000000",
          total_called: null,
          portfolio_nav: "100000000",
          gross_irr: "0.15",
          net_irr: null,
          dpi: null,
          tvpi: null,
          null_reasons: {},
        },
        {
          fund_id: "fund-2",
          name: "Beta Fund",
          vintage_year: 2023,
          strategy: "equity",
          status: "investing",
          total_committed: "200000000",
          total_called: null,
          portfolio_nav: "200000000",
          gross_irr: "0.22",
          net_irr: null,
          dpi: null,
          tvpi: null,
          null_reasons: {},
        },
      ],
      provenance: { irr_method: "nav_weighted_average", irr_method_n_funds: 2 },
    }));

    render(<ReFundListPage />);

    await waitFor(() => expect(mockGetFundPortfolioCoherent).toHaveBeenCalled());
    expect(await screen.findByText(/IRR Range/i)).toBeInTheDocument();
  });

  test("Data Alerts signal shows count when funds lack released snapshots", async () => {
    mockListReV1Funds.mockResolvedValue([
      { fund_id: "fund-1", business_id: "biz-1", name: "Unreleased Fund", vintage_year: 2022, fund_type: "closed_end", strategy: "equity", status: "investing", created_at: "2026-01-01T00:00:00Z" },
    ]);
    // Portfolio states returns no released state for fund-1
    mockGetPortfolioAuthoritativeStates.mockResolvedValue({
      env_id: "env-1", business_id: "biz-1", quarter: "2026Q2", count: 1,
      states: [
        {
          entity_type: "fund", entity_id: "fund-1", quarter: "2026Q2",
          requested_quarter: "2026Q2", period_exact: false,
          state_origin: "fallback", audit_run_id: null,
          snapshot_version: null, promotion_state: null,
          trust_status: "missing_source", breakpoint_layer: null, null_reason: "authoritative_state_not_released",
          state: null,
          null_reasons: {}, formulas: {}, provenance: [], artifact_paths: {},
        },
      ],
    });
    mockGetFundPortfolioCoherent.mockResolvedValue(coherentPayload({
      portfolio_summary: {
        fund_count: 0,
        total_commitments: null,
        portfolio_nav: null,
        active_assets: 0,
        gross_irr: null,
        net_irr: null,
        weighted_dscr: null,
      },
      diagnostics: [
        {
          fund_id: "fund-1",
          name: "Unreleased Fund",
          exclusion_reason: "authoritative_state_not_released",
        },
      ],
    }));

    render(<ReFundListPage />);

    await waitFor(() => expect(mockGetFundPortfolioCoherent).toHaveBeenCalled());
    expect(await screen.findByText(/Data Alerts/i)).toBeInTheDocument();
  });

  test("renders delete action for each fund row", async () => {
    mockListReV1Funds.mockResolvedValue([
      {
        fund_id: "fund-1",
        business_id: "biz-1",
        name: "Meridian Growth Fund",
        vintage_year: 2024,
        fund_type: "closed_end",
        strategy: "equity",
        status: "investing",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    mockGetPortfolioAuthoritativeStates.mockResolvedValue({
      env_id: "env-1",
      business_id: "biz-1",
      quarter: "2026Q2",
      count: 1,
      states: [
        {
          entity_type: "fund",
          entity_id: "fund-1",
          quarter: "2026Q2",
          requested_quarter: "2026Q2",
          period_exact: true,
          state_origin: "authoritative",
          audit_run_id: null,
          snapshot_version: "test-snapshot-v1",
          promotion_state: "released",
          trust_status: "trusted",
          breakpoint_layer: null,
          null_reason: null,
          state: {
            period_start: "2026-04-01",
            period_end: "2026-06-30",
            canonical_metrics: {
              total_committed: "500000000",
              ending_nav: "425000000",
              dpi: "0.21",
              tvpi: "1.33",
            },
            display_metrics: {},
          },
          null_reasons: {},
          formulas: {},
          provenance: [],
          artifact_paths: {},
        },
      ],
    });
    mockGetFundPortfolioCoherent.mockResolvedValue(coherentPayload({
      portfolio_summary: {
        fund_count: 1,
        total_commitments: "500000000",
        portfolio_nav: "425000000",
        active_assets: 0,
        gross_irr: null,
        net_irr: null,
        weighted_dscr: null,
      },
      fund_rows: [
        {
          fund_id: "fund-1",
          name: "Meridian Growth Fund",
          vintage_year: 2024,
          strategy: "equity",
          status: "investing",
          total_committed: "500000000",
          total_called: null,
          portfolio_nav: "425000000",
          gross_irr: null,
          net_irr: null,
          dpi: "0.21",
          tvpi: "1.33",
          null_reasons: {},
        },
      ],
    }));

    render(<ReFundListPage />);

    expect(await screen.findByRole("link", { name: "Meridian Growth Fund" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Meridian Growth Fund" })).toBeInTheDocument();
    expect(screen.getByTestId("delete-fund-fund-1")).toBeInTheDocument();
  });
});
