import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import KnownAnomalyCard, { scoreVerdict } from "./KnownAnomalyCard";
import type { ReplayFeed } from "@/lib/telemetry/api";

const { getReplayFeed } = vi.hoisted(() => ({ getReplayFeed: vi.fn() }));

vi.mock("@/lib/telemetry/api", () => ({ getReplayFeed }));

const realFeed: ReplayFeed = {
  channel: "D-4",
  spacecraft: "SMAP",
  fixture_ticks: 5,
  total_ticks_source: 800,
  first_model_fire_t: 728,
  model_fired_ticks: 3,
  label_anomaly_ticks: 2,
  provenance: {
    source_table: "tel_replay_fixture",
    champion_model: "tel_anomaly_detector",
    champion_mlflow_run_id: "4a48cb6a9f01",
    note: "Real recorded champion output on a known SMAP channel.",
  },
  feed: [
    { t: 726, value: 0.2, rmean: 0.1, score: 0.4, model_pred: 0, is_anomaly: 0 },
    { t: 727, value: 0.5, rmean: 0.2, score: 0.9, model_pred: 0, is_anomaly: 0 },
    { t: 728, value: 1.8, rmean: 0.3, score: 2.7, model_pred: 1, is_anomaly: 1 },
    { t: 729, value: 1.2, rmean: 0.4, score: 1.5, model_pred: 1, is_anomaly: 1 },
    { t: 730, value: 0.6, rmean: 0.5, score: 0.7, model_pred: 0, is_anomaly: 0 },
  ],
  null_reason: null,
};

describe("scoreVerdict bands", () => {
  it("maps scores to GO / REVIEW / NO_GO at the boundaries", () => {
    expect(scoreVerdict(0.99)).toBe("GO");
    expect(scoreVerdict(1.0)).toBe("REVIEW");
    expect(scoreVerdict(2.0)).toBe("REVIEW");
    expect(scoreVerdict(2.01)).toBe("NO_GO");
  });
});

describe("KnownAnomalyCard fail-closed", () => {
  it("renders an empty state when the feed has a null_reason", async () => {
    getReplayFeed.mockResolvedValueOnce({ ...realFeed, feed: [], null_reason: "replay_fixture_missing" } satisfies ReplayFeed);
    render(<KnownAnomalyCard />);
    await waitFor(() =>
      expect(screen.getByText(/replay_fixture_missing/)).toBeInTheDocument());
  });
});

describe("KnownAnomalyCard real data", () => {
  it("renders the channel, a NO-GO verdict at the peak, and the champion mlflow run id", async () => {
    getReplayFeed.mockResolvedValueOnce(realFeed);
    render(<KnownAnomalyCard />);
    await waitFor(() => expect(screen.getByText(/D-4 \(SMAP\)/)).toBeInTheDocument());
    // peak score is 2.7 -> NO-GO; appears as the prominent verdict and as a Tag.
    expect(screen.getAllByText("NO-GO").length).toBeGreaterThan(0);
    expect(screen.getByText("4a48cb6a9f01")).toBeInTheDocument();
  });
});
