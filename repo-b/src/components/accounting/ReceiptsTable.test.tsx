import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ReceiptsTable from "./ReceiptsTable";
import type { ReceiptIntakeRow } from "@/lib/accounting-api";

const baseRow = (overrides: Partial<ReceiptIntakeRow>): ReceiptIntakeRow => ({
  id: "00000000-0000-0000-0000-000000000001",
  source_type: "upload",
  ingest_status: "parsed",
  original_filename: "apple_one.pdf",
  created_at: "2026-03-15T10:00:00Z",
  file_hash: "abc123",
  merchant_raw: "Apple Services",
  billing_platform: "Apple",
  vendor_normalized: "Apple",
  service_name_guess: "Apple One",
  total: "16.95",
  currency: "USD",
  transaction_date: "2026-03-15",
  confidence_overall: "0.92",
  ...overrides,
});

describe("ReceiptsTable", () => {
  it("renders an empty state when rows are empty", () => {
    render(<ReceiptsTable rows={[]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(/no receipts yet/i)).toBeTruthy();
  });

  it("shows the Apple platform badge and the underlying vendor separately", () => {
    const rows = [
      baseRow({
        service_name_guess: "ChatGPT Plus",
        vendor_normalized: "OpenAI",
        billing_platform: "Apple",
      }),
    ];
    render(<ReceiptsTable rows={rows} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText("ChatGPT Plus")).toBeTruthy();
    expect(screen.getByText(/vendor: OpenAI/)).toBeTruthy();
    expect(screen.getByText(/^Apple$/)).toBeTruthy();
  });

  it("confidence colors: 95%+ green, 80-94 cyan, <80 amber", () => {
    const rows = [
      baseRow({ id: "aaa", confidence_overall: "0.97", service_name_guess: "High" }),
      baseRow({ id: "bbb", confidence_overall: "0.85", service_name_guess: "Mid" }),
      baseRow({ id: "ccc", confidence_overall: "0.60", service_name_guess: "Low" }),
    ];
    const { container } = render(
      <ReceiptsTable rows={rows} selectedId={null} onSelect={() => {}} />,
    );
    const highRow = container.querySelector('[data-testid="receipt-row-aaa"]');
    const midRow = container.querySelector('[data-testid="receipt-row-bbb"]');
    const lowRow = container.querySelector('[data-testid="receipt-row-ccc"]');
    expect(highRow?.innerHTML).toContain("text-emerald-400");
    expect(midRow?.innerHTML).toContain("text-cyan-300");
    expect(lowRow?.innerHTML).toContain("text-amber-300");
  });

  it("clicking a row fires onSelect with the intake id", () => {
    const onSelect = vi.fn();
    const rows = [baseRow({ id: "xyz-id" })];
    render(<ReceiptsTable rows={rows} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("receipt-row-xyz-id"));
    expect(onSelect).toHaveBeenCalledWith("xyz-id");
  });
});
