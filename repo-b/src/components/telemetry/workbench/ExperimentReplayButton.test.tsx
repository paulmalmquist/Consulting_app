import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExperimentReplayButton } from "./ExperimentReplayButton";
import { getWorkbenchExperiments } from "@/lib/telemetry/api";

vi.mock("@/lib/telemetry/api", () => ({ getWorkbenchExperiments: vi.fn() }));
const mockExp = getWorkbenchExperiments as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("ExperimentReplayButton", () => {
  it("is labeled Replay (never train) and does not fetch until opened", () => {
    render(<ExperimentReplayButton />);
    expect(screen.getByRole("button", { name: /Replay experiment receipt/i })).toBeInTheDocument();
    expect(screen.queryByText(/Train model live/i)).not.toBeInTheDocument();
    expect(mockExp).not.toHaveBeenCalled();
  });

  it("opens the receipt and fails closed when none has been generated", async () => {
    mockExp.mockResolvedValue({
      kind: "experiment_runs", provider: null, null_reason: "gcp_receipt_not_generated_yet",
      fallback_used: true, payload: null,
    });
    render(<ExperimentReplayButton />);
    fireEvent.click(screen.getByRole("button", { name: /Replay experiment receipt/i }));
    expect(await screen.findByText("No experiment receipt to replay yet")).toBeInTheDocument();
    // "no live compute triggered" appears in both the drawer title and the Mode field — assert ≥1.
    expect(screen.getAllByText(/no live compute triggered/i).length).toBeGreaterThan(0);
  });

  it("renders a committed run receipt when present", async () => {
    mockExp.mockResolvedValue({
      kind: "experiment_runs", provider: "vertex", null_reason: null, fallback_used: false,
      payload: { latest_run: {
        run_id: "vertex/anomaly-mad-temporal-v003", dataset: "bq gold_smap_msl_windows",
        feature_set: "temporal_v2", result: "did not displace champion",
        reason: "recall improved, alarm precision degraded", artifacts: ["threshold_sweep.json"],
      } },
    });
    render(<ExperimentReplayButton />);
    fireEvent.click(screen.getByRole("button", { name: /Replay experiment receipt/i }));
    expect(await screen.findByText("did not displace champion")).toBeInTheDocument();
    expect(screen.getByText("threshold_sweep.json")).toBeInTheDocument();
  });
});
