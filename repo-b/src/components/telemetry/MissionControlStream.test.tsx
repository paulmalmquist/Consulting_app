import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import MissionControlStream from "./MissionControlStream";
import type { StreamLive } from "@/lib/telemetry/stream";

// Mock the polling hook so we can drive each stream state deterministically, and the model-perf
// fetch used for the champion chip.
const { useStreamPoll, getModelPerformance } = vi.hoisted(() => ({
  useStreamPoll: vi.fn(),
  getModelPerformance: vi.fn(async () => ({ models: [], null_reason: "model_not_promoted" })),
}));

vi.mock("@/lib/telemetry/stream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/telemetry/stream")>();
  return { ...actual, useStreamPoll };   // keep STREAM_REASON_HINT + deriveLag real
});
vi.mock("@/lib/telemetry/api", () => ({
  getModelPerformance,
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "7e1eb000-0000-4000-a000-000000000001",
}));

function live(partial: Partial<StreamLive>): StreamLive {
  return {
    server_ts: "2026-06-10T18:00:00+00:00",
    source: "db_tail",
    worker_present: false,
    pipeline: { status: "unknown", as_of_ts: null, reason: "no_status_row", surfaces: {} },
    channels: [],
    events: [],
    null_reason: null,
    ...partial,
  };
}

describe("MissionControlStream — actionable fail-closed states (hardening)", () => {
  beforeEach(() => {
    useStreamPoll.mockReset();
    getModelPerformance.mockClear();
  });

  it("worker disabled: shows the specific reason + repair hint, NOT a vague no_stream_data", async () => {
    useStreamPoll.mockReturnValue({
      live: live({ null_reason: "stream_worker_disabled", worker_present: false }),
      error: null, clientNowMs: Date.now(),
    });
    render(<MissionControlStream />);
    const box = await screen.findByTestId("stream-unavailable");
    expect(box.textContent).toContain("stream_worker_disabled");
    expect(box.textContent).toMatch(/TELEMETRY_STREAM_ENABLED=1/);   // actionable repair hint
    expect(box.textContent).toMatch(/No synthetic or interpolated values/);
    expect(box.textContent).toContain("worker in this process: not running");
  });

  it("etl watermark stalled renders its own distinct hint", async () => {
    useStreamPoll.mockReturnValue({
      live: live({ null_reason: "etl_watermark_stalled", worker_present: true,
        pipeline: { status: "fresh", as_of_ts: null, reason: null, surfaces: {} } }),
      error: null, clientNowMs: Date.now(),
    });
    render(<MissionControlStream />);
    const box = await screen.findByTestId("stream-unavailable");
    expect(box.textContent).toContain("etl_watermark_stalled");
    expect(box.textContent).toMatch(/silver watermark/i);
    expect(box.textContent).toContain("worker in this process: running");
  });

  // A channel is required for the PIPELINE panel (and its broker row) to render at all.
  const oneChannel = [{
    channel_name: "USLAB000058", unit: "mmHg", redline_low: 700, redline_high: 790,
    readings: [{ t: "2026-06-10T17:59:59+00:00", v: 752.1 }],
    latest: { t: "2026-06-10T17:59:59+00:00", v: 752.1 },
  }];

  it("broker row recently checked renders its status + a fresh age, not STALE", async () => {
    const now = Date.parse("2026-06-10T18:00:00+00:00");
    useStreamPoll.mockReturnValue({
      live: live({
        source: "capture",
        channels: oneChannel,
        pipeline: { status: "fresh", as_of_ts: "2026-06-10T18:00:00+00:00", reason: null,
          surfaces: {
            broker: { status: "warm", as_of_ts: "2026-06-10T17:55:00+00:00",  // 5m ago
              reason: "idle · 0 connectors · 0 running flink stmts · checked 17:55Z" },
          } },
      }),
      error: null, clientNowMs: now,
    });
    vi.spyOn(Date, "now").mockReturnValue(now);
    render(<MissionControlStream />);
    expect(await screen.findByText(/idle · 0 connectors/)).toBeInTheDocument();
    expect(screen.getByText(/5m ago/)).toBeInTheDocument();
    expect(screen.queryByText(/STALE \(/)).toBeNull();   // 5m < 30m threshold → not stale
    vi.restoreAllMocks();
  });

  it("broker row past the staleness threshold renders STALE with its age, even though stored status was warm", async () => {
    const now = Date.parse("2026-06-10T18:00:00+00:00");
    useStreamPoll.mockReturnValue({
      live: live({
        source: "capture",
        channels: oneChannel,
        pipeline: { status: "fresh", as_of_ts: "2026-06-10T18:00:00+00:00", reason: null,
          surfaces: {
            broker: { status: "warm", as_of_ts: "2026-06-10T17:10:00+00:00",  // 50m ago > 30m
              reason: "idle · 0 connectors · checked 17:10Z" },
          } },
      }),
      error: null, clientNowMs: now,
    });
    vi.spyOn(Date, "now").mockReturnValue(now);
    render(<MissionControlStream />);
    // The refresh lapsed: the row must visibly age rather than imply 'warm' is current.
    expect(await screen.findByText(/STALE \(50m ago\)/)).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("a live CAPTURE feed with channels renders strips, never the unavailable box", async () => {
    useStreamPoll.mockReturnValue({
      live: live({
        source: "capture",
        pipeline: { status: "fresh", as_of_ts: "2026-06-10T18:00:00+00:00", reason: null, surfaces: {} },
        channels: [{
          channel_name: "USLAB000058", unit: "mmHg", redline_low: 700, redline_high: 790,
          readings: [{ t: "2026-06-10T17:59:59+00:00", v: 752.1 }],
          latest: { t: "2026-06-10T17:59:59+00:00", v: 752.1 },
        }],
      }),
      error: null, clientNowMs: Date.parse("2026-06-10T18:00:01+00:00"),
    });
    render(<MissionControlStream />);
    await waitFor(() => expect(screen.queryByTestId("stream-unavailable")).toBeNull());
    // CAPTURE source chip is shown (honest label), and the channel strip exists — the strip now
    // renders the friendly ISS node name (channelLabel), not the raw channel id.
    expect(screen.getByText(/CAPTURE/)).toBeInTheDocument();
    expect(screen.getAllByText(/US Lab · cabin pressure/).length).toBeGreaterThan(0);
  });

  it("relabels the poll control to Pause and exports the live anomaly events as CSV (8C)", async () => {
    useStreamPoll.mockReturnValue({
      live: live({
        source: "capture",
        pipeline: { status: "fresh", as_of_ts: "2026-06-10T18:00:00+00:00", reason: null, surfaces: {} },
        channels: [{
          channel_name: "USLAB000058", unit: "mmHg", redline_low: 700, redline_high: 790,
          readings: [{ t: "2026-06-10T17:59:59+00:00", v: 752.1 }],
          latest: { t: "2026-06-10T17:59:59+00:00", v: 752.1 },
        }],
        events: [{ channel_name: "USLAB000058", start_t: 1, end_t: 2, anomaly_class: "point", confidence: 0.9 }],
      }),
      error: null, clientNowMs: Date.parse("2026-06-10T18:00:01+00:00"),
    });
    render(<MissionControlStream />);
    await waitFor(() => expect(screen.queryByTestId("stream-unavailable")).toBeNull());
    // "Hold" → "Pause" relabel.
    expect(screen.getByRole("button", { name: /Pause the live poll/i })).toBeInTheDocument();
    expect(screen.queryByText("Hold")).toBeNull();
    // Live anomaly events are exportable, honestly labeled as tel_anomaly_events rows.
    expect(screen.getByText(/live tel_anomaly_events/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export CSV/i })).not.toBeDisabled();
    // 8D-3: the server XLSX export (anomaly_events dataset) is wired next to the CSV.
    expect(screen.getByRole("button", { name: /Export XLSX/i })).not.toBeDisabled();
  });
});
