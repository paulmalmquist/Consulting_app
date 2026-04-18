import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CommandDeskShell from "./CommandDeskShell";

vi.mock("@/lib/accounting-api", () => ({
  listIntake: vi.fn(async () => ({
    count: 2,
    rows: [
      {
        id: "id-apple-one",
        source_type: "upload",
        ingest_status: "parsed",
        original_filename: "apple_one.pdf",
        created_at: "2026-03-15T10:00:00Z",
        file_hash: "h1",
        merchant_raw: "Apple Services",
        billing_platform: "Apple",
        vendor_normalized: "Apple",
        service_name_guess: "Apple One",
        total: "16.95",
        currency: "USD",
        transaction_date: "2026-03-15",
        confidence_overall: "0.92",
      },
      {
        id: "id-ambiguous",
        source_type: "apple_export",
        ingest_status: "parsed",
        original_filename: "mystery.pdf",
        created_at: "2026-03-22T09:00:00Z",
        file_hash: "h2",
        merchant_raw: "Apple.com/bill",
        billing_platform: "Apple",
        vendor_normalized: null,
        service_name_guess: null,
        total: "4.99",
        currency: "USD",
        transaction_date: "2026-03-22",
        confidence_overall: "0.3",
      },
    ],
  })),
  listReviewQueue: vi.fn(async () => ({
    count: 1,
    items: [
      {
        id: "rev-1",
        intake_id: "id-ambiguous",
        reason: "apple_ambiguous",
        next_action: "Confirm the underlying vendor.",
        status: "open",
        created_at: "2026-03-22T09:01:00Z",
        resolved_at: null,
        merchant_raw: "Apple.com/bill",
        vendor_normalized: null,
        billing_platform: "Apple",
        service_name_guess: null,
        total: "4.99",
        currency: "USD",
        transaction_date: "2026-03-22",
        confidence_overall: "0.3",
      },
    ],
  })),
  getIntake: vi.fn(async () => null),
  uploadReceipt: vi.fn(async () => ({ intake_id: "new", ingest_status: "parsed", duplicate: false })),
  detectRecurring: vi.fn(async () => ({ processed: 2 })),
  resolveReviewItem: vi.fn(async () => ({ resolved: true })),
  fetchToolingMom: vi.fn(async () => ({ rows: [] })),
}));

describe("CommandDeskShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the shell with top bar, KPI strip, view switcher, and rail", async () => {
    render(<CommandDeskShell envId="env-1" />);
    expect(screen.getByTestId("accounting-command-desk")).toBeTruthy();
    expect(screen.getByTestId("accounting-top-bar")).toBeTruthy();
    expect(screen.getByTestId("accounting-kpi-strip")).toBeTruthy();
    expect(screen.getByTestId("accounting-view-switcher")).toBeTruthy();
    expect(screen.getByTestId("rail-receipt-intake")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("Apple One")).toBeTruthy();
    });
  });

  it("clicking the Receipts tab switches the view to the receipts table", async () => {
    render(<CommandDeskShell envId="env-1" />);
    await waitFor(() => screen.getByText("Apple One"));
    fireEvent.click(screen.getByTestId("view-tab-recs"));
    await waitFor(() => {
      expect(screen.getByTestId("receipts-table")).toBeTruthy();
    });
  });

  it("KPI tile toggles filter state on and off", async () => {
    render(<CommandDeskShell envId="env-1" />);
    await waitFor(() => screen.getByText("Apple One"));
    const tile = screen.getByTestId("kpi-tile-apple");
    expect(tile.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(tile);
    expect(tile.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(tile);
    expect(tile.getAttribute("aria-pressed")).toBe("false");
  });

  it("detect-recurring button calls the API", async () => {
    const mod = await import("@/lib/accounting-api");
    render(<CommandDeskShell envId="env-1" />);
    await waitFor(() => screen.getByText("Apple One"));
    fireEvent.click(screen.getByTestId("detect-recurring-button"));
    await waitFor(() => {
      expect(mod.detectRecurring).toHaveBeenCalledWith({ envId: "env-1", businessId: undefined });
    });
  });

  it("needs-attention surfaces the ambiguous Apple row with its next_action", async () => {
    render(<CommandDeskShell envId="env-1" />);
    await waitFor(() => {
      expect(screen.getByText(/APPLE AMBIGUOUS/i)).toBeTruthy();
      expect(screen.getByText(/Confirm the underlying vendor/i)).toBeTruthy();
    });
  });
});
