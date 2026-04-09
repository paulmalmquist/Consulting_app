import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import RepeFundsPage from "@/app/app/repe/funds/page";
import { ToastProvider } from "@/components/ui/Toast";

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

const mockGetCapitalActivity = vi.fn();
const mockGetAssetMapPoints = vi.fn();
const mockDeleteRepeFund = vi.fn();
const mockGetPortfolioSignals = vi.fn();
const mockGetFundTableRows = vi.fn();
const mockGetFundComparison = vi.fn();
const mockGetAllocationBreakdown = vi.fn();

vi.mock("@/lib/bos-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bos-api")>();
  return {
    ...actual,
    listReV1Funds: (...args: unknown[]) => mockListReV1Funds(...args),
    getReV2EnvironmentPortfolioKpis: (...args: unknown[]) =>
      mockGetReV2EnvironmentPortfolioKpis(...args),
    getCapitalActivity: (...args: unknown[]) => mockGetCapitalActivity(...args),
    getAssetMapPoints: (...args: unknown[]) => mockGetAssetMapPoints(...args),
    deleteRepeFund: (...args: unknown[]) => mockDeleteRepeFund(...args),
    getPortfolioSignals: (...args: unknown[]) => mockGetPortfolioSignals(...args),
    getFundTableRows: (...args: unknown[]) => mockGetFundTableRows(...args),
    getFundComparison: (...args: unknown[]) => mockGetFundComparison(...args),
    getAllocationBreakdown: (...args: unknown[]) => mockGetAllocationBreakdown(...args),
  };
});

const MOCK_FUNDS = [
  {
    fund_id: "f1",
    business_id: "test-biz",
    name: "Alpha Growth Fund IV",
    vintage_year: 2023,
    fund_type: "closed_end",
    strategy: "equity",
    target_size: "350000000",
    term_years: 7,
    status: "investing",
    base_currency: "USD",
    inception_date: "2023-03-01",
    quarter_cadence: "quarterly",
    created_at: "2023-03-01T00:00:00Z",
  },
  {
    fund_id: "f2",
    business_id: "test-biz",
    name: "Beta Debt Partners II",
    vintage_year: 2020,
    fund_type: "closed_end",
    strategy: "debt",
    target_size: "225000000",
    term_years: 5,
    status: "harvesting",
    base_currency: "USD",
    inception_date: "2020-06-15",
    quarter_cadence: "quarterly",
    created_at: "2020-06-15T00:00:00Z",
  },
  {
    fund_id: "f3",
    business_id: "test-biz",
    name: "Gamma Opportunity Fund I",
    vintage_year: 2025,
    fund_type: "closed_end",
    strategy: "equity",
    target_size: "500000000",
    term_years: 10,
    status: "fundraising",
    base_currency: "USD",
    inception_date: "2025-01-10",
    quarter_cadence: "quarterly",
    created_at: "2025-01-10T00:00:00Z",
  },
];

describe("REPE funds page", () => {
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
    mockGetCapitalActivity.mockResolvedValue({ summary: {}, series: [] });
    mockGetAssetMapPoints.mockResolvedValue([]);
    mockGetPortfolioSignals.mockResolvedValue([]);
    mockGetFundTableRows.mockResolvedValue([]);
    mockGetFundComparison.mockResolvedValue([]);
    mockGetAllocationBreakdown.mockResolvedValue({ strategies: [], property_types: [] });
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
    render(<ToastProvider><RepeFundsPage /></ToastProvider>);
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

    render(<ToastProvider><RepeFundsPage /></ToastProvider>);

    expect(await screen.findByText("$490.0M")).toBeInTheDocument();
    expect(await screen.findByText("$1.7B")).toBeInTheDocument();
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(mockGetReV2EnvironmentPortfolioKpis).toHaveBeenCalledTimes(1);
    expect(mockGetReV2EnvironmentPortfolioKpis).toHaveBeenCalledWith(
      "test-env",
      expect.stringMatching(/^\d{4}Q[1-4]$/)
    );
  });

  test("renders fund table with column headers", async () => {
    mockUseRepeContext.mockReturnValue({
      businessId: "test-biz",
      environmentId: "test-env",
      loading: false,
      contextError: null,
      initializeWorkspace: vi.fn(),
    });
    mockListReV1Funds.mockResolvedValue(MOCK_FUNDS);

    render(<ToastProvider><RepeFundsPage /></ToastProvider>);

    expect(await screen.findByText("Alpha Growth Fund IV")).toBeInTheDocument();
    expect(screen.getByText("Beta Debt Partners II")).toBeInTheDocument();
    expect(screen.getByText("Gamma Opportunity Fund I")).toBeInTheDocument();

    // Column headers present (use getAllByText for labels that also appear in filters)
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(screen.getByText("Fund")).toBeInTheDocument();
    expect(screen.getByText("Commitment")).toBeInTheDocument();
    expect(screen.getByText("NAV")).toBeInTheDocument();
    expect(screen.getByText("DPI")).toBeInTheDocument();
    expect(screen.getByText("TVPI")).toBeInTheDocument();
  });

  test("renders KPI subtext with strategy count", async () => {
    mockUseRepeContext.mockReturnValue({
      businessId: "test-biz",
      environmentId: "test-env",
      loading: false,
      contextError: null,
      initializeWorkspace: vi.fn(),
    });
    mockListReV1Funds.mockResolvedValue(MOCK_FUNDS);

    render(<ToastProvider><RepeFundsPage /></ToastProvider>);

    // 3 funds across 2 strategies (equity + debt)
    expect(await screen.findByText("Across 2 strategies")).toBeInTheDocument();
  });

  test("renders status pills with correct colors", async () => {
    mockUseRepeContext.mockReturnValue({
      businessId: "test-biz",
      environmentId: "test-env",
      loading: false,
      contextError: null,
      initializeWorkspace: vi.fn(),
    });
    mockListReV1Funds.mockResolvedValue(MOCK_FUNDS);

    render(<ToastProvider><RepeFundsPage /></ToastProvider>);

    await screen.findByText("Alpha Growth Fund IV");

    // investing pill should have blue colors
    const investingPill = screen.getByText("investing");
    expect(investingPill.className).toContain("text-blue-400");

    // fundraising pill should have accent colors
    const fundraisingPill = screen.getByText("fundraising");
    expect(fundraisingPill.className).toContain("text-bm-accent");

    // harvesting pill should have amber colors
    const harvestingPill = screen.getByText("harvesting");
    expect(harvestingPill.className).toContain("text-amber-400");
  });

  test("sorting by vintage toggles order", async () => {
    mockUseRepeContext.mockReturnValue({
      businessId: "test-biz",
      environmentId: "test-env",
      loading: false,
      contextError: null,
      initializeWorkspace: vi.fn(),
    });
    mockListReV1Funds.mockResolvedValue(MOCK_FUNDS);

    render(<ToastProvider><RepeFundsPage /></ToastProvider>);

    await screen.findByText("Alpha Growth Fund IV");

    // Click Vintage column header to sort (find th specifically, not the filter label)
    const table = screen.getByRole("table");
    const vintageHeader = Array.from(table.querySelectorAll("th")).find(
      (th) => th.textContent?.trim().startsWith("Vintage")
    )!;
    fireEvent.click(vintageHeader);

    // Should show sort indicator
    expect(vintageHeader.innerHTML).toContain("▼");

    // Click again to toggle direction
    fireEvent.click(vintageHeader);
    expect(vintageHeader.innerHTML).toContain("▲");
  });

  test("delete icon button is present for each fund", async () => {
    mockUseRepeContext.mockReturnValue({
      businessId: "test-biz",
      environmentId: "test-env",
      loading: false,
      contextError: null,
      initializeWorkspace: vi.fn(),
    });
    mockListReV1Funds.mockResolvedValue(MOCK_FUNDS);

    render(<ToastProvider><RepeFundsPage /></ToastProvider>);

    await screen.findByText("Alpha Growth Fund IV");

    expect(screen.getByTestId("delete-fund-f1")).toBeInTheDocument();
    expect(screen.getByTestId("delete-fund-f2")).toBeInTheDocument();
    expect(screen.getByTestId("delete-fund-f3")).toBeInTheDocument();
  });
});
