import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { getModelPerformance } = vi.hoisted(() => ({ getModelPerformance: vi.fn() }));
vi.mock("@/lib/telemetry/api", () => ({
  getModelPerformance,
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "7e1eb000-0000-4000-a000-000000000001",
}));

import ModelPerformance from "./ModelPerformance";

const models = [
  {
    model_name: "tel_anomaly_mad", model_kind: "anomaly", model_version: "3", model_alias: "champion",
    mlflow_run_id: "run-abc", experiment_id: "exp-1", promotion_state: "promoted",
    metrics: {
      precision: 0.33, recall: 0.30, f1: 0.645, f1_pointwise: 0.313, precision_pointwise: 0.328,
      recall_pointwise: 0.299, event_recall: 0.769, alarm_precision: 0.475,
      honest_metrics_note: "Honest pointwise F1 is lower than the point-adjusted benchmark.",
    },
    gate: { decision: "pass" },
  },
  {
    model_name: "tel_anomaly_pca", model_kind: "anomaly", model_version: "2", model_alias: null,
    mlflow_run_id: "run-pca", experiment_id: "exp-1", promotion_state: "baseline",
    metrics: { precision: 0.2, recall: 0.2, f1: 0.4 }, gate: { decision: "fail" },
  },
  {
    model_name: "tel_rul_gbr", model_kind: "rul", model_version: "1", model_alias: "champion",
    mlflow_run_id: "run-rul", experiment_id: "exp-2", promotion_state: "promoted",
    metrics: { rmse: 20.96, phm: 742.4 }, gate: { decision: "pass" },
  },
];

describe("ModelPerformance — champion/challenger + links + export (8D-1)", () => {
  it("labels champion vs challenger, states operational use, tags the source kind, keeps honest framing", async () => {
    getModelPerformance.mockResolvedValue({ models, null_reason: null });
    render(<ModelPerformance />);
    expect(await screen.findByText("tel_anomaly_mad")).toBeInTheDocument();
    expect(screen.getAllByText("champion").length).toBeGreaterThan(0);          // role made explicit
    expect(screen.getByText(/challenger · baseline/i)).toBeInTheDocument();
    expect(screen.getByText(/Operational use: scores each window/i)).toBeInTheDocument();
    expect(screen.getByText(/tel_model_runs · metrics \+ promotion gate/i)).toBeInTheDocument();
    expect(screen.getByText("F1 (point-wise — honest)")).toBeInTheDocument();   // honest framing preserved
  });

  it("drills to per-model MLflow run links (live) + fail-closed UC artifact links + CSV export", async () => {
    getModelPerformance.mockResolvedValue({ models, null_reason: null });
    render(<ModelPerformance />);
    await screen.findByText("tel_anomaly_mad");
    fireEvent.click(screen.getByRole("button", { name: /Inspect the model rows and export/i }));
    const runLinks = screen.getAllByRole("link", { name: /Open MLflow Run/i });
    expect(runLinks.length).toBeGreaterThanOrEqual(3);                          // one per model with a run id
    expect(runLinks[0].getAttribute("href")).toContain("run-");
    // The UC model link fails closed for the seed registry name (not a 3-part UC path).
    expect(screen.getAllByText(/Unavailable —/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Export CSV/i })).not.toBeDisabled();
  });
});
