import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkbenchDrillButton } from "./WorkbenchDrillButton";
import { getReplayFeed } from "@/lib/telemetry/api";

vi.mock("@/lib/telemetry/api", () => ({ getReplayFeed: vi.fn() }));
const mockFeed = getReplayFeed as ReturnType<typeof vi.fn>;

const FEED = {
  channel: "D-4",
  spacecraft: "SMAP",
  fixture_ticks: 3,
  total_ticks_source: 3,
  first_model_fire_t: 120,
  model_fired_ticks: 1,
  label_anomaly_ticks: 1,
  feed: [
    { t: 118, value: 1.0, rmean: 1.0, score: 0, model_pred: 0, is_anomaly: 0 },
    { t: 119, value: 1.1, rmean: 1.0, score: 0, model_pred: 0, is_anomaly: 0 },
    { t: 120, value: 2.0, rmean: 1.0, score: 1e12, model_pred: 1, is_anomaly: 1 },
  ],
  provenance: {
    source_table: "novendor_1.telemetry.gold_replay_feed",
    champion_model: "tel_anomaly_detector",
    champion_mlflow_run_id: "run-abc",
    note: "",
  },
  scoringDiagnostics: {
    mad_k: 4.0,
    global_train_scale: 0.033866801182436346,
    threshold_residual_units: 0.13546720472974538,
    threshold_source: "serving global-scale fallback",
    residual_definition: "abs(value - rmean)",
    fired_ticks: 1,
    fired_ticks_above_threshold: 0,
    max_fired_residual: 1.0,
    threshold_reproduces_firing: false,
    per_channel_caveat: "The serving global-scale fallback threshold does NOT reproduce the champion's D-4 firing.",
    fixture_score_degenerate: true,
    note: "",
  },
};

beforeEach(() => vi.clearAllMocks());

describe("WorkbenchDrillButton", () => {
  it("drills a real replay anomaly and surfaces the reconciliation caveat", async () => {
    mockFeed.mockResolvedValue(FEED);
    render(<WorkbenchDrillButton />);
    fireEvent.click(screen.getByRole("button", { name: /Drill a live replay anomaly/i }));
    await waitFor(() => expect(screen.getByText(/does NOT reproduce/i)).toBeInTheDocument());
    expect(screen.getByText("scoring reconciliation")).toBeInTheDocument();
    // the fired tick (t=120) anchors the drill — appears across the title/signal/feature rungs
    expect(screen.getAllByText("120").length).toBeGreaterThan(0);
    expect(screen.getByText("D-4")).toBeInTheDocument();
    expect(mockFeed).toHaveBeenCalledTimes(1);
  });
});
