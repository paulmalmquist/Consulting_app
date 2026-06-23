import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@/lib/telemetry/api", () => ({
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "biz-1",
  getSummary: vi.fn().mockResolvedValue({
    kpi: { promoted_models: 4, anomaly_f1: 0.6387, rul_rmse: 20.32, predictions: 59898, test_runs: 43, last_scored_at: "2026-06-16T00:00:00Z", drift_monitors: 4 },
    inventory: { model_runs: 6 },
    verdicts: { GO: 59793, REVIEW: 31, NO_GO: 74 },
    verdict_pct: { NO_GO: 0.001 },
    note: "operated history",
  }),
}));

// Stub the heavy Bottleneck Map (recharts) — its own tests cover its behavior.
vi.mock("./context/BottleneckMap/BottleneckMap", () => ({ default: () => <div data-testid="bottleneck-map">charts</div> }));

import TelemetryOverview from "./TelemetryOverview";

describe("TelemetryOverview — charts-led Overview", () => {
  it("renders the Overview heading and the launch-history Bottleneck Map charts", async () => {
    render(<TelemetryOverview envId="env-1" />);
    expect(await screen.findByText("Why launch became a data problem")).toBeInTheDocument();
    expect(screen.getByTestId("bottleneck-map")).toBeInTheDocument();
    expect(screen.getByText(/Context · why launch became a data problem/i)).toBeInTheDocument();
  });

  it("shows the real telemetry KPI strip (genuine serving metrics)", async () => {
    render(<TelemetryOverview envId="env-1" />);
    expect(await screen.findByText("Promoted models")).toBeInTheDocument();
    expect(screen.getByText("0.6387")).toBeInTheDocument(); // anomaly F1
    expect(screen.getByText("59,898")).toBeInTheDocument(); // predictions
  });

  it("no longer renders the executive Mission Summary scaffolding", async () => {
    render(<TelemetryOverview envId="env-1" />);
    await screen.findByTestId("bottleneck-map");
    expect(screen.queryByText("Mission readiness")).not.toBeInTheDocument();
    expect(screen.queryByText(/composite_formula_not_ratified/)).not.toBeInTheDocument();
    expect(screen.queryByText("Projection unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("Continue the demo")).not.toBeInTheDocument();
  });
});
