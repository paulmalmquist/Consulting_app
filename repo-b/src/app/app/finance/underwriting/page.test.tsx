import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import UnderwritingPage from "@/app/app/finance/underwriting/page";

vi.mock("@/lib/repe-context", () => ({
  useRepeContext: () => ({
    businessId: "biz-1",
    loading: false,
  }),
}));

vi.mock("@/lib/bos-api", () => ({
  listUnderwritingRuns: vi.fn().mockResolvedValue([]),
  createUnderwritingRun: vi.fn(),
  ingestUnderwritingResearch: vi.fn(),
  runUnderwritingScenarios: vi.fn(),
  getUnderwritingReports: vi.fn(),
}));

describe("underwriting page", () => {
  test("shows deal-first empty state and removes business-first prompt", async () => {
    render(<UnderwritingPage />);
    await waitFor(() => expect(screen.getByTestId("uw-empty-state")).toBeInTheDocument());
    expect(screen.getByTestId("uw-create-deal-cta")).toBeInTheDocument();
    expect(screen.queryByText("Select a business first to use underwriting.")).not.toBeInTheDocument();
  });
});
