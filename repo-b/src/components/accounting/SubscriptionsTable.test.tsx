import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SubscriptionsTable from "./SubscriptionsTable";

vi.mock("@/lib/accounting-api", () => ({
  listSubscriptions: vi.fn(async () => ({
    count: 3,
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
      {
        id: "sub-openai-api",
        vendor_normalized: "OpenAI",
        service_name: "OpenAI API",
        billing_platform: null,
        cadence: "monthly",
        expected_amount: "47.22",
        currency: "USD",
        category: "AI tools",
        business_relevance: "high",
        spend_type: "api_usage",
        last_seen_date: "2026-03-28",
        next_expected_date: null,
        documentation_complete: true,
        is_active: true,
        occurrence_count: 5,
        last_price_delta_pct: 0.18,
      },
      {
        id: "sub-chatgpt-plus",
        vendor_normalized: "OpenAI",
        service_name: "ChatGPT Plus",
        billing_platform: "Apple",
        cadence: "monthly",
        expected_amount: "21.75",
        currency: "USD",
        category: "AI tools",
        business_relevance: "high",
        spend_type: "subscription_fixed",
        last_seen_date: "2026-03-20",
        next_expected_date: "2026-04-20",
        documentation_complete: false,
        is_active: true,
        occurrence_count: 2,
        last_price_delta_pct: null,
      },
    ],
  })),
  markSubscriptionNonBusiness: vi.fn(async () => ({ updated: true })),
}));

describe("SubscriptionsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all spend-type filter chips with counts", async () => {
    render(<SubscriptionsTable envId="env-1" />);
    await waitFor(() => screen.getByText("Apple One"));
    expect(screen.getByTestId("subs-filter-all")).toBeTruthy();
    expect(screen.getByTestId("subs-filter-subscription_fixed")).toBeTruthy();
    expect(screen.getByTestId("subs-filter-api_usage")).toBeTruthy();
    expect(screen.getByTestId("subs-filter-one_off")).toBeTruthy();
    expect(screen.getByTestId("subs-filter-ambiguous")).toBeTruthy();
  });

  it("separates api_usage from subscription_fixed visually", async () => {
    const { container } = render(<SubscriptionsTable envId="env-1" />);
    await waitFor(() => screen.getByText("Apple One"));
    // 2 row-level Subscription badges use the violet spend-type accent.
    const subscriptionRowBadges = container.querySelectorAll(
      "tr span.bg-violet-400\\/15",
    );
    expect(subscriptionRowBadges.length).toBe(2);
    const apiRowBadges = container.querySelectorAll("tr span.bg-cyan-400\\/15");
    expect(apiRowBadges.length).toBe(1);
  });

  it("surfaces price-change badge when last_price_delta_pct > 2%", async () => {
    render(<SubscriptionsTable envId="env-1" />);
    await waitFor(() => screen.getByText("OpenAI API"));
    // 0.18 → +18.0%
    expect(screen.getByText("+18.0%")).toBeTruthy();
  });

  it("shows missing-docs state for the ChatGPT Plus row", async () => {
    render(<SubscriptionsTable envId="env-1" />);
    await waitFor(() => screen.getByText("ChatGPT Plus"));
    const chatRow = screen.getByTestId("subscription-row-sub-chatgpt-plus");
    expect(chatRow.innerHTML).toContain("missing");
  });

  it("action menu opens and Mark non-business calls the API", async () => {
    const api = await import("@/lib/accounting-api");
    render(<SubscriptionsTable envId="env-1" />);
    await waitFor(() => screen.getByText("Apple One"));
    fireEvent.click(screen.getByTestId("subs-actions-toggle-sub-apple-one"));
    expect(screen.getByTestId("subs-actions-menu-sub-apple-one")).toBeTruthy();
    fireEvent.click(screen.getByTestId("subs-action-non-business-sub-apple-one"));
    await waitFor(() => {
      expect(api.markSubscriptionNonBusiness).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionId: "sub-apple-one", envId: "env-1" }),
      );
    });
  });

  it("filter chip switch re-queries with the chosen spend_type", async () => {
    const api = await import("@/lib/accounting-api");
    render(<SubscriptionsTable envId="env-1" />);
    await waitFor(() => screen.getByText("Apple One"));
    fireEvent.click(screen.getByTestId("subs-filter-api_usage"));
    await waitFor(() => {
      expect(api.listSubscriptions).toHaveBeenLastCalledWith(
        expect.objectContaining({ spendType: "api_usage" }),
      );
    });
  });
});
