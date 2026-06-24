import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ReplayFeed } from "@/lib/telemetry/api";
import ReplayForensicsDrawer from "./ReplayForensicsDrawer";

// Mock the live registry/monitoring fetches the Model tab makes. Keep TELEMETRY_DEMO_* (and types)
// real via importOriginal; the Signal/Evidence/Lineage tabs make no calls, so the mock only matters
// when the Model tab is activated (where we assert the fail-closed Not-available path).
vi.mock("@/lib/telemetry/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    getModelPerformance: vi.fn(async () => ({ models: [], null_reason: "model_not_promoted" })),
    getMonitoring: vi.fn(async () => ({ conformal_budget: null, null_reason: "no_prediction_rows" })),
  };
});

// The Operator tab embeds the grounded copilot panel; stub its network call so the test never hits it.
vi.mock("@/lib/telemetry/copilot-api", () => ({
  explainVerdict: vi.fn(async () => ({
    answer: "", evidence: [], tool_trace: [], null_reason: null, is_refusal: false, intent: null,
    answer_source: "fallback_template", prompt_version: "", model: "", draft_report_md: null, request_id: "",
  })),
  askCopilot: vi.fn(), getGovernance: vi.fn(), draftReport: vi.fn(), recordDisposition: vi.fn(),
}));

// A compact feed mirroring the real fixture's load-bearing facts: pre-label fires, later labeled window.
const feed: ReplayFeed = {
  channel: "D-4",
  spacecraft: "MSL",
  fixture_ticks: 6,
  total_ticks_source: 60,
  first_model_fire_t: 10,
  model_fired_ticks: 2,
  label_anomaly_ticks: 2,
  provenance: {
    source_table: "novendor_1.telemetry.gold_replay_feed_scored",
    champion_model: "novendor_1.telemetry.tel_anomaly_detector@champion",
    champion_mlflow_run_id: "4a48cb6af8714609b9581d66e904544c",
    note: "Precomputed REAL champion outputs. model_pred is the model's flag, not hand-authored.",
  },
  feed: [
    { t: 0, value: -1, rmean: -1, score: 0, model_pred: 0, is_anomaly: 0 },
    { t: 9, value: -1, rmean: -1, score: 0, model_pred: 0, is_anomaly: 0 },
    { t: 10, value: 1, rmean: -0.9, score: 1.4e12, model_pred: 1, is_anomaly: 0 },
    { t: 11, value: -1, rmean: -0.95, score: 0, model_pred: 0, is_anomaly: 0 },
    { t: 30, value: 0.9, rmean: 0.1, score: 1, model_pred: 1, is_anomaly: 1 },
    { t: 31, value: 0.2, rmean: 0.15, score: 1, model_pred: 0, is_anomaly: 1 },
  ],
};

const fireTick = feed.feed[2];

describe("ReplayForensicsDrawer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when closed", () => {
    render(<ReplayForensicsDrawer open={false} onClose={() => {}} feed={feed} cursorTick={null} fired={false} />);
    expect(screen.queryByText(/Replay forensics/)).not.toBeInTheDocument();
  });

  it("opens with all five tabs and the not-proprietary source-truth framing", () => {
    render(<ReplayForensicsDrawer open onClose={() => {}} feed={feed} cursorTick={fireTick} fired />);
    for (const t of ["Signal", "Model", "Evidence", "Operator action", "Lineage"]) {
      expect(screen.getByRole("button", { name: t })).toBeInTheDocument();
    }
    expect(screen.getByText(/not proprietary rocket data/i)).toBeInTheDocument();
    // Signal tab is default and explains D-4 is anonymized (no physical unit invented).
    expect(screen.getByText(/anonymized NASA SMAP\/MSL telemetry channel/i)).toBeInTheDocument();
  });

  it("Evidence tab shows the confusion matrix under the 'NOT held-out validation' caveat and the pre-label framing", () => {
    render(<ReplayForensicsDrawer open onClose={() => {}} feed={feed} cursorTick={fireTick} fired initialTab="evidence" />);
    expect(screen.getByText(/NOT held-out validation/)).toBeInTheDocument();
    // Honest timing: model first fires before the labeled window → pre-label false alarms, not lead time.
    expect(screen.getByText(/false alarm/i)).toBeInTheDocument();
    expect(screen.getAllByText(/NASA-labeled window/i).length).toBeGreaterThan(0);
  });

  it("Lineage tab fails closed on the workspace link and the unavailable fields", () => {
    render(<ReplayForensicsDrawer open onClose={() => {}} feed={feed} cursorTick={fireTick} fired initialTab="lineage" />);
    expect(screen.getByText(/Link unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/no test-stage, phase, segment, or regime boundary/i)).toBeInTheDocument();
    expect(screen.getByText(/single channel \(D-4\)/i)).toBeInTheDocument();
  });

  it("Model tab fails closed (Not available) when the registry has no promoted champion", async () => {
    render(<ReplayForensicsDrawer open onClose={() => {}} feed={feed} cursorTick={fireTick} fired initialTab="model" />);
    // Champion identity comes from provenance synchronously (the MLflow run id is shown + copyable).
    expect(screen.getByText("4a48cb6af8714609b9581d66e904544c")).toBeInTheDocument();
    // The held-out-metrics section resolves to the fail-closed Not-available reason.
    await waitFor(() =>
      expect(screen.getByText(/model registry returned no promoted anomaly model/i)).toBeInTheDocument(),
    );
  });

  it("fails closed entirely when the payload itself is the data_not_ingested shape", () => {
    const empty: ReplayFeed = {
      channel: "", spacecraft: "", fixture_ticks: 0, total_ticks_source: 0, first_model_fire_t: null,
      model_fired_ticks: 0, label_anomaly_ticks: 0,
      provenance: { source_table: "", champion_model: "", champion_mlflow_run_id: "", note: "" },
      feed: [], null_reason: "data_not_ingested",
    };
    render(<ReplayForensicsDrawer open onClose={() => {}} feed={empty} cursorTick={null} fired={false} />);
    expect(screen.getByText(/data_not_ingested/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Evidence" })).not.toBeInTheDocument();
  });
});
