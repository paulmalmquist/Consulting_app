import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

const fetchCurrentMock = vi.fn();
const fetchHistoryMock = vi.fn();
const fetchEventsMock = vi.fn();

vi.mock("@/lib/trading-lab/dissensus-client", () => ({
  fetchDissensusCurrent: (...args: unknown[]) => fetchCurrentMock(...args),
  fetchDissensusHistory: (...args: unknown[]) => fetchHistoryMock(...args),
  fetchDissensusEvents: (...args: unknown[]) => fetchEventsMock(...args),
}));

// Recharts needs ResizeObserver in jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
  ResizeObserverStub;

import { DissensusPanel } from "./DissensusPanel";

// ── Fixture builders ─────────────────────────────────────────────────────────

function makeCurrent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    state: "ready" as const,
    data: {
      period_ts: "2026-04-17T00:00:00Z",
      composite_D: 1.42,
      z_D: 2.1,
      pct_D: 0.94,
      regime_flag: "elevated",
      ood_flag: false,
      w1_pairwise_mean: 0.4,
      jsd_mean: 0.2,
      directional_disagreement: 0.3,
      z_w1: 1.5,
      z_jsd: 0.8,
      z_dir: 0.4,
      n_eff: 3.7,
      n_agents: 5,
      mean_p_bear: 0.3,
      mean_p_base: 0.4,
      mean_p_bull: 0.3,
      frac_bullish: 0.4,
      max_pairwise_rho: 0.25,
      ci_width_base: 0.2,
      ci_width_adjusted: 0.28,
      alpha_adjusted: 0.1,
      warmup_progress: null,
      ...overrides,
    },
  };
}

function emptyHistory() {
  return { state: "empty" as const };
}
function emptyEvents() {
  return { state: "empty" as const };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("DissensusPanel", () => {
  beforeEach(() => {
    fetchCurrentMock.mockReset();
    fetchHistoryMock.mockReset();
    fetchEventsMock.mockReset();
  });

  test("renders skeleton while loading", () => {
    fetchCurrentMock.mockImplementation(() => new Promise(() => {}));
    fetchHistoryMock.mockImplementation(() => new Promise(() => {}));
    fetchEventsMock.mockImplementation(() => new Promise(() => {}));
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    expect(screen.getByTestId("dissensus-skeleton")).toBeInTheDocument();
  });

  test("renders warmup card with correct n_logged/n_needed on 404", async () => {
    fetchCurrentMock.mockResolvedValue({ state: "warmup", n_logged: 7, n_needed: 20 });
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    const card = await screen.findByTestId("dissensus-warmup");
    expect(card.textContent).toContain(
      "Dissensus signal is warming up. 7 forecasts logged, 20 needed.",
    );
  });

  test("renders OOD banner only when ood_flag is true", async () => {
    fetchCurrentMock.mockResolvedValue(makeCurrent({ ood_flag: true }));
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    expect(await screen.findByTestId("dissensus-ood-banner")).toBeInTheDocument();
  });

  test("does not render OOD banner when ood_flag is false", async () => {
    fetchCurrentMock.mockResolvedValue(makeCurrent({ ood_flag: false }));
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    await screen.findByTestId("dissensus-panel");
    expect(screen.queryByTestId("dissensus-ood-banner")).not.toBeInTheDocument();
  });

  test("suspicious-consensus banner renders when regime_flag matches", async () => {
    fetchCurrentMock.mockResolvedValue(makeCurrent({ regime_flag: "suspicious_consensus" }));
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    expect(await screen.findByTestId("dissensus-suspicious-banner")).toBeInTheDocument();
  });

  test("suspicious-consensus banner renders when z_D < -1 AND n_eff < 3 (UI inference)", async () => {
    fetchCurrentMock.mockResolvedValue(
      makeCurrent({ regime_flag: "normal", z_D: -1.5, n_eff: 2.0 }),
    );
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    expect(await screen.findByTestId("dissensus-suspicious-banner")).toBeInTheDocument();
  });

  test("suspicious-consensus banner does not render for healthy low-z_D with adequate n_eff", async () => {
    fetchCurrentMock.mockResolvedValue(
      makeCurrent({ regime_flag: "normal", z_D: -1.5, n_eff: 4.2 }),
    );
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    await screen.findByTestId("dissensus-panel");
    expect(screen.queryByTestId("dissensus-suspicious-banner")).not.toBeInTheDocument();
  });

  test("diversity panel renders red tone when n_eff < 2.5", async () => {
    fetchCurrentMock.mockResolvedValue(makeCurrent({ n_eff: 2.1 }));
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    const nEff = await screen.findByTestId("dissensus-n-eff");
    expect(nEff.className).toContain("text-bm-danger");
  });

  test("diversity panel renders amber tone when n_eff is between 2.5 and 3.5", async () => {
    fetchCurrentMock.mockResolvedValue(makeCurrent({ n_eff: 3.0 }));
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    const nEff = await screen.findByTestId("dissensus-n-eff");
    expect(nEff.className).toContain("text-bm-warning");
  });

  test("diversity panel renders green tone when n_eff > 3.5", async () => {
    fetchCurrentMock.mockResolvedValue(makeCurrent({ n_eff: 4.2 }));
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    const nEff = await screen.findByTestId("dissensus-n-eff");
    expect(nEff.className).toContain("text-bm-success");
  });

  test("agent-direction panel shows 50/50 highlight when within ±10% of 50/50", async () => {
    fetchCurrentMock.mockResolvedValue(makeCurrent({ frac_bullish: 0.52 }));
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    expect(await screen.findByTestId("dissensus-direction-5050")).toBeInTheDocument();
  });

  test("agent-direction panel does not show 50/50 highlight outside the band", async () => {
    fetchCurrentMock.mockResolvedValue(makeCurrent({ frac_bullish: 0.72 }));
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    await screen.findByTestId("dissensus-direction");
    expect(screen.queryByTestId("dissensus-direction-5050")).not.toBeInTheDocument();
  });

  test("events log shows 'No recent alerts' when events are empty", async () => {
    fetchCurrentMock.mockResolvedValue(makeCurrent());
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    const empty = await screen.findByTestId("dissensus-events-empty");
    expect(empty.textContent).toContain("No recent alerts");
  });

  test("refetches when symbol or horizon props change", async () => {
    fetchCurrentMock.mockResolvedValue(makeCurrent());
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    const { rerender } = render(<DissensusPanel symbol="SPX" horizon="1m" />);
    await waitFor(() => expect(fetchCurrentMock).toHaveBeenCalledTimes(1));
    rerender(<DissensusPanel symbol="NDX" horizon="3m" />);
    await waitFor(() => expect(fetchCurrentMock).toHaveBeenCalledTimes(2));
    // Verify the second call carried through new args
    const lastCall = fetchCurrentMock.mock.calls[1][0] as { symbol: string; horizon: string };
    expect(lastCall.symbol).toBe("NDX");
    expect(lastCall.horizon).toBe("3m");
  });

  test("current=error renders error banner regardless of history/events", async () => {
    fetchCurrentMock.mockResolvedValue({ state: "error", message: "Request failed (503)" });
    fetchHistoryMock.mockResolvedValue(emptyHistory());
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    const err = await screen.findByTestId("dissensus-error");
    expect(err.textContent).toContain("Request failed (503)");
  });

  test("current=warmup suppresses history/events rendering", async () => {
    fetchCurrentMock.mockResolvedValue({ state: "warmup", n_logged: 3, n_needed: 20 });
    // Even if history returns a full series, warmup takes precedence
    fetchHistoryMock.mockResolvedValue({
      state: "ready",
      series: [
        {
          period_ts: "2026-04-10T00:00:00Z",
          composite_D: 0.5,
          pct_D: 0.7,
          regime_flag: "normal",
          ood_flag: false,
        },
      ],
    });
    fetchEventsMock.mockResolvedValue(emptyEvents());
    render(<DissensusPanel symbol="SPX" horizon="1m" />);
    await screen.findByTestId("dissensus-warmup");
    expect(screen.queryByTestId("dissensus-row1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dissensus-sparkline")).not.toBeInTheDocument();
  });
});
