import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { EpisodesExplorer } from "./EpisodesExplorer";
import type { EpisodesResponse } from "@/lib/historyrhymes/rhymesClient";

const fetchRhymesEpisodes = vi.fn();

vi.mock("@/lib/historyrhymes/rhymesClient", () => ({
  fetchRhymesEpisodes: (...args: unknown[]) => fetchRhymesEpisodes(...args),
  fetchRhymesAlerts: vi.fn(),
  acknowledgeRhymesAlert: vi.fn(),
  postRhymesMatch: vi.fn(),
}));

const EPISODES: EpisodesResponse = {
  count: 3,
  episodes: [
    {
      episode_id: "ep1",
      episode_name: "1995 Soft Landing",
      episode_start_year: 1994,
      episode_end_year: 1996,
      asset_class: "equity",
      is_non_event: false,
      tags: ["soft_landing", "fed_pivot"],
      description: "Fed managed a soft landing amid rate cycle.",
    },
    {
      episode_id: "ep2",
      episode_name: "2008 GFC",
      episode_start_year: 2007,
      episode_end_year: 2009,
      asset_class: "credit",
      is_non_event: false,
      tags: ["crisis", "hoyt_peak"],
      description: null,
    },
    {
      episode_id: "ep3",
      episode_name: "1990s Non-Event",
      episode_start_year: 1993,
      episode_end_year: 1994,
      asset_class: null,
      is_non_event: true,
      tags: [],
      description: "Regime transition that never materialized.",
    },
  ],
};

describe("EpisodesExplorer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders episode rows after successful fetch", async () => {
    fetchRhymesEpisodes.mockResolvedValue(EPISODES);
    render(<EpisodesExplorer />);
    await waitFor(() => expect(screen.getByTestId("hr-episodes-explorer")).toBeTruthy());
    expect(screen.getByTestId("hr-episode-row-ep1")).toBeTruthy();
    expect(screen.getByTestId("hr-episode-row-ep2")).toBeTruthy();
    expect(screen.getByTestId("hr-episode-row-ep3")).toBeTruthy();
  });

  it("shows non-event badge on is_non_event episodes", async () => {
    fetchRhymesEpisodes.mockResolvedValue(EPISODES);
    render(<EpisodesExplorer />);
    await waitFor(() => screen.getByTestId("hr-episode-row-ep3"));
    const row = screen.getByTestId("hr-episode-row-ep3");
    expect(row.textContent).toContain("non-event");
  });

  it("opens evidence drawer when a row is clicked", async () => {
    fetchRhymesEpisodes.mockResolvedValue(EPISODES);
    render(<EpisodesExplorer />);
    await waitFor(() => screen.getByTestId("hr-episode-row-ep1"));
    fireEvent.click(screen.getByTestId("hr-episode-row-ep1"));
    expect(screen.getByTestId("hr-episode-drawer")).toBeTruthy();
    expect(screen.getByTestId("hr-episode-drawer-name").textContent).toBe("1995 Soft Landing");
  });

  it("closes drawer on close button click", async () => {
    fetchRhymesEpisodes.mockResolvedValue(EPISODES);
    render(<EpisodesExplorer />);
    await waitFor(() => screen.getByTestId("hr-episode-row-ep2"));
    fireEvent.click(screen.getByTestId("hr-episode-row-ep2"));
    expect(screen.getByTestId("hr-episode-drawer")).toBeTruthy();
    fireEvent.click(screen.getByTestId("hr-episode-drawer-close"));
    expect(screen.queryByTestId("hr-episode-drawer")).toBeNull();
  });

  it("shows empty state when zero episodes match filters", async () => {
    fetchRhymesEpisodes.mockResolvedValue({ episodes: [], count: 0 });
    render(<EpisodesExplorer />);
    await waitFor(() => screen.getByTestId("hr-empty-state"));
    const empty = screen.getByTestId("hr-empty-state");
    expect(empty.getAttribute("data-zone")).toBe("episodes");
    expect(empty.textContent).toContain("no episodes match the current filters");
  });

  it("renders fail-closed empty state when fetch returns null", async () => {
    fetchRhymesEpisodes.mockResolvedValue(null);
    render(<EpisodesExplorer />);
    await waitFor(() => screen.getByTestId("hr-empty-state"));
    const empty = screen.getByTestId("hr-empty-state");
    expect(empty.getAttribute("data-zone")).toBe("episodes");
    expect(empty.textContent).toContain("episode index unavailable");
  });

  it("passes filter params to fetchRhymesEpisodes", async () => {
    fetchRhymesEpisodes.mockResolvedValue(EPISODES);
    render(<EpisodesExplorer />);
    await waitFor(() => screen.getByTestId("hr-episodes-explorer"));

    fireEvent.click(screen.getByTestId("hr-episodes-filter-non-event"));
    await waitFor(() => expect(fetchRhymesEpisodes).toHaveBeenCalledTimes(2));
    const lastCall = fetchRhymesEpisodes.mock.calls[1][0] as Record<string, unknown>;
    expect(lastCall.is_non_event).toBe(true);
  });

  it("shows count label from API response", async () => {
    fetchRhymesEpisodes.mockResolvedValue(EPISODES);
    render(<EpisodesExplorer />);
    await waitFor(() => screen.getByTestId("hr-episodes-explorer"));
    expect(screen.getByText("3 episodes")).toBeTruthy();
  });
});
