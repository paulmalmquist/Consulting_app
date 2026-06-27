import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FpFnReviewDrawer } from "./FpFnReviewDrawer";
import { getWorkbenchErrorReview } from "@/lib/telemetry/api";

vi.mock("@/lib/telemetry/api", () => ({ getWorkbenchErrorReview: vi.fn() }));
const mockReview = getWorkbenchErrorReview as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("FpFnReviewDrawer", () => {
  it("does not fetch while closed", () => {
    render(<FpFnReviewDrawer open={false} onClose={() => {}} />);
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("fails closed honestly when the error_review receipt is absent", async () => {
    mockReview.mockResolvedValue({
      kind: "error_review", provider: null, null_reason: "gcp_receipt_not_generated_yet",
      fallback_used: true, payload: null,
    });
    render(<FpFnReviewDrawer open onClose={() => {}} />);
    expect(await screen.findByText("Failure review not generated yet")).toBeInTheDocument();
  });

  it("renders FP/FN cases and a drill affordance when wired", async () => {
    const onDrill = vi.fn();
    mockReview.mockResolvedValue({
      kind: "error_review", provider: "vertex", null_reason: null, fallback_used: false,
      payload: {
        cases: [
          { id: "fp-1", kind: "false_positive", channel: "D-4", window: "t=120-180",
            model_saw: "residual spike", true_label: "nominal", feature_pushed: "residual_slope",
            acceptable: "low-cost false alarm", suggested_fix: "per-channel scale" },
          { id: "fn-1", kind: "false_negative", channel: "T-1", true_label: "anomaly" },
        ],
        highlights: [{ label: "Worst noisy channel", value: "D-4" }],
      },
    });
    render(<FpFnReviewDrawer open onClose={() => {}} onDrill={onDrill} />);
    expect(await screen.findByText("False positive")).toBeInTheDocument();
    expect(screen.getByText("False negative")).toBeInTheDocument();
    expect(screen.getByText("residual_slope")).toBeInTheDocument();
    expect(screen.getByText("D-4")).toBeInTheDocument();        // highlight value
    fireEvent.click(screen.getAllByRole("button", { name: /Drill/i })[0]);
    await waitFor(() => expect(onDrill).toHaveBeenCalledTimes(1));
  });
});
