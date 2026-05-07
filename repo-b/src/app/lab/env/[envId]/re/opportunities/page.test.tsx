import React from "react";
import { render, screen } from "@testing-library/react";
import OpportunitiesPage from "./page";

const mockListReOpportunities = vi.fn();
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/repe-context", () => ({
  useRepeContext: () => ({ envId: "env-1", businessId: "biz-1" }),
  useRepeBasePath: () => "/lab/env/env-1/re",
}));

vi.mock("@/lib/bos-api", () => ({
  listReOpportunities: (...args: unknown[]) => mockListReOpportunities(...args),
}));

describe("OpportunitiesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("does not render raw Failed to fetch on route failure", async () => {
    mockListReOpportunities.mockRejectedValue(new Error("Failed to fetch"));

    render(<OpportunitiesPage />);

    const unavailable = await screen.findByTestId("opportunities-unavailable");
    expect(unavailable.textContent).toContain("Opportunities unavailable");
    expect(unavailable.textContent).toContain("Backend API is unreachable");
    expect(unavailable.textContent).not.toContain("Failed to fetch");
  });

  test("renders intentional empty state for empty opportunity rows", async () => {
    mockListReOpportunities.mockResolvedValue([]);

    render(<OpportunitiesPage />);

    expect(await screen.findByText("No opportunities match the current filters.")).toBeInTheDocument();
  });
});
