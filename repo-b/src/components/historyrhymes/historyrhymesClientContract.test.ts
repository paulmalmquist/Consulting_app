/**
 * Contract test: the History Rhymes research client must call the SHIPPED,
 * TESTED backend routes (/api/hr/v1/research/*) and preserve the
 * { count, candidates } wrapper. This is the guard against the silent
 * frontend↔backend path/shape drift that 404s only at runtime.
 *
 * Lives under src/components/historyrhymes/ so it runs with the standard
 * `npx vitest run src/components/historyrhymes/` verification command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  postResearchBrief,
  fetchLatestResearchBrief,
  fetchEnhancementCandidates,
  promoteCandidate,
  discardCandidate,
  fetchPlanningMarkdown,
  fetchMorningBook,
} from "@/lib/historyrhymes/client";

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  }));
  // @ts-expect-error - test stub for global fetch
  global.fetch = fn;
  return fn;
}

function calledUrl(fn: ReturnType<typeof vi.fn>): string {
  return String(fn.mock.calls[0][0]);
}
function calledInit(fn: ReturnType<typeof vi.fn>): RequestInit {
  return (fn.mock.calls[0][1] ?? {}) as RequestInit;
}

describe("historyrhymes research client contract", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("postResearchBrief POSTs JSON to /api/hr/v1/research/briefs", async () => {
    const fn = mockFetch({
      brief: { brief_id: "b1" },
      candidates: [],
      warnings: [],
      confidence: 1,
      degraded: false,
    });
    const out = await postResearchBrief({
      brief_date: "2026-05-18",
      week_type: "Week 1",
      pillar_name: "Novel Signals & Data Sources",
      markdown_content: "# x",
    });
    expect(calledUrl(fn)).toBe("/api/hr/v1/research/briefs");
    expect(calledInit(fn).method).toBe("POST");
    expect(out.degraded).toBe(false);
    expect(out.brief.brief_id).toBe("b1");
  });

  it("fetchLatestResearchBrief GETs /api/hr/v1/research/briefs/latest", async () => {
    const fn = mockFetch({ brief_id: "b1", candidate_count: 3 });
    const out = await fetchLatestResearchBrief();
    expect(calledUrl(fn)).toBe("/api/hr/v1/research/briefs/latest");
    expect(out?.candidate_count).toBe(3);
  });

  it("fetchEnhancementCandidates returns the { count, candidates } wrapper, not an array", async () => {
    const fn = mockFetch({
      count: 2,
      candidates: [{ candidate_id: "c1" }, { candidate_id: "c2" }],
    });
    const out = await fetchEnhancementCandidates();
    expect(calledUrl(fn)).toBe(
      "/api/hr/v1/research/enhancement-candidates",
    );
    expect(out).not.toBeNull();
    expect(Array.isArray(out)).toBe(false);
    expect(out?.count).toBe(2);
    expect(out?.candidates).toHaveLength(2);
  });

  it("fetchEnhancementCandidates passes a status filter", async () => {
    const fn = mockFetch({ count: 0, candidates: [] });
    await fetchEnhancementCandidates("promoted");
    expect(calledUrl(fn)).toBe(
      "/api/hr/v1/research/enhancement-candidates?status=promoted",
    );
  });

  it("promote/discard POST to the exact research candidate paths", async () => {
    const fnP = mockFetch({ candidate_id: "c1", title: "t", status: "promoted" });
    await promoteCandidate("c1");
    expect(calledUrl(fnP)).toBe(
      "/api/hr/v1/research/enhancement-candidates/c1/promote",
    );
    expect(calledInit(fnP).method).toBe("POST");

    const fnD = mockFetch({ candidate_id: "c1", title: "t", status: "discarded" });
    await discardCandidate("c1");
    expect(calledUrl(fnD)).toBe(
      "/api/hr/v1/research/enhancement-candidates/c1/discard",
    );
    expect(calledInit(fnD).method).toBe("POST");
  });

  it("fetchPlanningMarkdown GETs the planning-markdown path", async () => {
    const fn = mockFetch({ candidate_id: "c1", planning_markdown: "# Objective" });
    const out = await fetchPlanningMarkdown("c1");
    expect(calledUrl(fn)).toBe(
      "/api/hr/v1/research/enhancement-candidates/c1/planning-markdown",
    );
    expect(out?.planning_markdown).toContain("# Objective");
  });

  it("no research client path uses the drifted /api/historyrhymes/* namespace", async () => {
    const fn = mockFetch({ count: 0, candidates: [] });
    await fetchEnhancementCandidates();
    expect(calledUrl(fn)).not.toContain("/api/historyrhymes/");
    expect(calledUrl(fn)).toContain("/api/hr/v1/research/");
  });

  it("fetchMorningBook GETs /api/hr/v1/research/morning-book", async () => {
    const fn = mockFetch({
      current_regime: "late_cycle",
      what_changed: ["No material regime, confidence, risk, or enhancement changes vs previous brief."],
      confidence: { current: 0.7, previous: 0.7, delta: 0, status: "stable" },
      freshness: { latest_brief_date: "2026-05-18", previous_brief_date: "2026-05-11", status: "fresh" },
      top_risks: [],
      top_new_enhancements: [],
      triage: "Research Only",
      warnings: [],
    });
    const out = await fetchMorningBook();
    expect(calledUrl(fn)).toBe("/api/hr/v1/research/morning-book");
    expect(out?.triage).toBe("Research Only");
  });
});
