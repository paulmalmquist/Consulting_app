import React from "react";
import { render, screen } from "@testing-library/react";
import RepeFundsPage from "@/app/app/repe/funds/page";

vi.mock("@/lib/repe-context", () => ({
  useRepeContext: () => ({
    businessId: null,
    loading: false,
    contextError: null,
    initializeWorkspace: vi.fn(),
  }),
}));

vi.mock("@/lib/bos-api", () => ({
  listRepeFunds: vi.fn().mockResolvedValue([]),
  createRepeFund: vi.fn(),
}));

describe("REPE funds context", () => {
  test("shows initialize workspace CTA when context missing", () => {
    render(<RepeFundsPage />);
    expect(screen.getByText("Initialize REPE Workspace")).toBeInTheDocument();
  });
});
