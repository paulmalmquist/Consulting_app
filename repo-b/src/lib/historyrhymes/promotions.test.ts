import { afterEach, describe, expect, it, vi } from "vitest";

import {
  approveCandidate, listCandidates, rejectCandidate,
} from "./promotions";

function mockFetch(impl: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const { status, body } = impl(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });
}

afterEach(() => vi.restoreAllMocks());

describe("promotions client", () => {
  it("calls /api/hr/v1/promotion-candidates, never /api/historyrhymes/*", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", mockFetch((url) => {
      seen.push(url);
      return { status: 200, body: { items: [], count: 0, limit: 50, offset: 0 } };
    }));
    await listCandidates({ approval_status: "needs_review" });
    expect(seen[0]).toContain("/api/hr/v1/promotion-candidates");
    expect(seen[0]).toContain("approval_status=needs_review");
    expect(seen.some((u) => u.includes("/api/historyrhymes/"))).toBe(false);
  });

  it("parses HTTP 409 and preserves exact blocked_reasons (FastAPI detail envelope)", async () => {
    vi.stubGlobal("fetch", mockFetch(() => ({
      status: 409,
      body: { detail: {
        status: "blocked",
        blocked_reasons: ["missing_calibration_evidence", "insufficient_non_event_coverage"],
        candidate_id: "c1", current_status: "needs_review", allowed_actions: ["approved", "rejected"],
      } },
    })));
    const r = await approveCandidate("c1", {});
    expect(r.kind).toBe("blocked");
    if (r.kind === "blocked") {
      expect(r.data.blocked_reasons).toEqual(["missing_calibration_evidence", "insufficient_non_event_coverage"]);
      expect(r.data.current_status).toBe("needs_review");
      // exact reasons, never collapsed to a generic string
      expect(r.data.blocked_reasons).not.toContain("validation_failed");
    }
  });

  it("returns ok envelope on success", async () => {
    vi.stubGlobal("fetch", mockFetch(() => ({
      status: 200, body: { status: "ok", candidate_id: "c1", approval_status: "rejected", candidate: { candidate_id: "c1", approval_status: "rejected" } },
    })));
    const r = await rejectCandidate("c1", { rejection_reason: "no" });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.data.approval_status).toBe("rejected");
  });

  it("reports transport errors without inventing blocked reasons", async () => {
    vi.stubGlobal("fetch", mockFetch(() => ({ status: 500, body: { detail: "boom" } })));
    const r = await approveCandidate("c1", {});
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.httpStatus).toBe(500);
  });

  it("listCandidates degrades to an empty stable envelope on failure", async () => {
    vi.stubGlobal("fetch", mockFetch(() => ({ status: 500, body: {} })));
    const res = await listCandidates();
    expect(res).toEqual({ items: [], count: 0, limit: 50, offset: 0 });
  });
});
