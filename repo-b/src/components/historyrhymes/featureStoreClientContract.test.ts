/**
 * Contract test: the Feature Foundry client must call /api/hr/v1/ml-demo/features*
 * (single lookup via /features/by-id/{id}) and never the forbidden
 * /api/historyrhymes/* namespace. Guards against silent path drift.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchFeatureOverview,
  fetchFeatureQualityBoard,
  fetchFeaturePipelineMap,
  fetchFeatureImportance,
  fetchFeatureDetail,
} from "@/lib/historyrhymes/featureStore";

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({ ok, status, json: async () => body }));
  // @ts-expect-error - test stub for global fetch
  global.fetch = fn;
  return fn;
}
function calledUrl(fn: ReturnType<typeof vi.fn>): string {
  return String(fn.mock.calls[0][0]);
}

describe("feature-store client contract", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("fetchFeatureOverview GETs /features", async () => {
    const fn = mockFetch({ features: [] });
    await fetchFeatureOverview();
    expect(calledUrl(fn)).toBe("/api/hr/v1/ml-demo/features");
  });

  it("fetchFeatureQualityBoard / pipeline-map / importance hit their static paths", async () => {
    const fn1 = mockFetch({ features: [] });
    await fetchFeatureQualityBoard();
    expect(calledUrl(fn1)).toBe("/api/hr/v1/ml-demo/features/quality-board");

    const fn2 = mockFetch({ nodes: [] });
    await fetchFeaturePipelineMap();
    expect(calledUrl(fn2)).toBe("/api/hr/v1/ml-demo/features/pipeline-map");

    const fn3 = mockFetch({ importance: {} });
    await fetchFeatureImportance();
    expect(calledUrl(fn3)).toBe("/api/hr/v1/ml-demo/features/importance");
  });

  it("fetchFeatureDetail uses /features/by-id/{id} (never a bare dynamic segment)", async () => {
    const fn = mockFetch({ feature_id: "credit_complacency_gap", status: "ok" });
    await fetchFeatureDetail("credit_complacency_gap");
    expect(calledUrl(fn)).toBe("/api/hr/v1/ml-demo/features/by-id/credit_complacency_gap");
  });

  it("never uses the drifted /api/historyrhymes/* namespace", async () => {
    const fn = mockFetch({ features: [] });
    await fetchFeatureOverview();
    expect(calledUrl(fn)).not.toContain("/api/historyrhymes/");
    expect(calledUrl(fn)).toContain("/api/hr/v1/ml-demo/features");
  });
});
