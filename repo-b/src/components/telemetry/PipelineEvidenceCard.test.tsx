import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PipelineEvidenceCard from "./PipelineEvidenceCard";
import { getSummary, getFusedVectorInfo } from "@/lib/telemetry/api";

vi.mock("@/lib/telemetry/api", () => ({
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "biz",
  getSummary: vi.fn(),
  getFusedVectorInfo: vi.fn(),
}));

const mockSummary = vi.mocked(getSummary);
const mockFused = vi.mocked(getFusedVectorInfo);

function summaryPayload() {
  return {
    inventory: { test_runs: 100, telemetry_channels: 55, predictions: 4000, anomaly_events: 12, model_runs: 4, drift_metrics: 9 },
    kpi: {
      test_runs: 100, predictions: 4000, anomaly_events: 12, promoted_models: 2, drift_monitors: 9,
      anomaly_f1: 0.34, rul_rmse: 18.2, last_scored_at: "2026-06-20T10:00:00Z",
    },
    verdicts: {}, verdict_pct: {}, note: "test note",
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PipelineEvidenceCard fail-closed", () => {
  it("renders an error state when the summary fetch rejects", async () => {
    mockSummary.mockRejectedValue(new Error("boom"));
    mockFused.mockResolvedValue({ available: false } as never);
    render(<PipelineEvidenceCard />);
    expect(await screen.findByText(/Could not load/i)).toBeInTheDocument();
  });

  it("keeps the card but shows the fused sub-section null_reason when fused info is unavailable", async () => {
    mockSummary.mockResolvedValue(summaryPayload() as never);
    mockFused.mockResolvedValue({ available: false, null_reason: "fused_vectors_not_built" } as never);
    render(<PipelineEvidenceCard />);
    // Rest of the card still renders (text appears in both the panel title and the runtime row).
    await waitFor(() => expect(screen.getAllByText(/Databricks \/ PySpark medallion/i).length).toBeGreaterThan(0));
    // The fused section shows its own null reason.
    expect(screen.getByText(/fused_vectors_not_built/i)).toBeInTheDocument();
  });
});

describe("PipelineEvidenceCard with real payload", () => {
  it("renders the Databricks runtime and the 256-dim fused vector", async () => {
    mockSummary.mockResolvedValue(summaryPayload() as never);
    mockFused.mockResolvedValue({
      available: true, vector_dim: 256, n_channels: 4, features_per_channel: 64,
      source: "gold.telemetry_fused_state", alignment: "tick-aligned", fused_vectors: 1200,
    } as never);

    render(<PipelineEvidenceCard />);

    await waitFor(() => expect(screen.getAllByText(/Databricks \/ PySpark medallion/i).length).toBeGreaterThan(0));
    expect(screen.getByText("256-dim")).toBeInTheDocument();
    expect(screen.getByText("gold.telemetry_fused_state")).toBeInTheDocument();
    // Real input channel count.
    expect(screen.getByText("55")).toBeInTheDocument();
    // predictions + test_runs = 4100 rows processed.
    expect(screen.getByText("4,100")).toBeInTheDocument();
  });
});
