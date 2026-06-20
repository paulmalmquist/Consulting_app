/**
 * Contract test: the ML Algorithm Decision Lab client must call the
 * /api/hr/v1/ml-demo/* routes and never the forbidden /api/historyrhymes/*
 * namespace. Guards against silent frontend↔backend path drift.
 *
 * Lives under src/components/historyrhymes/ so it runs with the standard
 * `npx vitest run src/components/historyrhymes/` verification command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchMlOverview,
  fetchMlDataset,
  fetchMlAlgorithms,
  fetchMlAlgorithm,
  fetchMlCompare,
  fetchCurveballs,
  fetchCloudConfig,
  runMlAlgorithm,
  scenarioQuery,
} from "@/lib/historyrhymes/mlDemo";

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({ ok, status, json: async () => body }));
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

describe("ml-demo client contract", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("fetchMlOverview GETs the overview path", async () => {
    const fn = mockFetch({ title: "x", algorithms: [] });
    await fetchMlOverview();
    expect(calledUrl(fn)).toBe("/api/hr/v1/ml-demo/overview");
  });

  it("fetchMlDataset GETs the dataset path", async () => {
    const fn = mockFetch({ n_rows: 240 });
    await fetchMlDataset();
    expect(calledUrl(fn)).toBe("/api/hr/v1/ml-demo/dataset");
  });

  it("fetchMlAlgorithms GETs the algorithms path (no scenario → no query)", async () => {
    const fn = mockFetch({ algorithms: [] });
    await fetchMlAlgorithms();
    expect(calledUrl(fn)).toBe("/api/hr/v1/ml-demo/algorithms");
  });

  it("fetchMlAlgorithms appends scenario toggles as repeated query params", async () => {
    const fn = mockFetch({ algorithms: [] });
    await fetchMlAlgorithms({ toggles: ["class_imbalance", "cost_of_error"], fn_cost: 20 });
    const url = calledUrl(fn);
    expect(url.startsWith("/api/hr/v1/ml-demo/algorithms?")).toBe(true);
    expect(url).toContain("toggle=class_imbalance");
    expect(url).toContain("toggle=cost_of_error");
    expect(url).toContain("fn_cost=20");
  });

  it("fetchMlAlgorithm encodes the id", async () => {
    const fn = mockFetch({ algorithm_id: "knn" });
    await fetchMlAlgorithm("knn");
    expect(calledUrl(fn)).toBe("/api/hr/v1/ml-demo/algorithms/knn");
  });

  it("fetchMlCompare / fetchCurveballs / fetchCloudConfig hit their paths", async () => {
    const fn1 = mockFetch({ dimensions: [], rows: [] });
    await fetchMlCompare();
    expect(calledUrl(fn1)).toBe("/api/hr/v1/ml-demo/compare");

    const fn2 = mockFetch({ curveballs: [] });
    await fetchCurveballs();
    expect(calledUrl(fn2)).toBe("/api/hr/v1/ml-demo/curveballs");

    const fn3 = mockFetch({ provider: "none" });
    await fetchCloudConfig();
    expect(calledUrl(fn3)).toBe("/api/hr/v1/ml-demo/cloud-config");
  });

  it("runMlAlgorithm POSTs algorithm_id + scenario to /run", async () => {
    const fn = mockFetch({ algorithm_id: "kmeans", status: "ok" });
    await runMlAlgorithm("kmeans", { toggles: ["regime_shift"] });
    expect(calledUrl(fn)).toBe("/api/hr/v1/ml-demo/run");
    expect(calledInit(fn).method).toBe("POST");
    const body = JSON.parse(String(calledInit(fn).body));
    expect(body.algorithm_id).toBe("kmeans");
    expect(body.scenario.toggles).toContain("regime_shift");
  });

  it("never uses the drifted /api/historyrhymes/* namespace", async () => {
    const fn = mockFetch({ algorithms: [] });
    await fetchMlAlgorithms();
    expect(calledUrl(fn)).not.toContain("/api/historyrhymes/");
    expect(calledUrl(fn)).toContain("/api/hr/v1/ml-demo/");
  });

  it("scenarioQuery returns empty string for no toggles", () => {
    expect(scenarioQuery(null)).toBe("");
    expect(scenarioQuery({ toggles: [] })).toBe("");
  });
});
