/**
 * Render receipt for the Event Analytics Dashboard page (ADO #622).
 *
 * Renders the real page component in jsdom with getEventAnalyticsDashboard
 * mocked to return the LIVE-PROVEN payload (from get_dashboard() against
 * paultest-d3cb1: available=true, raw=22/deduped=17/dupes=5, 8 sources, exec
 * rows, HR latest signals, dead-letters). This is a render receipt — it proves
 * the page renders every section + the observability-only label + no error
 * state, without booting the DB/auth stack (the /app middleware gate needs a
 * forged session secret we deliberately don't reintroduce for a screenshot).
 *
 * A pixel screenshot via a logged-in browser remains an optional extra; this
 * asserts the actual DOM the user sees.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// The live-proven payload (get_dashboard() against paultest-d3cb1, 2026-06-15).
const PROVEN_PAYLOAD = {
  available: true,
  observability_only: true,
  project: "paultest-d3cb1",
  analytics_dataset: "winston_events_analytics",
  volume: { raw_rows: 22, deduped_rows: 17, dead_letter_rows: 2, replay_duplicates_collapsed: 5 },
  by_source: [
    { source: "hr_signal_ingestion", event_count: 10 },
    { source: "backend", event_count: 3 },
    { source: "sink_worker", event_count: 2 },
    { source: "broker_smoke", event_count: 1 },
    { source: "gke_receipt", event_count: 1 },
  ],
  execution_events_daily: [
    { event_date: "2026-06-10", event_type: "execution.completed", source: "backend", event_count: 3 },
    { event_date: "2026-06-12", event_type: "execution.completed", source: "broker_smoke", event_count: 1 },
  ],
  hr_signal_latest: [
    { signal_name: "mvrv_z", signal_value: "1.4", staleness_status: "fresh", as_of_date: "2026-06-15", ingested_at: "2026-06-15T00:00:00+00:00" },
    { signal_name: "housing", signal_value: '{"price_yoy":-2.1,"starts_yoy":-15.0}', staleness_status: "1d", as_of_date: "2026-06-15", ingested_at: "2026-06-15T00:00:00+00:00" },
    { signal_name: "fed_tone", signal_value: '"hawkish-hold"', staleness_status: "fresh", as_of_date: "2026-06-15", ingested_at: "2026-06-15T00:00:00+00:00" },
  ],
  hr_signal_freshness: [
    { staleness_status: "fresh", signal_count: 6 },
    { staleness_status: "1d", signal_count: 2 },
  ],
  hr_dead_letters: [
    { ingested_at: "2026-06-15T00:00:00+00:00", source: "sink_worker", dead_letter_reason: "missing required fields: ['event_id']", raw_payload: '{"signal_name":"mvrv_z","oops":"not an envelope"}' },
  ],
};

vi.mock("@/lib/bos-api", () => ({
  getEventAnalyticsDashboard: vi.fn(async () => PROVEN_PAYLOAD),
}));

import EventAnalyticsPage from "./page";

describe("Event Analytics Dashboard render (ADO #622 receipt)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the available payload: volume KPIs, all sections, observability label, no error", async () => {
    render(<EventAnalyticsPage />);

    // Title + observability-only label (appears in the badge and the footer copy).
    expect(await screen.findByText("Event Analytics")).toBeInTheDocument();
    expect(screen.getAllByText(/observability only/i).length).toBeGreaterThan(0);

    // Volume KPIs (the headline: raw 22 / deduped 17 / 5 collapsed / 2 dead).
    await waitFor(() => {
      expect(screen.getByText("Deduped events")).toBeInTheDocument();
    });
    expect(screen.getByText("17")).toBeInTheDocument();   // deduped_rows
    expect(screen.getByText("22")).toBeInTheDocument();   // raw_rows
    expect(screen.getByText("Replay dupes collapsed")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();    // replay_duplicates_collapsed

    // Section headers all render.
    expect(screen.getByText("Events by source")).toBeInTheDocument();
    expect(screen.getByText("Execution events (daily)")).toBeInTheDocument();
    expect(screen.getByText(/History Rhymes — latest signal values/)).toBeInTheDocument();
    expect(screen.getByText(/History Rhymes — signal freshness/)).toBeInTheDocument();
    // "Dead letters" appears in both the KPI label and the section header.
    expect(screen.getAllByText(/Dead letters/).length).toBeGreaterThan(0);

    // Real data rows: a source, an HR signal (incl. preserved nested-dict + string), a dead-letter reason.
    expect(screen.getByText("hr_signal_ingestion")).toBeInTheDocument();
    expect(screen.getByText("mvrv_z")).toBeInTheDocument();
    expect(screen.getByText('{"price_yoy":-2.1,"starts_yoy":-15.0}')).toBeInTheDocument();
    expect(screen.getByText('"hawkish-hold"')).toBeInTheDocument();
    expect(screen.getByText(/missing required fields/)).toBeInTheDocument();

    // Project/dataset shown as the observability source (appears in copy + footer).
    expect(screen.getByText("paultest-d3cb1")).toBeInTheDocument();
    expect(screen.getAllByText("winston_events_analytics").length).toBeGreaterThan(0);

    // The fail-closed states must NOT appear when available=true.
    expect(screen.queryByText("Not available")).not.toBeInTheDocument();
  });

  it("renders the fail-closed Not-available state when available=false", async () => {
    const api = await import("@/lib/bos-api");
    (api.getEventAnalyticsDashboard as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      available: false,
      reason: "BigQuery analytics is not enabled (BQ_ENABLED is false).",
    });

    render(<EventAnalyticsPage />);

    expect(await screen.findByText("Not available")).toBeInTheDocument();
    expect(screen.getByText(/not enabled/i)).toBeInTheDocument();
    // No volume KPIs in the unavailable state.
    expect(screen.queryByText("Deduped events")).not.toBeInTheDocument();
  });
});
