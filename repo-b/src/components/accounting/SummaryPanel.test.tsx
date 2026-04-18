import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SummaryPanel from "./SummaryPanel";

vi.mock("@/lib/accounting-api", () => ({
  fetchAiSoftwareSummary: vi.fn(async () => ({
    period_start: "2026-03-01",
    period_end: "2026-03-31",
    apple_billed_total: 41.93,
    claude_total: 40.0,
    openai_total: 61.75,
    by_spend_type: [
      { spend_type: "subscription_fixed", total: 120, receipt_count: 6 },
      { spend_type: "api_usage", total: 42.5, receipt_count: 3 },
      { spend_type: "ambiguous", total: 4.99, receipt_count: 1 },
    ],
    by_vendor: [],
    ambiguous_pending_review_usd: 4.99,
    missing_support_count: 2,
  })),
}));

describe("SummaryPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the five headline tiles", async () => {
    render(<SummaryPanel envId="env-1" monthKey="2026-03" />);
    await waitFor(() => screen.getByTestId("summary-tile-apple"));
    expect(screen.getByTestId("summary-tile-apple")).toBeTruthy();
    expect(screen.getByTestId("summary-tile-claude")).toBeTruthy();
    expect(screen.getByTestId("summary-tile-openai")).toBeTruthy();
    expect(screen.getByTestId("summary-tile-pending")).toBeTruthy();
    expect(screen.getByTestId("summary-tile-missing")).toBeTruthy();
  });

  it("formats vendor totals as USD", async () => {
    render(<SummaryPanel envId="env-1" monthKey="2026-03" />);
    await waitFor(() => screen.getByText("$42"));
    expect(screen.getByText("$42")).toBeTruthy(); // apple_billed ~42
    expect(screen.getByText("$40")).toBeTruthy(); // claude
    expect(screen.getByText("$62")).toBeTruthy(); // openai 61.75 rounds
  });

  it("shows per-spend_type split chips", async () => {
    render(<SummaryPanel envId="env-1" monthKey="2026-03" />);
    await waitFor(() => screen.getByTestId("summary-split-subscription_fixed"));
    expect(screen.getByTestId("summary-split-subscription_fixed")).toBeTruthy();
    expect(screen.getByTestId("summary-split-api_usage")).toBeTruthy();
    expect(screen.getByTestId("summary-split-ambiguous")).toBeTruthy();
  });

  it("passes the monthKey as period_start/period_end", async () => {
    const api = await import("@/lib/accounting-api");
    render(<SummaryPanel envId="env-1" monthKey="2026-03" />);
    await waitFor(() => screen.getByTestId("summary-tile-apple"));
    expect(api.fetchAiSoftwareSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        envId: "env-1",
        periodStart: "2026-03-01",
        periodEnd: "2026-03-31",
      }),
    );
  });
});
