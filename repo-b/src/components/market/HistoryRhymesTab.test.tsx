import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

const fetchRhymesEpisodesMock = vi.fn();

vi.mock("@/lib/trading-lab/rhymes-client", () => ({
  fetchRhymesEpisodes: (...args: unknown[]) => fetchRhymesEpisodesMock(...args),
  RhymesClientError: class extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  },
}));

// Recharts relies on ResizeObserver which jsdom does not provide.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
  ResizeObserverStub;

import { HistoryRhymesTab } from "./HistoryRhymesTab";

describe("HistoryRhymesTab honesty banner", () => {
  beforeEach(() => {
    fetchRhymesEpisodesMock.mockReset();
  });

  test("renders PREVIEW banner on mount before the episodes request settles", async () => {
    fetchRhymesEpisodesMock.mockImplementation(() => new Promise(() => {}));
    render(<HistoryRhymesTab />);
    const banner = await screen.findByTestId("history-rhymes-data-state-banner");
    expect(banner).toHaveAttribute("data-state", "preview");
  });

  test("stays in PREVIEW even after episodes load (subcomponents are still fixture-backed)", async () => {
    fetchRhymesEpisodesMock.mockResolvedValue({
      episodes: Array.from({ length: 8 }, (_, i) => ({ id: `ep-${i}` })),
      count: 8,
    });
    render(<HistoryRhymesTab />);
    const banner = await screen.findByTestId("history-rhymes-data-state-banner");
    await waitFor(() => {
      expect(fetchRhymesEpisodesMock).toHaveBeenCalled();
    });
    // Per plan Loop 1 scope guardrail: banner does NOT promote to "seeded"
    // from HistoryRhymesTab because every other subcomponent still reads
    // hardcoded fixture arrays. Banner stays preview until T2.1 refactors
    // those subcomponents off fixtures. It also must NOT render "live".
    expect(banner).toHaveAttribute("data-state", "preview");
    expect(banner).not.toHaveAttribute("data-state", "live");
  });

  test("surfaces backend error note when the episodes fetch fails", async () => {
    fetchRhymesEpisodesMock.mockRejectedValue(new Error("Request failed (503)"));
    render(<HistoryRhymesTab />);
    const errorNote = await screen.findByTestId("history-rhymes-data-state-error-note");
    expect(errorNote.textContent).toContain("Request failed (503)");
    // Banner remains preview on error — does not flip to live/seeded
    const banner = screen.getByTestId("history-rhymes-data-state-banner");
    expect(banner).toHaveAttribute("data-state", "preview");
  });

  test("banner never renders with state=live from the HistoryRhymesTab fetcher", async () => {
    fetchRhymesEpisodesMock.mockResolvedValue({
      episodes: Array.from({ length: 8 }, (_, i) => ({ id: `ep-${i}` })),
      count: 8,
    });
    render(<HistoryRhymesTab />);
    const banner = await screen.findByTestId("history-rhymes-data-state-banner");
    await waitFor(() => {
      expect(fetchRhymesEpisodesMock).toHaveBeenCalled();
    });
    expect(banner.getAttribute("data-state")).not.toBe("live");
  });
});
