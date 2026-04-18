import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import DetailDrawer from "./DetailDrawer";
import type { IntakeDetail } from "@/lib/accounting-api";

vi.mock("@/lib/accounting-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accounting-api")>("@/lib/accounting-api");
  return {
    ...actual,
    resolveReviewItem: vi.fn(async () => ({ resolved: true })),
  };
});

const DETAIL: IntakeDetail = {
  intake: {
    id: "intake-1",
    source_type: "upload",
    ingest_status: "parsed",
    original_filename: "chatgpt_via_apple.pdf",
    mime_type: "application/pdf",
    storage_path: null,
    created_at: "2026-03-20T10:00:00Z",
    file_hash: "hash-1",
  },
  parse: {
    id: "parse-1",
    parser_source: "hybrid",
    parser_version: "2026-04-18.1",
    merchant_raw: "Apple Services",
    billing_platform: "Apple",
    service_name_guess: "ChatGPT Plus",
    vendor_normalized: "OpenAI",
    transaction_date: "2026-03-20",
    billing_period_start: "2026-03-20",
    billing_period_end: "2026-04-20",
    subtotal: "19.99",
    tax: "1.76",
    total: "21.75",
    currency: "USD",
    apple_document_ref: "CGPT22MR",
    line_items: [],
    renewal_language: "Renews on 04/20/2026",
    confidence_overall: "0.85",
    confidence_vendor: "0.85",
    confidence_service: "0.85",
  },
  match_candidates: [
    {
      id: "cand-1",
      transaction_id: null,
      match_score: "0",
      match_reason: { reason: "no-transactions-available" },
      match_status: "unmatched",
      created_at: "2026-03-20T10:01:00Z",
    },
  ],
  review_items: [
    {
      id: "rev-1",
      intake_id: "intake-1",
      reason: "apple_ambiguous",
      next_action: "Confirm underlying vendor.",
      status: "open",
      created_at: "2026-03-20T10:02:00Z",
      resolved_at: null,
    },
  ],
};

describe("DetailDrawer", () => {
  it("returns null when no detail is provided", () => {
    const { container } = render(
      <DetailDrawer detail={null} envId="env-1" onClose={() => {}} onRefresh={async () => {}} />,
    );
    expect(container.querySelector('[data-testid="detail-drawer"]')).toBeNull();
  });

  it("renders billing_platform and vendor_normalized as separate fields", () => {
    render(
      <DetailDrawer detail={DETAIL} envId="env-1" onClose={() => {}} onRefresh={async () => {}} />,
    );
    expect(screen.getByText("Billing platform")).toBeTruthy();
    expect(screen.getByText("Underlying vendor")).toBeTruthy();
    expect(screen.getAllByText("Apple").length).toBeGreaterThan(0);
    expect(screen.getByText("OpenAI")).toBeTruthy();
  });

  it("surfaces unmatched candidates as amber-tinted", () => {
    const { container } = render(
      <DetailDrawer detail={DETAIL} envId="env-1" onClose={() => {}} onRefresh={async () => {}} />,
    );
    expect(container.innerHTML).toContain("No transactions imported yet");
    expect(container.innerHTML).toContain("border-amber-400/30");
  });

  it("resolves a review item and triggers refresh", async () => {
    const onRefresh = vi.fn(async () => {});
    const { resolveReviewItem } = await import("@/lib/accounting-api");
    render(
      <DetailDrawer detail={DETAIL} envId="env-1" onClose={() => {}} onRefresh={onRefresh} />,
    );
    fireEvent.click(screen.getByTestId("resolve-review-rev-1"));
    // Allow microtask flush.
    await new Promise((r) => setTimeout(r, 0));
    expect(resolveReviewItem).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "rev-1", envId: "env-1" }),
    );
    expect(onRefresh).toHaveBeenCalled();
  });
});
