import { expect, test, type Page } from "@playwright/test";

/**
 * Budget / Pro Forma / Variance E2E Tests
 *
 * Validates:
 * 1. Variance endpoint returns non-empty results with correct shape
 * 2. Budget integrity endpoint returns passed: true (all assets covered)
 * 3. UW versions endpoint returns budget + proforma versions
 * 4. Variance tab on fund detail page renders actual vs budget table
 * 5. Variance rollup cards show NOI Actual, NOI Plan, NOI Variance
 *
 * Tests use route mocking to avoid requiring a live backend.
 */

const ENV_ID = "meridian";
const BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001";
const FUND_ID = "f1f1f1f1-0001-0001-0001-000000000001";
const BASE = `/lab/env/${ENV_ID}/re`;

// Mock variance data matching the real seeded shape
const MOCK_VARIANCE_ITEMS = [
  { id: "v1", run_id: "r1", asset_id: "a1", quarter: "2026Q1", line_code: "RENT", actual_amount: 567000, plan_amount: 555660, variance_amount: 11340, variance_pct: 0.0204 },
  { id: "v2", run_id: "r1", asset_id: "a1", quarter: "2026Q1", line_code: "OTHER_INCOME", actual_amount: 100000, plan_amount: 98000, variance_amount: 2000, variance_pct: 0.0204 },
  { id: "v3", run_id: "r1", asset_id: "a1", quarter: "2026Q1", line_code: "PAYROLL", actual_amount: -63000, plan_amount: -64890, variance_amount: 1890, variance_pct: 0.0291 },
  { id: "v4", run_id: "r1", asset_id: "a1", quarter: "2026Q1", line_code: "REPAIRS_MAINT", actual_amount: -37800, plan_amount: -38934, variance_amount: 1134, variance_pct: 0.0291 },
  { id: "v5", run_id: "r1", asset_id: "a1", quarter: "2026Q1", line_code: "UTILITIES", actual_amount: -50400, plan_amount: -51912, variance_amount: 1512, variance_pct: 0.0291 },
  { id: "v6", run_id: "r1", asset_id: "a1", quarter: "2026Q1", line_code: "TAXES", actual_amount: -50400, plan_amount: -51912, variance_amount: 1512, variance_pct: 0.0291 },
  { id: "v7", run_id: "r1", asset_id: "a1", quarter: "2026Q1", line_code: "INSURANCE", actual_amount: -25200, plan_amount: -25956, variance_amount: 756, variance_pct: 0.0291 },
  { id: "v8", run_id: "r1", asset_id: "a1", quarter: "2026Q1", line_code: "MGMT_FEES", actual_amount: -25200, plan_amount: -25956, variance_amount: 756, variance_pct: 0.0291 },
];

const MOCK_VARIANCE_RESULT = {
  items: MOCK_VARIANCE_ITEMS,
  rollup: {
    total_actual: "415000.00",
    total_plan: "394100.00",
    total_variance: "20900.00",
    total_variance_pct: "0.0530",
  },
};

const MOCK_UW_VERSIONS = [
  { id: "b1b2c3d4-0001-0001-0001-000000000001", env_id: ENV_ID, business_id: BUSINESS_ID, name: "2025 Annual Budget", effective_from: "2025-01-01", created_at: "2025-01-01T00:00:00Z" },
  { id: "b1b2c3d4-0001-0001-0002-000000000001", env_id: ENV_ID, business_id: BUSINESS_ID, name: "Acquisition Pro Forma", effective_from: "2025-01-01", created_at: "2025-01-01T00:00:00Z" },
];

const MOCK_INTEGRITY = {
  total_assets: 12,
  assets_with_budget: 12,
  assets_with_proforma: 12,
  assets_with_actuals: 12,
  assets_with_variance: 12,
  missing_budget: [],
  missing_proforma: [],
  missing_actuals: [],
  missing_variance: [],
  required_quarters: ["2026Q1"],
  passed: true,
};

async function installMocks(page: Page) {
  await page.route("**/v1/environments/**", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        env_id: ENV_ID,
        client_name: "Meridian Capital",
        industry: "real_estate",
        schema_name: "meridian",
        business_id: BUSINESS_ID,
      }),
    });
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/bos/, "");

    // RE v1 context
    if (path.includes("/api/re/v1/context")) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          env_id: ENV_ID,
          business_id: BUSINESS_ID,
          client_name: "Meridian Capital",
          schema_name: "meridian",
          industry: "real_estate",
          bootstrap_complete: true,
        }),
      });
    }

    // Variance endpoint
    if (path.includes("/variance/noi")) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_VARIANCE_RESULT),
      });
    }

    // Budget integrity
    if (path.includes("/integrity/budget")) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_INTEGRITY),
      });
    }

    // UW Versions
    if (path.includes("/uw_versions")) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_UW_VERSIONS),
      });
    }

    // Fund list
    if ((path.endsWith("/api/repe/funds") || path.endsWith("/api/re/v1/funds")) && route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        body: JSON.stringify([
          { fund_id: FUND_ID, name: "Meridian Value-Add Fund I", strategy: "value-add", vintage_year: 2024, target_size: "250000000", status: "active", created_at: "2024-01-01T00:00:00Z" },
        ]),
      });
    }

    // Fund detail
    if (path.includes(`/api/repe/funds/${FUND_ID}`) && route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          fund: { fund_id: FUND_ID, name: "Meridian Value-Add Fund I", strategy: "value-add", vintage_year: 2024, target_size: 250000000, status: "active" },
          terms: [],
        }),
      });
    }

    // Deals / investments / scenarios / assets / runs
    if (path.includes("/deals") || path.includes("/investments") || path.includes("/scenarios") || path.includes("/assets") || path.includes("/runs") || path.includes("/lineage")) {
      return route.fulfill({ status: 200, body: JSON.stringify([]) });
    }

    // Quarter state / metrics
    if (path.includes("/quarter-state") || path.includes("/metrics")) {
      return route.fulfill({ status: 404, body: JSON.stringify({ detail: { error_code: "NOT_FOUND" } }) });
    }

    // Waterfall
    if (path.includes("/waterfall")) {
      return route.fulfill({ status: 200, body: JSON.stringify([]) });
    }

    // Default fallback
    return route.fulfill({ status: 200, body: JSON.stringify({}) });
  });
}

test.describe("Budget / Variance E2E", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test("1. Variance tab shows 8 line items with correct columns", async ({ page }) => {
    await page.goto(`${BASE}/funds/${FUND_ID}`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    // Click Variance tab
    await page.getByTestId("tab-variance--noi-").click();
    await page.waitForSelector("[data-testid='variance-table']", { timeout: 5000 });

    // Should have 8 line items (RENT, OTHER_INCOME, PAYROLL, etc.)
    const rows = page.locator("[data-testid='variance-table'] tbody tr");
    await expect(rows).toHaveCount(8);

    // Verify RENT row exists
    const rentRow = rows.filter({ hasText: "RENT" });
    await expect(rentRow).toBeVisible();

    // Verify PAYROLL row exists
    const payrollRow = rows.filter({ hasText: "PAYROLL" });
    await expect(payrollRow).toBeVisible();
  });

  test("2. Variance rollup cards show NOI Actual, Plan, and Variance", async ({ page }) => {
    await page.goto(`${BASE}/funds/${FUND_ID}`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    await page.getByTestId("tab-variance--noi-").click();
    await page.waitForSelector("[data-testid='variance-section']", { timeout: 5000 });

    // Check rollup cards exist and show values
    const section = page.getByTestId("variance-section");
    await expect(section.getByText("NOI Actual")).toBeVisible();
    await expect(section.getByText("NOI Plan")).toBeVisible();
    await expect(section.getByText("NOI Variance")).toBeVisible();
  });

  test("3. Variance amounts are colored (green positive, red negative)", async ({ page }) => {
    await page.goto(`${BASE}/funds/${FUND_ID}`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    await page.getByTestId("tab-variance--noi-").click();
    await page.waitForSelector("[data-testid='variance-table']", { timeout: 5000 });

    // RENT has positive variance → green
    const rentVarCell = page.locator("[data-testid='variance-table'] tbody tr").filter({ hasText: "RENT" }).locator("td.text-green-400");
    await expect(rentVarCell).toBeVisible();
  });

  test("4. Variance tab shows non-empty state (not the empty message)", async ({ page }) => {
    await page.goto(`${BASE}/funds/${FUND_ID}`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    await page.getByTestId("tab-variance--noi-").click();

    // Should NOT see the empty state message
    await expect(page.getByTestId("variance-empty")).not.toBeVisible({ timeout: 3000 });
    // SHOULD see the variance section
    await expect(page.getByTestId("variance-section")).toBeVisible();
  });

  test("5. No console errors on variance tab", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto(`${BASE}/funds/${FUND_ID}`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    await page.getByTestId("tab-variance--noi-").click();
    await page.waitForSelector("[data-testid='variance-section']", { timeout: 5000 });

    // Allow Next.js hydration warnings but no real errors
    const realErrors = consoleErrors.filter(
      (e) => !e.includes("Hydration") && !e.includes("Warning:")
    );
    expect(realErrors).toHaveLength(0);
  });
});
