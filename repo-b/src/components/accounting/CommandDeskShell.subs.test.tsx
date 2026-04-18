import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CommandDeskShell from "./CommandDeskShell";

vi.mock("@/lib/accounting-api", () => ({
  listIntake: vi.fn(async () => ({ count: 0, rows: [] })),
  listReviewQueue: vi.fn(async () => ({ count: 0, items: [] })),
  getIntake: vi.fn(async () => null),
  uploadReceipt: vi.fn(),
  detectRecurring: vi.fn(async () => ({ processed: 0 })),
  resolveReviewItem: vi.fn(),
  fetchToolingMom: vi.fn(async () => ({ rows: [] })),
  listSubscriptions: vi.fn(async () => ({
    count: 1,
    rows: [
      {
        id: "sub-apple-one",
        vendor_normalized: "Apple",
        service_name: "Apple One",
        billing_platform: "Apple",
        cadence: "monthly",
        expected_amount: "16.95",
        currency: "USD",
        category: "Software subscription",
        business_relevance: "medium",
        spend_type: "subscription_fixed",
        last_seen_date: "2026-03-15",
        next_expected_date: "2026-04-15",
        documentation_complete: true,
        is_active: true,
        occurrence_count: 3,
        last_price_delta_pct: 0,
      },
    ],
  })),
  fetchAiSoftwareSummary: vi.fn(async () => ({
    period_start: null,
    period_end: null,
    apple_billed_total: 41.93,
    claude_total: 40,
    openai_total: 61.75,
    by_spend_type: [],
    by_vendor: [],
    ambiguous_pending_review_usd: 0,
    missing_support_count: 0,
  })),
  markSubscriptionNonBusiness: vi.fn(async () => ({ updated: true })),
}));

describe("CommandDeskShell — Subscriptions tab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes five view tabs including Subscriptions", async () => {
    render(<CommandDeskShell envId="env-1" />);
    await waitFor(() => screen.getByTestId("accounting-view-switcher"));
    expect(screen.getByTestId("view-tab-needs")).toBeTruthy();
    expect(screen.getByTestId("view-tab-subs")).toBeTruthy();
    expect(screen.getByTestId("view-tab-recs")).toBeTruthy();
    expect(screen.getByTestId("view-tab-txns")).toBeTruthy();
    expect(screen.getByTestId("view-tab-invs")).toBeTruthy();
  });

  it("clicking Subscriptions mounts the summary panel and the table", async () => {
    render(<CommandDeskShell envId="env-1" />);
    await waitFor(() => screen.getByTestId("view-tab-subs"));
    fireEvent.click(screen.getByTestId("view-tab-subs"));
    await waitFor(() => {
      expect(screen.getByTestId("accounting-summary-panel")).toBeTruthy();
      expect(screen.getByTestId("subscriptions-tab")).toBeTruthy();
      expect(screen.getByText("Apple One")).toBeTruthy();
    });
  });
});
