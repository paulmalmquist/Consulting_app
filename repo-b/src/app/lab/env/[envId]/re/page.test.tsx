import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import ReFundListPage from "@/app/lab/env/[envId]/re/page";

const mockUseReEnv = vi.fn();
const mockListReV1Funds = vi.fn();
const mockGetReV2FundQuarterState = vi.fn();
const mockGetReV2EnvironmentPortfolioKpis = vi.fn();

vi.mock("@/components/repe/workspace/ReEnvProvider", () => ({
  useReEnv: (...args: unknown[]) => mockUseReEnv(...args),
}));

vi.mock("@/lib/bos-api", () => ({
  listReV1Funds: (...args: unknown[]) => mockListReV1Funds(...args),
  getReV2FundQuarterState: (...args: unknown[]) => mockGetReV2FundQuarterState(...args),
  getReV2EnvironmentPortfolioKpis: (...args: unknown[]) =>
    mockGetReV2EnvironmentPortfolioKpis(...args),
}));

describe("RE environment portfolio page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReEnv.mockReturnValue({
      envId: "env-1",
      businessId: "biz-1",
    });
    mockListReV1Funds.mockResolvedValue([]);
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
    expect(await screen.findByText("12")).toBeInTheDocument();
    const navCard = screen.getByText("Portfolio NAV").closest("div");
    expect(navCard?.textContent).toContain("—");
  });
});
