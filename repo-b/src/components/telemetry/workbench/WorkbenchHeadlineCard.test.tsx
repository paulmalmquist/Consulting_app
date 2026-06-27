import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkbenchHeadlineCard } from "./WorkbenchHeadlineCard";
import { getWorkbenchExperiments } from "@/lib/telemetry/api";

vi.mock("@/lib/telemetry/api", () => ({
  getWorkbenchExperiments: vi.fn(),
}));

const mockExp = getWorkbenchExperiments as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("WorkbenchHeadlineCard", () => {
  it("shows the four-column experiment frame even before a receipt lands (honest baseline fallback)", async () => {
    mockExp.mockResolvedValue({
      kind: "experiment_runs", provider: null, null_reason: "gcp_receipt_not_generated_yet",
      fallback_used: true, payload: null,
    });
    render(<WorkbenchHeadlineCard />);
    expect(await screen.findByText("Hypothesis")).toBeInTheDocument();
    expect(screen.getByText("Feature change")).toBeInTheDocument();
    expect(screen.getByText("Result")).toBeInTheDocument();
    expect(screen.getByText("Promotion outcome")).toBeInTheDocument();
    expect(screen.getByText(/Awaiting first GCP experiment receipt/i)).toBeInTheDocument();
    expect(screen.getByText("awaiting receipt")).toBeInTheDocument();
  });

  it("renders the experiment's headline when the receipt carries one", async () => {
    mockExp.mockResolvedValue({
      kind: "experiment_runs", provider: "vertex", null_reason: null, fallback_used: false,
      payload: { headline: {
        experiment_label: "Experiment 003 — Temporal residual features",
        hypothesis: "slope detects drift earlier",
        feature_change: "added residual_slope_10",
        result: "recall up, alarm precision down",
        promotion_outcome: "not promoted",
      } },
    });
    render(<WorkbenchHeadlineCard />);
    expect(await screen.findByText("Experiment 003 — Temporal residual features")).toBeInTheDocument();
    expect(screen.getByText("recall up, alarm precision down")).toBeInTheDocument();
    expect(screen.getByText("vertex")).toBeInTheDocument();
  });
});
