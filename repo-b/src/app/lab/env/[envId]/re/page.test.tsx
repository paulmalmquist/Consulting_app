import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import ReFundListPage from "@/app/lab/env/[envId]/re/page";

const mockUseReEnv = vi.fn();
const mockPushToast = vi.fn();
const mockListReV1Funds = vi.fn();
const mockGetReV2FundQuarterState = vi.fn();
const mockGetReV2EnvironmentPortfolioKpis = vi.fn();
const mockDeleteRepeFund = vi.fn();

vi.mock("@/components/repe/workspace/ReEnvProvider", () => ({
  useReEnv: (...args: unknown[]) => mockUseReEnv(...args),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ push: mockPushToast }),
}));

vi.mock("@/lib/bos-api", () => ({
  listReV1Funds: (...args: unknown[]) => mockListReV1Funds(...args),
  getReV2FundQuarterState: (...args: unknown[]) => mockGetReV2FundQuarterState(...args),
  getReV2EnvironmentPortfolioKpis: (...args: unknown[]) =>
    mockGetReV2EnvironmentPortfolioKpis(...args),
  deleteRepeFund: (...args: unknown[]) => mockDeleteRepeFund(...args),
  getAssetMapPoints: vi.fn().mockResolvedValue([]),
}));

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
  });

  test("renders portfolio NAV as dash when quarter state is missing", async () => {
    render(<ReFundListPage />);

    await waitFor(() =>
      expect(mockGetReV2EnvironmentPortfolioKpis).toHaveBeenCalledWith(
        "env-1",
        expect.stringMatching(/^\d{4}Q[1-4]$/)
      )
    );

    expect(await screen.findByText("$490.0M")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create Fund" })).toBeInTheDocument();
    const navCard = screen.getByText("Portfolio NAV").closest("div");
    expect(navCard?.textContent).toContain("—");
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
    mockGetReV2FundQuarterState.mockResolvedValue({
      total_committed: 500000000,
      portfolio_nav: 425000000,
      dpi: 0.21,
      tvpi: 1.33,
    });

    render(<ReFundListPage />);

    expect(await screen.findByRole("link", { name: "Meridian Growth Fund" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Meridian Growth Fund" })).toBeInTheDocument();
    expect(screen.getByTestId("delete-fund-fund-1")).toBeInTheDocument();
  });
});
