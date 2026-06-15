/**
 * Contract test: the rhymes client must call the SHIPPED backend routes
 * same-origin through the Next proxy (/api/v1/rhymes/*) — deliberately NOT
 * via NEXT_PUBLIC_API_BASE — and fail closed to null on transport errors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postRhymesMatch, fetchRhymesAlerts, acknowledgeRhymesAlert } from "@/lib/historyrhymes/rhymesClient";
import { makeMatch } from "@/lib/historyrhymes/rhymesFixtures";

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({ ok, status, json: async () => body }));
  // @ts-expect-error - test stub for global fetch
  global.fetch = fn;
  return fn;
}

describe("rhymes client contract", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("postRhymesMatch POSTs same-origin to /api/v1/rhymes/match with defaults", async () => {
    const fn = mockFetch(makeMatch());
    const out = await postRhymesMatch();
    const url = String(fn.mock.calls[0][0]);
    expect(url).toBe("/api/v1/rhymes/match"); // same-origin: no API_BASE prefix
    const init = fn.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ scope: "global", k: 5 });
    expect(out?.request_id).toBe("req_abc123def456");
  });

  it("merges caller overrides into the request body", async () => {
    const fn = mockFetch(makeMatch());
    await postRhymesMatch({ k: 3, as_of_date: "2026-06-01" });
    const body = JSON.parse(String((fn.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({ scope: "global", k: 3, as_of_date: "2026-06-01" });
  });

  it("resolves null on 503 (proxy says backend down) — never throws, never fabricates", async () => {
    mockFetch({ error: "upstream unavailable" }, false, 503);
    await expect(postRhymesMatch()).resolves.toBeNull();
  });

  it("resolves null on network failure", async () => {
    // @ts-expect-error - test stub for global fetch
    global.fetch = vi.fn(async () => { throw new Error("network down"); });
    await expect(postRhymesMatch()).resolves.toBeNull();
  });

  it("fetchRhymesAlerts GETs /api/v1/rhymes/alerts with query filters", async () => {
    const fn = mockFetch({ alerts: [], count: 0 });
    const out = await fetchRhymesAlerts({ unacknowledged: true, type: "hoyt_convergence" });
    const url = String(fn.mock.calls[0][0]);
    expect(url).toBe("/api/v1/rhymes/alerts?type=hoyt_convergence&unacknowledged=true");
    expect(out?.count).toBe(0);
  });

  it("acknowledgeRhymesAlert POSTs the audit identity and nulls on 404", async () => {
    const fn = mockFetch({ status: "acknowledged", alert_id: "al-1" });
    const out = await acknowledgeRhymesAlert("al-1", "cockpit");
    expect(String(fn.mock.calls[0][0])).toBe("/api/v1/rhymes/alerts/al-1/acknowledge");
    const body = JSON.parse(String((fn.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({ acknowledged_by: "cockpit" });
    expect(out?.status).toBe("acknowledged");

    mockFetch({ detail: "not found" }, false, 404);
    await expect(acknowledgeRhymesAlert("missing", "cockpit")).resolves.toBeNull();
  });
});
