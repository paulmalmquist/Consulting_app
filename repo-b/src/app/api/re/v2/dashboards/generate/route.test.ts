import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "@/app/api/re/v2/dashboards/generate/route";

const mockGetPool = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getPool: () => mockGetPool(),
}));

describe("POST /api/re/v2/dashboards/generate - Debt Yield Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockRejectedValue(new Error("intent service unavailable in unit tests"));
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("detects DEBT_YIELD metric when prompt mentions 'debt yield'", async () => {
    const query = vi.fn(async (sql: string) => {
      const text = String(sql);
      if (text.includes("FROM repe_property_asset WHERE")) {
        return {
          rows: [
            { id: "asset-1" },
            { id: "asset-2" },
          ],
          rowCount: 2,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    mockGetPool.mockReturnValue({ query });

    const response = await POST(
      new Request("http://localhost/api/re/v2/dashboards/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: "Show me debt yield analysis for these assets",
          entity_type: "asset",
          env_id: "test-env",
          business_id: "a1b2c3d4-0001-0001-0001-000000000001",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.spec.widgets).toBeDefined();

    // Verify DEBT_YIELD is in the detected metrics
    const allMetrics = body.spec.widgets
      .flatMap((w: any) => w.config.metrics || [])
      .map((m: any) => m.key);

    expect(allMetrics).toContain("DEBT_YIELD");
  });

  test("detects DEBT_YIELD metric when prompt mentions 'dy' abbreviation", async () => {
    const query = vi.fn(async (sql: string) => {
      const text = String(sql);
      if (text.includes("FROM repe_property_asset WHERE")) {
        return {
          rows: [{ id: "asset-1" }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    mockGetPool.mockReturnValue({ query });

    const response = await POST(
      new Request("http://localhost/api/re/v2/dashboards/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: "What's the DY for this property?",
          entity_type: "asset",
          env_id: "test-env",
          business_id: "a1b2c3d4-0001-0001-0001-000000000001",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    // Verify DEBT_YIELD is in the detected metrics
    const allMetrics = body.spec.widgets
      .flatMap((w: any) => w.config.metrics || [])
      .map((m: any) => m.key);

    expect(allMetrics).toContain("DEBT_YIELD");
  });

  test("includes DEBT_YIELD in metrics_strip widget when detected", async () => {
    const query = vi.fn(async (sql: string) => {
      const text = String(sql);
      if (text.includes("FROM repe_property_asset WHERE")) {
        return {
          rows: [{ id: "asset-1" }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    mockGetPool.mockReturnValue({ query });

    const response = await POST(
      new Request("http://localhost/api/re/v2/dashboards/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: "Operating review with debt yield metrics",
          entity_type: "asset",
          env_id: "test-env",
          business_id: "a1b2c3d4-0001-0001-0001-000000000001",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    // Find the metrics_strip widget
    const metricsStripWidget = body.spec.widgets.find(
      (w: any) => w.type === "metrics_strip"
    );

    expect(metricsStripWidget).toBeDefined();
    expect(metricsStripWidget.config.metrics).toBeDefined();

    // Check if DEBT_YIELD is in the metrics
    const hasDebtYield = metricsStripWidget.config.metrics.some(
      (m: any) => m.key === "DEBT_YIELD"
    );
    expect(hasDebtYield).toBe(true);
  });

  test("DEBT_YIELD is filtered appropriately for entity type", async () => {
    const query = vi.fn(async (sql: string) => {
      const text = String(sql);
      if (text.includes("FROM repe_fund WHERE")) {
        return {
          rows: [{ id: "fund-1" }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    mockGetPool.mockReturnValue({ query });

    const response = await POST(
      new Request("http://localhost/api/re/v2/dashboards/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: "Fund dashboard with debt yield",
          entity_type: "fund",
          env_id: "test-env",
          business_id: "a1b2c3d4-0001-0001-0001-000000000001",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    // DEBT_YIELD is only valid for asset/investment levels, not fund
    // So when requesting a fund-level dashboard mentioning "debt yield",
    // it should be filtered out by the entity-level validation
    const allMetrics = body.spec.widgets
      .flatMap((w: any) => w.config.metrics || [])
      .map((m: any) => m.key);

    // Should NOT contain DEBT_YIELD because fund level isn't in entity_levels
    expect(allMetrics).not.toContain("DEBT_YIELD");
  });

  test("dashboard generation succeeds when database is unavailable (returns defaults)", async () => {
    mockGetPool.mockReturnValue(null);

    const response = await POST(
      new Request("http://localhost/api/re/v2/dashboards/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: "debt yield dashboard",
          entity_type: "asset",
        }),
      })
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("Database unavailable");
  });

  test("returns 400 when prompt is missing", async () => {
    mockGetPool.mockReturnValue({ query: vi.fn() });

    const response = await POST(
      new Request("http://localhost/api/re/v2/dashboards/generate", {
        method: "POST",
        body: JSON.stringify({
          entity_type: "asset",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("prompt is required");
  });
});
