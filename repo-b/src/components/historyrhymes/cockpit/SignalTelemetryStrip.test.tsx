import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SignalTelemetryStrip } from "./SignalTelemetryStrip";
import { SignalTelemetryTile } from "./SignalTelemetryTile";
import { SIGNAL_KEYS, parseBriefSignals } from "@/lib/historyrhymes/signals";
import type { HrBrief } from "@/lib/historyrhymes/client";

const BRIEF = {
  brief_id: "b1",
  published_at: "2026-06-10T08:00:00Z",
  regime_call: "late_cycle",
  confidence: 0.6,
  freshness_score: 0.9,
  markdown_uri: null,
  parsed_json: {
    latest_signals: {
      mvrv_z: 2.31,
      yc_10y2y: 0.53,
      vix_term: -0.12,
      fed_tone: "hawkish",
      per_signal_freshness: { mvrv_z: "fresh", yc_10y2y: "3d" },
    },
    previous_signals: { yc_10y2y: 0.47 },
  },
  source: "weekly",
  created_at: "2026-06-10T08:00:00Z",
} as HrBrief;

describe("SignalTelemetryStrip", () => {
  it("renders all eight tiles even when half the signals are absent", () => {
    render(<SignalTelemetryStrip brief={BRIEF} />);
    for (const { key } of SIGNAL_KEYS) {
      expect(screen.getByTestId(`hr-signal-tile-${key}`)).toBeTruthy();
    }
    expect(screen.getByTestId("hr-signal-value-mvrv_z").textContent).toBe("2.31");
    expect(screen.getByTestId("hr-signal-value-housing").textContent).toBe("—");
    expect(screen.getByTestId("hr-signal-nullreason-housing").textContent).toBe("not present in latest brief");
    expect(screen.getByTestId("hr-signal-source").textContent).toBe("source: weekly brief (static)");
  });

  it("renders the explicit empty state when there is no brief", () => {
    render(<SignalTelemetryStrip brief={null} />);
    const empty = screen.getByTestId("hr-empty-state");
    expect(empty.getAttribute("data-zone")).toBe("signals");
    expect(empty.textContent).toContain("no weekly brief on record");
    expect(screen.queryByTestId("hr-signal-tile-mvrv_z")).toBeNull();
  });

  it("labels the stream source when stream signals are provided", () => {
    const streamed = parseBriefSignals(BRIEF).map((s) => ({ ...s, source: "stream" as const }));
    render(<SignalTelemetryStrip brief={null} streamSignals={streamed} streamMode="synthetic" />);
    expect(screen.getByTestId("hr-signal-source").textContent).toBe("source: stream · synthetic");
    expect(screen.getByTestId("hr-signal-tile-mvrv_z")).toBeTruthy();
  });

  it("does not crash on malformed latest_signals and reports tiles missing", () => {
    const malformed = { ...BRIEF, parsed_json: { latest_signals: "not-an-object" } } as HrBrief;
    render(<SignalTelemetryStrip brief={malformed} />);
    const chips = screen.getAllByTestId("hr-status-chip");
    expect(chips.length).toBe(8);
    for (const chip of chips) expect(chip.getAttribute("data-status")).toBe("missing");
  });
});

describe("SignalTelemetryTile", () => {
  it("fires the evidence callback with the signal key", () => {
    const onOpen = vi.fn();
    const signal = parseBriefSignals(BRIEF).find((s) => s.key === "mvrv_z")!;
    render(<SignalTelemetryTile signal={signal} onOpenEvidence={onOpen} />);
    fireEvent.click(screen.getByTestId("hr-signal-tile-mvrv_z"));
    expect(onOpen).toHaveBeenCalledWith("mvrv_z");
  });

  it("shows delta with direction color semantics (sign in text)", () => {
    const signal = parseBriefSignals(BRIEF).find((s) => s.key === "yc_10y2y")!;
    render(<SignalTelemetryTile signal={signal} />);
    expect(screen.getByText("+0.06")).toBeTruthy();
    expect(screen.getByTestId("hr-status-chip").getAttribute("data-status")).toBe("stale");
  });
});
