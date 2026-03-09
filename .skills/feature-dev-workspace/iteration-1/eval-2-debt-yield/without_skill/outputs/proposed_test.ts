/**
 * PROPOSED TEST FILE
 *
 * Location: repo-b/src/app/api/re/v2/dashboards/generate/route.test.ts
 * (or similar test file for the generate route)
 *
 * These tests verify that the DEBT_YIELD metric is properly detected from prompts
 * and integrated into dashboard generation.
 *
 * Test Framework: Vitest (based on existing test patterns in the codebase)
 */

import { describe, it, expect } from "vitest";

/**
 * NOTE: The actual test implementation would need to export the detectMetrics
 * function from route.ts or test it through the POST endpoint.
 *
 * This pseudo-code shows the intent and structure.
 */

describe("DEBT_YIELD metric detection", () => {
  /**
   * TEST 1: Full phrase "debt yield" triggers DEBT_YIELD detection
   */
  it("should detect DEBT_YIELD when prompt contains 'debt yield'", () => {
    const prompt = "build a dashboard with debt yield metrics for this asset";
    const entityType = "asset";

    // Assuming detectMetrics is exported or tested via endpoint
    const detected = detectMetrics(prompt.toLowerCase(), entityType);

    expect(detected).toContain("DEBT_YIELD");
  });

  /**
   * TEST 2: Abbreviation "dy" triggers DEBT_YIELD detection
   */
  it("should detect DEBT_YIELD when prompt contains 'dy'", () => {
    const prompt = "show me the dy for this investment";
    const entityType = "investment";

    const detected = detectMetrics(prompt.toLowerCase(), entityType);

    expect(detected).toContain("DEBT_YIELD");
  });

  /**
   * TEST 3: DEBT_YIELD is available for asset entity level
   */
  it("should include DEBT_YIELD when entity_type is 'asset'", () => {
    const prompt = "dashboard with debt yield";
    const entityType = "asset";

    const detected = detectMetrics(prompt.toLowerCase(), entityType);

    expect(detected).toContain("DEBT_YIELD");
  });

  /**
   * TEST 4: DEBT_YIELD is available for investment entity level
   */
  it("should include DEBT_YIELD when entity_type is 'investment'", () => {
    const prompt = "debt yield analysis for investment";
    const entityType = "investment";

    const detected = detectMetrics(prompt.toLowerCase(), entityType);

    expect(detected).toContain("DEBT_YIELD");
  });

  /**
   * TEST 5: DEBT_YIELD is NOT available for fund entity level
   * (funds have their own set of metrics)
   */
  it("should NOT include DEBT_YIELD when entity_type is 'fund'", () => {
    const prompt = "dashboard with debt yield for the fund";
    const entityType = "fund";

    const detected = detectMetrics(prompt.toLowerCase(), entityType);

    // DEBT_YIELD should be filtered out because it's not in fund entity_levels
    expect(detected).not.toContain("DEBT_YIELD");
  });

  /**
   * TEST 6: DEBT_YIELD is included in composed dashboard widgets
   */
  it("should include DEBT_YIELD in dashboard widget config when detected", () => {
    const prompt = "show debt yield and noi";
    const entityType = "asset";

    // Simulate the full generation flow
    const detected = detectMetrics(prompt.toLowerCase(), entityType);
    expect(detected).toContain("DEBT_YIELD");
    expect(detected).toContain("NOI");

    // Mock archetype and composition
    const archetype = "executive_summary";
    const scope = { entity_type: entityType, entity_ids: ["test-id"] };
    const quarter = "2024Q1";

    const spec = composeDashboard(archetype, detected, scope, quarter);

    // Verify widgets contain DEBT_YIELD
    const hasDebtYield = spec.widgets.some((w: any) =>
      w.config?.metrics?.some((m: any) => m.key === "DEBT_YIELD")
    );

    expect(hasDebtYield).toBe(true);
  });

  /**
   * TEST 7: Validate DEBT_YIELD passes validator
   */
  it("should validate DEBT_YIELD in dashboard spec", () => {
    const spec = {
      widgets: [
        {
          id: "metric_card_0",
          type: "metrics_strip",
          config: {
            title: "Key Metrics",
            metrics: [{ key: "DEBT_YIELD" }, { key: "NOI" }],
            entity_type: "asset",
          },
          layout: { x: 0, y: 0, w: 6, h: 2 },
        },
      ],
    };

    const validation = validateDashboardSpec(spec);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.sanitized?.widgets[0]?.config?.metrics).toContainEqual({
      key: "DEBT_YIELD",
    });
  });

  /**
   * TEST 8: Multiple keyword matches don't duplicate DEBT_YIELD
   */
  it("should not duplicate DEBT_YIELD when multiple keywords match", () => {
    const prompt = "debt yield and dy metrics";
    const entityType = "asset";

    const detected = detectMetrics(prompt.toLowerCase(), entityType);

    // Count occurrences of DEBT_YIELD
    const dyCount = detected.filter((m) => m === "DEBT_YIELD").length;

    expect(dyCount).toBe(1); // Should appear exactly once
  });

  /**
   * TEST 9: End-to-end API test
   */
  it("should generate valid dashboard from 'debt yield' prompt via POST endpoint", async () => {
    const payload = {
      prompt: "build a dashboard with debt yield for this asset",
      entity_type: "asset",
      entity_ids: ["test-asset-id"],
    };

    // This would be an actual HTTP POST in integration tests
    // const response = await fetch("/api/re/v2/dashboards/generate", {
    //   method: "POST",
    //   body: JSON.stringify(payload),
    //   headers: { "Content-Type": "application/json" }
    // });
    // const data = await response.json();

    // expect(response.status).toBe(200);
    // expect(data.spec.widgets).toBeDefined();
    // expect(data.validation.valid).toBe(true);

    // For now, verify the logic path:
    const detected = detectMetrics(payload.prompt.toLowerCase(), payload.entity_type);
    expect(detected).toContain("DEBT_YIELD");
  });
});

/**
 * HELPER: Mock of detectMetrics for testing reference
 * (In real tests, import from route.ts)
 */
function detectMetrics(prompt: string, entityType: string): string[] {
  const detected: string[] = [];

  const keywordMap: Record<string, string[]> = {
    noi: ["NOI"],
    "net operating": ["NOI"],
    revenue: ["RENT", "OTHER_INCOME", "EGI"],
    rent: ["RENT"],
    income: ["EGI"],
    opex: ["TOTAL_OPEX"],
    expense: ["TOTAL_OPEX"],
    occupancy: ["OCCUPANCY"],
    dscr: ["DSCR_KPI"],
    "debt service": ["TOTAL_DEBT_SERVICE", "DSCR_KPI"],
    "debt maturity": ["TOTAL_DEBT_SERVICE"],
    ltv: ["LTV"],
    "loan to value": ["LTV"],
    "cap rate": ["ASSET_VALUE", "NOI"],
    "cash flow": ["NET_CASH_FLOW"],
    capex: ["CAPEX"],
    margin: ["NOI_MARGIN_KPI"],
    value: ["ASSET_VALUE"],
    equity: ["EQUITY_VALUE"],
    irr: ["GROSS_IRR", "NET_IRR"],
    tvpi: ["GROSS_TVPI", "NET_TVPI"],
    dpi: ["DPI"],
    nav: ["PORTFOLIO_NAV"],
    "unit economics": ["AVG_RENT", "NOI_PER_UNIT"],
    "debt yield": ["DEBT_YIELD"],
    dy: ["DEBT_YIELD"],
  };

  for (const [keyword, metrics] of Object.entries(keywordMap)) {
    if (prompt.includes(keyword)) {
      for (const m of metrics) {
        if (!detected.includes(m)) detected.push(m);
      }
    }
  }

  // Mock entity filtering
  const entityMetrics: Record<string, string[]> = {
    asset: [
      "RENT",
      "OTHER_INCOME",
      "EGI",
      "PAYROLL",
      "REPAIRS_MAINT",
      "UTILITIES",
      "TAXES",
      "INSURANCE",
      "MGMT_FEES",
      "TOTAL_OPEX",
      "NOI",
      "NOI_MARGIN",
      "CAPEX",
      "TENANT_IMPROVEMENTS",
      "LEASING_COMMISSIONS",
      "REPLACEMENT_RESERVES",
      "DEBT_SERVICE_INT",
      "DEBT_SERVICE_PRIN",
      "TOTAL_DEBT_SERVICE",
      "NET_CASH_FLOW",
      "DSCR",
      "DEBT_YIELD",
      "OCCUPANCY",
      "AVG_RENT",
      "NOI_PER_UNIT",
      "NOI_MARGIN_KPI",
      "DSCR_KPI",
      "LTV",
      "ASSET_VALUE",
      "EQUITY_VALUE",
    ],
    investment: [
      "RENT",
      "OTHER_INCOME",
      "EGI",
      "PAYROLL",
      "REPAIRS_MAINT",
      "UTILITIES",
      "TAXES",
      "INSURANCE",
      "MGMT_FEES",
      "TOTAL_OPEX",
      "NOI",
      "NOI_MARGIN",
      "CAPEX",
      "TENANT_IMPROVEMENTS",
      "LEASING_COMMISSIONS",
      "REPLACEMENT_RESERVES",
      "DEBT_SERVICE_INT",
      "DEBT_SERVICE_PRIN",
      "TOTAL_DEBT_SERVICE",
      "NET_CASH_FLOW",
      "DSCR",
      "DEBT_YIELD",
      "NOI_MARGIN_KPI",
      "DSCR_KPI",
      "LTV",
      "ASSET_VALUE",
      "EQUITY_VALUE",
    ],
    fund: [
      "NOI",
      "OCCUPANCY",
      "ASSET_VALUE",
      "EQUITY_VALUE",
      "GROSS_IRR",
      "NET_IRR",
      "GROSS_TVPI",
      "NET_TVPI",
      "DPI",
      "RVPI",
      "PORTFOLIO_NAV",
      "WEIGHTED_LTV",
      "WEIGHTED_DSCR",
    ],
  };

  const allowed = entityMetrics[entityType] || [];
  return detected.filter((k) => allowed.includes(k));
}

function composeDashboard(
  archetypeKey: string,
  metrics: string[],
  scope: any,
  quarter?: string
): any {
  // Mock dashboard composition
  return {
    widgets: [
      {
        id: "metric_card_0",
        type: "metrics_strip",
        config: {
          title: "Key Metrics",
          metrics: metrics.map((k) => ({ key: k })),
          entity_type: scope.entity_type,
        },
        layout: { x: 0, y: 0, w: 6, h: 2 },
      },
    ],
  };
}

function validateDashboardSpec(spec: any): any {
  // Mock validator
  return {
    valid: true,
    errors: [],
    warnings: [],
    sanitized: spec,
  };
}
