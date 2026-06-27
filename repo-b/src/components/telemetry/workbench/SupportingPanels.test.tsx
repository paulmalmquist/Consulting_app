import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ParityPanel, DriftPanel } from "./SupportingPanels";
import { ExperimentTrackingPanel } from "./ExperimentTrackingPanel";
import {
  getWorkbenchParity, getWorkbenchDrift, getWorkbenchEmbedding, getWorkbenchFactoryShap,
  getWorkbenchExperiments,
} from "@/lib/telemetry/api";

vi.mock("@/lib/telemetry/api", () => ({
  getWorkbenchParity: vi.fn(),
  getWorkbenchDrift: vi.fn(),
  getWorkbenchEmbedding: vi.fn(),
  getWorkbenchFactoryShap: vi.fn(),
  getWorkbenchExperiments: vi.fn(),
}));
const m = {
  parity: getWorkbenchParity as ReturnType<typeof vi.fn>,
  drift: getWorkbenchDrift as ReturnType<typeof vi.fn>,
  emb: getWorkbenchEmbedding as ReturnType<typeof vi.fn>,
  shap: getWorkbenchFactoryShap as ReturnType<typeof vi.fn>,
  exp: getWorkbenchExperiments as ReturnType<typeof vi.fn>,
};

beforeEach(() => vi.clearAllMocks());

describe("ParityPanel", () => {
  it("shows the Δ=0 reproduction of the champion (real S7 receipt)", async () => {
    m.parity.mockResolvedValue({
      kind: "parity", provider: "gcp", null_reason: null, fallback_used: false,
      payload: { match: true, gcp_metrics: { f1_pointwise: 0.312953 }, champion_metrics: { f1_pointwise: 0.312953 }, deltas: { f1_pointwise: 0 } },
    });
    render(<ParityPanel />);
    expect(await screen.findByText(/reproduces champion/i)).toBeInTheDocument();
  });
});

describe("DriftPanel", () => {
  it("fails closed honestly until the S11 drift receipt lands", async () => {
    m.drift.mockResolvedValue({ kind: "drift_features", provider: null, null_reason: "gcp_receipt_not_generated_yet", fallback_used: true, payload: null });
    render(<DriftPanel />);
    expect(await screen.findByText(/Statistical drift not generated yet/i)).toBeInTheDocument();
  });
});

describe("ExperimentTrackingPanel", () => {
  it("fails closed before the Vertex run, then renders runs when present", async () => {
    m.exp.mockResolvedValueOnce({ kind: "experiment_runs", provider: null, null_reason: "gcp_receipt_not_generated_yet", fallback_used: true, payload: null });
    const { unmount } = render(<ExperimentTrackingPanel />);
    expect(await screen.findByText(/No experiment runs recorded yet/i)).toBeInTheDocument();
    unmount();

    m.exp.mockResolvedValueOnce({
      kind: "experiment_runs", provider: "vertex", vertex_run_id: "anomaly-mad-baseline-001",
      vertex_experiment: "telemetry-predictive-maintenance", null_reason: null, fallback_used: false,
      payload: { runs: [{ run_id: "anomaly-mad-baseline-001", feature_set: "baseline", metrics: { f1_pointwise: 0.312953, event_recall: 0.769231 }, status: "JobState.JOB_STATE_SUCCEEDED" }], hpo: { status: "not_run", note: "baseline" } },
    });
    render(<ExperimentTrackingPanel />);
    expect(await screen.findByText("anomaly-mad-baseline-001")).toBeInTheDocument();
    expect(screen.getByText("0.3130")).toBeInTheDocument();
  });
});
