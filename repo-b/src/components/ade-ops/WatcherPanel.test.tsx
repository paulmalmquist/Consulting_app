import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { WatcherPanel } from "@/components/ade-ops/WatcherPanel";

vi.mock("@/lib/ade-ops/api", () => ({
  getWatchState: vi.fn(),
}));

import { getWatchState } from "@/lib/ade-ops/api";

const mockWatch = getWatchState as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.restoreAllMocks());

function w(over: Record<string, unknown> = {}) {
  return {
    approval_id: "a1", execution_mode: "nonprod", verdict: "still_observing",
    finding: "window open", recommendation: null, evidence: [], null_reason: null,
    window_open: true, rollback_required: true, ...over,
  };
}

describe("WatcherPanel", () => {
  it("renders the verdicts and distinguishes simulated vs live non-prod", async () => {
    mockWatch.mockResolvedValue({
      watching: [
        w({ approval_id: "a1", execution_mode: "simulation", verdict: "accepted",
            recommendation: "Change accepted. No rollback recommended.",
            evidence: [{ label: "observed", value: 80, source: "bq" }], window_open: false }),
        w({ approval_id: "a2", execution_mode: "nonprod", verdict: "rollback_recommended",
            recommendation: "Rollback RECOMMENDED (artifact only — not executed).",
            evidence: [{ label: "observed", value: 150, source: "bq" }], window_open: false }),
        w({ approval_id: "a3", execution_mode: "nonprod", verdict: "insufficient_evidence",
            null_reason: "no_observation_evidence", evidence: [], window_open: false }),
      ],
      null_reason: null,
    });
    render(<WatcherPanel businessId="b1" envId="e1" />);
    await waitFor(() => expect(screen.getAllByTestId("watch-row")).toHaveLength(3));
    expect(screen.getByText("accepted")).toBeTruthy();
    expect(screen.getByText("rollback recommended")).toBeTruthy();
    expect(screen.getByText("insufficient evidence")).toBeTruthy();
    expect(screen.getByText("Simulated")).toBeTruthy();
    expect(screen.getAllByText("Live · non-prod").length).toBe(2);
    // rollback recommendation is explicitly an artifact, not executed
    expect(screen.getByText(/not executed/)).toBeTruthy();
    // unavailable evidence is surfaced honestly
    expect(screen.getByText("evidence unavailable")).toBeTruthy();
  });

  it("empty + fails closed on read error", async () => {
    mockWatch.mockRejectedValue(new Error("boom"));
    render(<WatcherPanel businessId="b1" />);
    await waitFor(() => expect(screen.getByText(/No executed changes under observation/)).toBeTruthy());
  });
});
