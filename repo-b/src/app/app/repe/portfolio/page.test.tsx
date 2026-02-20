import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import RepePortfolioPage from "@/app/app/repe/portfolio/page";

vi.mock("@/lib/repe-context", () => ({
  useRepeContext: () => ({
    businessId: "biz-1",
    loading: false,
  }),
}));

vi.mock("@/lib/bos-api", () => ({
  listRepeFunds: vi.fn().mockResolvedValue([]),
  createRepeFund: vi.fn(),
  seedRepeBusiness: vi.fn(),
}));

describe("REPE portfolio", () => {
  test("shows Get Started when no funds exist", async () => {
    render(<RepePortfolioPage />);
    await waitFor(() => expect(screen.getByTestId("repe-get-started")).toBeInTheDocument());
    expect(screen.getByTestId("repe-create-fund-cta")).toBeInTheDocument();
  });
});
