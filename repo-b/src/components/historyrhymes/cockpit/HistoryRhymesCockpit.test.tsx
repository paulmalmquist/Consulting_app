import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HistoryRhymesCockpit from "./HistoryRhymesCockpit";
import type { HrState, HrDecision, HrBrief } from "@/lib/historyrhymes/client";

const fetchHrState = vi.fn();
const fetchLatestDecision = vi.fn();
const fetchLatestBrief = vi.fn();

vi.mock("@/lib/historyrhymes/client", () => ({
  fetchHrState: () => fetchHrState(),
  fetchLatestDecision: () => fetchLatestDecision(),
  fetchLatestBrief: () => fetchLatestBrief(),
}));

const STATE: HrState = {
  latest_brief_id: "b1",
  latest_brief_at: "2026-06-10T08:00:00Z",
  latest_snapshot_id: "s1",
  latest_snapshot_at: "2026-06-11T08:00:00Z",
  latest_decision_id: "d1",
  latest_decision_at: "2026-06-11T09:00:00Z",
  latest_regime: "late_cycle",
  latest_confidence: 0.62,
  worst_input_age_hours: 26.4,
  freshness_verdict: "fresh",
};

const DECISION = {
  decision_id: "d1",
  prediction_date: "2026-06-11T09:00:00Z",
  regime: "late_cycle",
  confidence: 0.62,
  positions: [
    {
      asset: "TLT", direction: "long", size: 0.15, time_horizon_days: 30,
      entry_type: "staggered", key_drivers: ["yield_curve"], top_analog: "1995 soft landing",
      rhyme_score: 0.87, invalidation: "10Y-2Y re-inverts", next_check: "2026-06-15",
    },
  ],
  risk: { gross_exposure: 0.4, net_exposure: 0.2, max_position_size: 0.15, stop_loss_logic: "x", volatility_adjustment: "y" },
  alerts: [],
  execution_tasks: [],
  source_brief_id: "b1",
  source_snapshot_id: "s1",
  source: "daily_decision_job",
  created_at: "2026-06-11T09:00:00Z",
} as HrDecision;

const BRIEF = {
  brief_id: "b1",
  published_at: "2026-06-10T08:00:00Z",
  regime_call: "late_cycle",
  confidence: 0.6,
  freshness_score: 0.9,
  markdown_uri: "/briefs/latest.md",
  parsed_json: {},
  source: "weekly",
  created_at: "2026-06-10T08:00:00Z",
} as HrBrief;

describe("HistoryRhymesCockpit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders regime header, implications, and evidence footer on live data", async () => {
    fetchHrState.mockResolvedValue(STATE);
    fetchLatestDecision.mockResolvedValue(DECISION);
    fetchLatestBrief.mockResolvedValue(BRIEF);
    render(<HistoryRhymesCockpit />);

    await waitFor(() => expect(screen.getByTestId("hr-regime-header")).toBeTruthy());
    expect(screen.getByTestId("hr-cockpit-page")).toBeTruthy();
    expect(screen.getByTestId("hr-implication-card")).toBeTruthy();
    expect(screen.getByText("weekly brief (archive evidence)")).toBeTruthy();
    expect(fetchHrState).toHaveBeenCalledTimes(1);
    expect(fetchLatestDecision).toHaveBeenCalledTimes(1);
    expect(fetchLatestBrief).toHaveBeenCalledTimes(1);
  });

  it("fails closed when everything is null: explicit states, no blank zones, no crash", async () => {
    fetchHrState.mockResolvedValue(null);
    fetchLatestDecision.mockResolvedValue(null);
    fetchLatestBrief.mockResolvedValue(null);
    render(<HistoryRhymesCockpit />);

    await waitFor(() => expect(screen.getByTestId("hr-regime-header")).toBeTruthy());
    expect(screen.getByTestId("hr-regime-value").textContent).toContain("unknown");
    const empty = screen.getByTestId("hr-empty-state");
    expect(empty.getAttribute("data-zone")).toBe("implications");
    expect(empty.textContent).toContain("no decision on record");
    expect(screen.getByText("no weekly brief on record")).toBeTruthy();
    expect(screen.getByText(/state endpoint unreachable/)).toBeTruthy();
  });

  it("honors the rootTestId override used by the /routine alias", async () => {
    fetchHrState.mockResolvedValue(null);
    fetchLatestDecision.mockResolvedValue(null);
    fetchLatestBrief.mockResolvedValue(null);
    render(<HistoryRhymesCockpit rootTestId="hr-routine-page" />);
    await waitFor(() => expect(screen.getByTestId("hr-routine-page")).toBeTruthy());
    expect(screen.queryByTestId("hr-cockpit-page")).toBeNull();
  });

  it("collapses positions beyond the top three into watch/research", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      ...DECISION.positions[0], asset: `A${i}`,
    }));
    fetchHrState.mockResolvedValue(STATE);
    fetchLatestDecision.mockResolvedValue({ ...DECISION, positions: many });
    fetchLatestBrief.mockResolvedValue(BRIEF);
    render(<HistoryRhymesCockpit />);

    await waitFor(() => expect(screen.getAllByTestId("hr-implication-card").length).toBe(5));
    const tiers = screen.getAllByTestId("hr-implication-card").map((c) => c.getAttribute("data-tier"));
    expect(tiers.filter((t) => t === "act").length).toBe(3);
    expect(tiers.filter((t) => t === "watch").length).toBe(2);
    expect(screen.getByText("2 more (watch / research)")).toBeTruthy();
  });
});
