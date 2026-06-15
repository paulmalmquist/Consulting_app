import { afterEach, describe, expect, it, vi } from "vitest";
import { getEventAnalyticsDashboard } from "@/lib/bos-api";

// The Event Analytics binding is a thin wrapper over bosFetch hitting
// /api/events/v1/analytics/dashboard. These tests assert it returns the typed
// payload on success and surfaces the fail-closed available:false shape.

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getEventAnalyticsDashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the events analytics endpoint and returns the available payload", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return jsonResponse({
          available: true,
          observability_only: true,
          project: "proj",
          analytics_dataset: "winston_events_analytics",
          volume: { raw_rows: 22, deduped_rows: 17, dead_letter_rows: 2, replay_duplicates_collapsed: 5 },
          by_source: [{ source: "backend", event_count: 3 }],
          execution_events_daily: [],
          hr_signal_latest: [{ signal_name: "mvrv_z", signal_value: "1.4",
            staleness_status: "fresh", as_of_date: "2026-06-15", ingested_at: "2026-06-15T00:00:00+00:00" }],
          hr_signal_freshness: [{ staleness_status: "fresh", signal_count: 6 }],
          hr_dead_letters: [],
        });
      })
    );

    const out = await getEventAnalyticsDashboard();

    expect(calls.some((u) => u.includes("/api/events/v1/analytics/dashboard"))).toBe(true);
    expect(out.available).toBe(true);
    expect(out.observability_only).toBe(true);
    expect(out.volume?.replay_duplicates_collapsed).toBe(5);
    expect(out.hr_signal_latest?.[0].signal_name).toBe("mvrv_z");
  });

  it("surfaces the fail-closed available:false payload (BQ unconfigured)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ available: false, reason: "BigQuery analytics is not enabled (BQ_ENABLED is false)." })
      )
    );

    const out = await getEventAnalyticsDashboard();

    expect(out.available).toBe(false);
    expect(out.reason).toMatch(/not enabled/i);
    expect(out.volume).toBeUndefined();
  });
});
