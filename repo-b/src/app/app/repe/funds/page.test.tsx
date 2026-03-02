import React from "react";
import { render, screen } from "@testing-library/react";
import RepeFundsPage from "@/app/app/repe/funds/page";

const mockUseRepeContext = vi.fn();
const mockListReV1Funds = vi.fn();
const mockGetReV2EnvironmentPortfolioKpis = vi.fn();
const mockRouterReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/repe-context", () => ({
  useRepeContext: (...args: unknown[]) => mockUseRepeContext(...args),
  useRepeBasePath: () => "/lab/env/test-env/re",
}));

vi.mock("@/lib/bos-api", () => ({
  listReV1Funds: (...args: unknown[]) => mockListReV1Funds(...args),
  getReV2EnvironmentPortfolioKpis: (...args: unknown[]) =>
    mockGetReV2EnvironmentPortfolioKpis(...args),
}));

describe("REPE funds context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRepeContext.mockReturnValue({
      businessId: null,
      environmentId: null,
      loading: false,
      contextError: null,
      initializeWorkspace: vi.fn(),
    });
    mockListReV1Funds.mockResolvedValue([]);
    mockGetReV2EnvironmentPortfolioKpis.mockResolvedValue({
      env_id: "test-env",
      business_id: "test-biz",
      quarter: "2026Q1",
      scenario_id: null,
      fund_count: 3,
      total_commitments: "490000000",
      portfolio_nav: "1700000000",
      active_assets: 12,
      warnings: [],
    });
  });

  test("shows initialize workspace CTA when context missing", () => {
    render(<RepeFundsPage />);
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  test("renders environment portfolio KPIs from the backend endpoint", async () => {
    mockUseRepeContext.mockReturnValue({
      businessId: "test-biz",
      environmentId: "test-env",
      loading: false,
      contextError: null,
      initializeWorkspace: vi.fn(),
    });

    render(<RepeFundsPage />);

    expect(await screen.findByText("$490.0M")).toBeInTheDocument();
    expect(await screen.findByText("$1.7B")).toBeInTheDocument();
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(mockGetReV2EnvironmentPortfolioKpis).toHaveBeenCalledTimes(1);
    expect(mockGetReV2EnvironmentPortfolioKpis).toHaveBeenCalledWith(
      "test-env",
      expect.stringMatching(/^\d{4}Q[1-4]$/)
    );
  });
});
