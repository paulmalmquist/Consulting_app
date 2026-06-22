import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// Mock the telemetry serving client with a real-shaped, minimal payload.
vi.mock("@/lib/telemetry/api", () => ({
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "biz-1",
  getSummary: vi.fn().mockResolvedValue({
    kpi: {
      promoted_models: 2,
      anomaly_f1: 0.41,
      rul_rmse: 18.2,
      predictions: 2000,
      test_runs: 46,
      last_scored_at: "2026-06-22T00:00:00Z",
      drift_monitors: 4,
    },
    inventory: { model_runs: 4, test_runs: 46, predictions: 2000 },
    verdicts: { GO: 10, REVIEW: 2, NO_GO: 1 },
    verdict_pct: { NO_GO: 0.08 },
    note: "operated history",
  }),
  getModelPerformance: vi.fn().mockResolvedValue({ models: [] }),
  getRuns: vi.fn().mockResolvedValue([]),
  getFusedVectorInfo: vi.fn().mockResolvedValue(null),
}));

// The Bottleneck Map is a heavy recharts context module — stub it for this unit test.
vi.mock("./context/BottleneckMap/BottleneckMap", () => ({ default: () => null }));

import TelemetryOverview from "./TelemetryOverview";

describe("TelemetryOverview — data-backed Mission Summary", () => {
  it("renders the executive page contract heading", async () => {
    render(<TelemetryOverview envId="env-1" />);
    expect(
      await screen.findByText("Mission health, model posture, and operating readiness"),
    ).toBeInTheDocument();
  });

  it("fails closed on Mission Readiness (no invented composite) and shows the null_reason", async () => {
    render(<TelemetryOverview envId="env-1" />);
    expect(await screen.findByText("Not available")).toBeInTheDocument();
    expect(screen.getByText(/composite_formula_not_ratified/)).toBeInTheDocument();
  });

  it("shows real component inputs and a real as-of timestamp", async () => {
    render(<TelemetryOverview envId="env-1" />);
    // Operations component card built from real summary fields.
    expect(await screen.findByText(/2,000 predictions · 46 runs/)).toBeInTheDocument();
    expect(screen.getByText(/Data as of/)).toBeInTheDocument();
  });

  it("collapses Operational Leverage to a single fail-closed projection (not a card wall)", async () => {
    render(<TelemetryOverview envId="env-1" />);
    // Exactly one "Projection unavailable" now, not five large empty cards.
    expect(await screen.findAllByText("Projection unavailable")).toHaveLength(1);
  });

  it("links to detail pages instead of re-hosting their tables (launchpads, no duplicate KPI strip)", async () => {
    render(<TelemetryOverview envId="env-1" />);
    expect(await screen.findByText("Continue the demo")).toBeInTheDocument();
    // Launchpad cards link out; the Model Registry / Test Runs detail is NOT rendered inline.
    expect(screen.getByText("Review model registry")).toBeInTheDocument();
    expect(screen.getByText("Inspect test runs")).toBeInTheDocument();
    expect(screen.getByText("Open metric lineage")).toBeInTheDocument();
    // The old duplicate "Verdict distribution" panel is gone; scoring posture replaces it.
    expect(screen.getByText("Current scoring posture")).toBeInTheDocument();
    expect(screen.queryByText("Ingested test runs")).not.toBeInTheDocument();
  });
});
