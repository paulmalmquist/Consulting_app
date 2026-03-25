import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import InvestorsPage from "@/app/lab/env/[envId]/re/investors/page";

const mockUseRepeContext = vi.fn();
const mockUseRepeBasePath = vi.fn();

vi.mock("@/lib/repe-context", () => ({
  useRepeContext: (...args: unknown[]) => mockUseRepeContext(...args),
  useRepeBasePath: (...args: unknown[]) => mockUseRepeBasePath(...args),
}));

vi.mock("@/lib/commandbar/appContextBridge", () => ({
  publishAssistantPageContext: vi.fn(),
  resetAssistantPageContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Investors list page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRepeContext.mockReturnValue({
      businessId: "biz-1",
      environmentId: "env-1",
      loading: false,
      contextError: null,
      initializeWorkspace: vi.fn(),
    });
    mockUseRepeBasePath.mockReturnValue("/lab/env/env-1/re");
  });

  it("renders empty state when no investors", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ investors: [] }),
    });

    render(<InvestorsPage />);
    await waitFor(() => {
      expect(screen.getByText("No investors yet")).toBeTruthy();
    });
  });

  it("renders investor table with data", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          investors: [
            {
              partner_id: "p-1",
              name: "Alpha Capital LP",
              partner_type: "lp",
              created_at: "2025-01-01",
              fund_count: 2,
              total_committed: "50000000",
              tvpi: "1.45",
              irr: "0.12",
            },
            {
              partner_id: "p-2",
              name: "Beta Partners GP",
              partner_type: "gp",
              created_at: "2025-01-01",
              fund_count: 1,
              total_committed: "5000000",
              tvpi: null,
              irr: null,
            },
          ],
        }),
    });

    render(<InvestorsPage />);
    await waitFor(() => {
      expect(screen.getByText("Alpha Capital LP")).toBeTruthy();
      expect(screen.getByText("Beta Partners GP")).toBeTruthy();
    });

    // Check page heading renders (use getAllByText since "Investors" appears in KPI too)
    expect(screen.getAllByText("Investors").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Total Committed").length).toBeGreaterThanOrEqual(1);
  });

  it("shows loading state when workspace not initialized", () => {
    mockUseRepeContext.mockReturnValue({
      businessId: null,
      environmentId: null,
      loading: true,
      contextError: null,
      initializeWorkspace: vi.fn(),
    });

    render(<InvestorsPage />);
    // StateCard with loading state should render
    expect(screen.queryByText("Investors")).toBeNull();
  });

  it("shows error state when workspace context fails", () => {
    mockUseRepeContext.mockReturnValue({
      businessId: null,
      environmentId: null,
      loading: false,
      contextError: "Failed to connect",
      initializeWorkspace: vi.fn(),
    });

    render(<InvestorsPage />);
    expect(screen.getByText("REPE workspace not initialized")).toBeTruthy();
  });
});
