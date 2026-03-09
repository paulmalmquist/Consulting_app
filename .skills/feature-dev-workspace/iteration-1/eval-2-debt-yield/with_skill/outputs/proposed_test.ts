/**
 * Proposed unit tests for debt yield metric detection
 *
 * File location: /repo-b/src/app/api/re/v2/dashboards/generate/route.test.ts
 *
 * These tests verify that:
 * 1. Prompts mentioning "debt yield" detect the DEBT_YIELD metric
 * 2. Prompts mentioning "dy" detect the DEBT_YIELD metric
 * 3. Detected DEBT_YIELD is included in the generated dashboard spec
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/re/v2/dashboards/generate/route";

/**
 * Mock the database pool — dashboard generation doesn't need actual DB for metric detection,
 * but the route requires a pool to exist.
 */
const mockGetPool = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getPool: () => mockGetPool(),
}));

describe("POST /api/re/v2/dashboards/generate — Debt Yield Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Return a minimal mock pool that handles entity lookup queries
    mockGetPool.mockReturnValue({
      query: vi.fn().mockResolvedValue({
        rows: [{ id: "asset-1", name: "Test Asset" }],
      }),
    });
  });

  /**
   * Test 1: Prompt with "debt yield" detects DEBT_YIELD metric
   *
   * This test verifies that when a user includes the phrase "debt yield" in their prompt,
   * the dashboard generator detects and includes the DEBT_YIELD metric in the response.
   */
  it("detects DEBT_YIELD metric when prompt contains 'debt yield'", async () => {
    const requestBody = {
      prompt: "build a dashboard with debt yield for this asset",
      entity_type: "asset",
      entity_ids: ["asset-1"],
      env_id: "env-1",
      business_id: "biz-1",
    };

    const request = new Request("http://localhost/api/re/v2/dashboards/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    // Assertions
    expect(response.status).toBe(200);
    expect(data.spec).toBeDefined();
    expect(data.spec.widgets).toBeDefined();
    expect(Array.isArray(data.spec.widgets)).toBe(true);
    expect(data.spec.widgets.length).toBeGreaterThan(0);

    // Check that at least one widget contains DEBT_YIELD metric
    const hasDEBT_YIELD = data.spec.widgets.some((widget: any) =>
      Array.isArray(widget.config.metrics) &&
      widget.config.metrics.some((m: any) => m.key === "DEBT_YIELD"),
    );

    expect(hasDEBT_YIELD).toBe(true);
    expect(data.validation.valid).toBe(true);
  });

  /**
   * Test 2: Prompt with "dy" detects DEBT_YIELD metric
   *
   * This test verifies that the short form "dy" is recognized as an alias for debt yield.
   */
  it("detects DEBT_YIELD metric when prompt contains 'dy'", async () => {
    const requestBody = {
      prompt: "show me dy for these assets",
      entity_type: "asset",
      entity_ids: ["asset-1"],
      env_id: "env-1",
      business_id: "biz-1",
    };

    const request = new Request("http://localhost/api/re/v2/dashboards/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    // Assertions
    expect(response.status).toBe(200);
    expect(data.spec.widgets.length).toBeGreaterThan(0);

    const hasDEBT_YIELD = data.spec.widgets.some((widget: any) =>
      Array.isArray(widget.config.metrics) &&
      widget.config.metrics.some((m: any) => m.key === "DEBT_YIELD"),
    );

    expect(hasDEBT_YIELD).toBe(true);
    expect(data.validation.valid).toBe(true);
  });

  /**
   * Test 3: "debt yield" detection respects entity level filtering
   *
   * DEBT_YIELD is valid for asset and investment levels but not for fund.
   * For fund-level dashboards, DEBT_YIELD should be filtered out.
   */
  it("filters DEBT_YIELD for fund entity type (not in entity_levels)", async () => {
    const requestBody = {
      prompt: "show debt yield for the fund",
      entity_type: "fund",
      entity_ids: ["fund-1"],
      env_id: "env-1",
      business_id: "biz-1",
    };

    const request = new Request("http://localhost/api/re/v2/dashboards/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);

    // DEBT_YIELD should NOT appear in any widget for a fund-level dashboard
    const hasDEBT_YIELD = data.spec.widgets.some((widget: any) =>
      Array.isArray(widget.config.metrics) &&
      widget.config.metrics.some((m: any) => m.key === "DEBT_YIELD"),
    );

    expect(hasDEBT_YIELD).toBe(false);

    // But the dashboard should still be valid with default fund metrics
    expect(data.validation.valid).toBe(true);
    expect(data.spec.widgets.length).toBeGreaterThan(0);
  });

  /**
   * Test 4: Multiple metric detection with debt yield
   *
   * When a prompt includes multiple keywords like "debt yield and dscr",
   * both metrics should be detected and included.
   */
  it("detects multiple metrics including debt yield when present in prompt", async () => {
    const requestBody = {
      prompt: "dashboard comparing debt yield and dscr coverage",
      entity_type: "asset",
      entity_ids: ["asset-1"],
      env_id: "env-1",
      business_id: "biz-1",
    };

    const request = new Request("http://localhost/api/re/v2/dashboards/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);

    // Collect all metrics from all widgets
    const allMetrics = new Set<string>();
    data.spec.widgets.forEach((widget: any) => {
      if (Array.isArray(widget.config.metrics)) {
        widget.config.metrics.forEach((m: any) => {
          if (m.key) allMetrics.add(m.key);
        });
      }
    });

    // Both DEBT_YIELD and DSCR_KPI should be present
    expect(allMetrics.has("DEBT_YIELD")).toBe(true);
    expect(allMetrics.has("DSCR_KPI")).toBe(true);
    expect(data.validation.valid).toBe(true);
  });

  /**
   * Test 5: Dashboard response includes validation success
   *
   * The response validator should approve DEBT_YIELD as it's in METRIC_CATALOG.
   */
  it("returns validation.valid = true when debt yield is in the spec", async () => {
    const requestBody = {
      prompt: "dy dashboard",
      entity_type: "asset",
      entity_ids: ["asset-1"],
      env_id: "env-1",
      business_id: "biz-1",
    };

    const request = new Request("http://localhost/api/re/v2/dashboards/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.validation).toBeDefined();
    expect(data.validation.valid).toBe(true);
    expect(data.validation.warnings).toBeDefined();
    expect(Array.isArray(data.validation.warnings)).toBe(true);

    // There should be no errors complaining about unapproved metrics
    if (Array.isArray(data.validation.warnings)) {
      const hasInvalidMetricWarning = data.validation.warnings.some((w: string) =>
        w.includes("unapproved metrics"),
      );
      expect(hasInvalidMetricWarning).toBe(false);
    }
  });

  /**
   * Test 6: "dy" and "debt yield" are equivalent
   *
   * Both keywords should produce the same set of detected metrics.
   */
  it("treats 'dy' and 'debt yield' as equivalent keywords", async () => {
    const prompt1 = "dashboard with debt yield";
    const prompt2 = "dashboard with dy";

    const makeRequest = async (prompt: string) => {
      const request = new Request("http://localhost/api/re/v2/dashboards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          entity_type: "asset",
          entity_ids: ["asset-1"],
          env_id: "env-1",
          business_id: "biz-1",
        }),
      });
      return POST(request);
    };

    const response1 = await makeRequest(prompt1);
    const response2 = await makeRequest(prompt2);

    const data1 = await response1.json();
    const data2 = await response2.json();

    // Both should have valid specs
    expect(data1.validation.valid).toBe(true);
    expect(data2.validation.valid).toBe(true);

    // Both should include DEBT_YIELD
    const hasDY1 = data1.spec.widgets.some((w: any) =>
      Array.isArray(w.config.metrics) && w.config.metrics.some((m: any) => m.key === "DEBT_YIELD"),
    );
    const hasDY2 = data2.spec.widgets.some((w: any) =>
      Array.isArray(w.config.metrics) && w.config.metrics.some((m: any) => m.key === "DEBT_YIELD"),
    );

    expect(hasDY1).toBe(true);
    expect(hasDY2).toBe(true);
  });

  /**
   * Test 7: Case insensitivity
   *
   * The detection should work regardless of case ("DEBT YIELD", "Debt Yield", etc.)
   * because the route converts prompt to lowercase at line 28.
   */
  it("detects debt yield keywords case-insensitively", async () => {
    const testCases = [
      "DEBT YIELD dashboard",
      "Debt Yield analysis",
      "DY vs LTV comparison",
      "show me DEBT YIELD and NOI",
    ];

    for (const prompt of testCases) {
      const request = new Request("http://localhost/api/re/v2/dashboards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          entity_type: "asset",
          entity_ids: ["asset-1"],
          env_id: "env-1",
          business_id: "biz-1",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      const hasDEBT_YIELD = data.spec.widgets.some((w: any) =>
        Array.isArray(w.config.metrics) && w.config.metrics.some((m: any) => m.key === "DEBT_YIELD"),
      );
      expect(hasDEBT_YIELD).toBe(true);
    }
  });
});

/**
 * Summary of test coverage:
 *
 * ✓ Test 1: Full phrase "debt yield" is detected
 * ✓ Test 2: Short form "dy" is detected
 * ✓ Test 3: Entity level filtering works (fund exclusion)
 * ✓ Test 4: Multiple metric detection includes DEBT_YIELD when present
 * ✓ Test 5: Validation passes for DEBT_YIELD
 * ✓ Test 6: "dy" and "debt yield" are equivalent
 * ✓ Test 7: Case insensitivity works
 *
 * Running these tests:
 * ```bash
 * cd /repo-b
 * npm test -- src/app/api/re/v2/dashboards/generate/route.test.ts
 * ```
 *
 * Or as part of the full suite:
 * ```bash
 * make test-frontend
 * ```
 */
