import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ModelEvidenceCard from "./ModelEvidenceCard";
import { getModelPerformance, getMonitoring } from "@/lib/telemetry/api";

vi.mock("@/lib/telemetry/api", () => ({
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "biz",
  getModelPerformance: vi.fn(),
  getMonitoring: vi.fn(),
}));

const mockPerf = vi.mocked(getModelPerformance);
const mockMon = vi.mocked(getMonitoring);

afterEach(() => {
  vi.clearAllMocks();
});

describe("ModelEvidenceCard fail-closed", () => {
  it("renders an error state when model-performance returns a null_reason", async () => {
    mockPerf.mockResolvedValue({ models: [], null_reason: "model_not_promoted" });
    mockMon.mockResolvedValue({ psi: null } as never);
    render(<ModelEvidenceCard />);
    expect(await screen.findByText(/model_not_promoted/i)).toBeInTheDocument();
  });

  it("renders an error state when the fetch rejects", async () => {
    mockPerf.mockRejectedValue(new Error("boom"));
    mockMon.mockResolvedValue({ psi: null } as never);
    render(<ModelEvidenceCard />);
    expect(await screen.findByText(/Could not load/i)).toBeInTheDocument();
  });
});

describe("ModelEvidenceCard with real payload", () => {
  it("labels honest pointwise F1 distinctly from the point-adjusted benchmark and shows the drift band", async () => {
    mockPerf.mockResolvedValue({
      null_reason: null,
      models: [
        {
          model_name: "mad_baseline",
          model_kind: "anomaly",
          model_version: "3",
          model_alias: "champion",
          mlflow_run_id: "abc123run",
          experiment_id: "1",
          metrics: {
            f1: 0.71, f1_pointwise: 0.34, precision_pointwise: 0.41, recall_pointwise: 0.29,
            event_recall: 0.88, alarm_precision: 0.52,
          },
          gate: { metric: "f1", op: ">=", threshold: 0.3 },
          promotion_state: "promoted",
        },
      ],
    });
    mockMon.mockResolvedValue({ psi: 0.18 } as never);

    render(<ModelEvidenceCard />);

    await waitFor(() => expect(screen.getByText(/F1 \(honest pointwise\)/i)).toBeInTheDocument());
    expect(screen.getByText(/F1 \(point-adjusted, benchmark\)/i)).toBeInTheDocument();
    expect(screen.getByText("0.3400")).toBeInTheDocument();
    expect(screen.getByText("abc123run")).toBeInTheDocument();
    // PSI 0.18 → watch band.
    expect(screen.getByText(/0\.18 · watch/)).toBeInTheDocument();
    // Static validation methodology line.
    expect(screen.getByText(/label-shuffle leakage control/i)).toBeInTheDocument();
  });
});
