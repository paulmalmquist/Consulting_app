import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThresholdSweepTab } from "./ThresholdSweepTab";
import { getWorkbenchThresholdSweep } from "@/lib/telemetry/api";

vi.mock("@/lib/telemetry/api", () => ({ getWorkbenchThresholdSweep: vi.fn() }));
const mockSweep = getWorkbenchThresholdSweep as ReturnType<typeof vi.fn>;

const OP = { mad_k: 4.0, global_train_scale: 0.033866801182436346, detector_threshold: 0.13546720472974538, source: "frozen" };

beforeEach(() => vi.clearAllMocks());

describe("ThresholdSweepTab", () => {
  it("shows the real operating point and a pending state for the seeded preview", async () => {
    mockSweep.mockResolvedValue({
      kind: "threshold_sweep", provider: "local_fixture", null_reason: null, fallback_used: false,
      payload: { operating_point: OP, sweep: [], confusion_at_operating: null, sweep_pending: true, note: "pending" },
    });
    render(<ThresholdSweepTab />);
    expect(await screen.findByText("Detector threshold")).toBeInTheDocument();
    expect(screen.getByText("0.1355")).toBeInTheDocument();
    expect(screen.getByText("Full sweep pending")).toBeInTheDocument();
  });

  it("renders the confusion matrix when a real sweep is present", async () => {
    mockSweep.mockResolvedValue({
      kind: "threshold_sweep", provider: "vertex", null_reason: null, fallback_used: false,
      payload: {
        operating_point: OP,
        sweep: [
          { threshold: 0.1, precision: 0.2, recall: 0.9 },
          { threshold: 0.135, precision: 0.5, recall: 0.6 },
          { threshold: 0.2, precision: 0.8, recall: 0.3 },
        ],
        confusion_at_operating: { tp: 12, fp: 4, fn: 8, tn: 200 },
        sweep_pending: false,
      },
    });
    render(<ThresholdSweepTab />);
    expect(await screen.findByText("Confusion at the operating threshold")).toBeInTheDocument();
    expect(screen.getByText("True positives")).toBeInTheDocument();
    expect(screen.getByText("False negatives")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("fails closed when the sweep receipt is not generated", async () => {
    mockSweep.mockResolvedValue({
      kind: "threshold_sweep", provider: null, null_reason: "gcp_receipt_not_generated_yet",
      fallback_used: true, payload: null,
    });
    render(<ThresholdSweepTab />);
    expect(await screen.findByText("Threshold sweep not generated yet")).toBeInTheDocument();
  });
});
