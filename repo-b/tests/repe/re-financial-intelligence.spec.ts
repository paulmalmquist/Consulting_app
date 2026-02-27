import { expect, test, type Page } from "@playwright/test";

/**
 * Financial Intelligence E2E Tests
 *
 * These tests verify the financial intelligence layer:
 * 1. Fund portfolio shows funds with correct strategy
 * 2. Equity fund detail has Variance, Returns, Run Center tabs but NOT Debt Surveillance
 * 3. Debt fund detail has Debt Surveillance tab
 * 4. Run Center shows correct buttons per fund type
 * 5. Navigation correctness
 * 6. Error state for non-existent fund
 *
 * Tests use route mocking to avoid requiring a live backend.
 */

const ENV_ID = "meridian";
const BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
const EQUITY_FUND_ID = "22222222-2222-2222-2222-222222222222";
const DEBT_FUND_ID = "33333333-3333-3333-3333-333333333333";
const BASE = `/lab/env/${ENV_ID}/re`;

async function installMocks(page: Page) {
  // Mock /v1/environments/* proxy route (apiFetch call from ReEnvProvider)
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
    const method = route.request().method();

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

    // List funds (RepeWorkspaceShell calls listReV1Funds → /api/re/v1/funds)
    if ((path.endsWith("/api/repe/funds") || path.endsWith("/api/re/v1/funds")) && method === "GET") {
      return route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            fund_id: EQUITY_FUND_ID,
            business_id: BUSINESS_ID,
            name: "Dallas Multifamily Cluster",
            strategy: "equity",
            sub_strategy: "core-plus",
            vintage_year: 2025,
            target_size: 100000000,
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            fund_id: DEBT_FUND_ID,
            business_id: BUSINESS_ID,
            name: "Meridian Debt Fund II",
            strategy: "debt",
            sub_strategy: "bridge",
            vintage_year: 2025,
            target_size: 50000000,
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
          },
        ]),
      });
    }

    // Get equity fund detail (exclude sub-paths)
    if (path.includes(`/api/repe/funds/${EQUITY_FUND_ID}`) && method === "GET" && path.endsWith(EQUITY_FUND_ID)) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          fund: {
            fund_id: EQUITY_FUND_ID,
            business_id: BUSINESS_ID,
            name: "Dallas Multifamily Cluster",
            strategy: "equity",
            sub_strategy: "core-plus",
            vintage_year: 2025,
            target_size: 100000000,
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
          },
          terms: [{
            fund_term_id: "t1",
            fund_id: EQUITY_FUND_ID,
            effective_from: "2025-01-01",
            preferred_return_rate: 0.08,
            carry_rate: 0.20,
            waterfall_style: "european",
          }],
        }),
      });
    }

    // Get debt fund detail (exclude sub-paths)
    if (path.includes(`/api/repe/funds/${DEBT_FUND_ID}`) && method === "GET" && path.endsWith(DEBT_FUND_ID)) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          fund: {
            fund_id: DEBT_FUND_ID,
            business_id: BUSINESS_ID,
            name: "Meridian Debt Fund II",
            strategy: "debt",
            sub_strategy: "bridge",
            vintage_year: 2025,
            target_size: 50000000,
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
          },
          terms: [],
        }),
      });
    }

    // Non-existent fund
    if (path.includes("/api/repe/funds/00000000-0000-0000-0000-000000000000") && method === "GET") {
      return route.fulfill({
        status: 404,
        body: JSON.stringify({ detail: { error_code: "NOT_FOUND", message: "Fund not found" } }),
      });
    }

    // Deals + Investments
    if (path.includes("/deals") || path.includes("/investments")) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify([]),
      });
    }

    // Scenarios
    if (path.includes("/scenarios")) {
      return route.fulfill({ status: 200, body: JSON.stringify([]) });
    }

    // Quarter state / metrics — 404 (no data yet)
    if (path.includes("/quarter-state/") || (path.includes("/metrics/") && !path.includes("metrics-detail"))) {
      return route.fulfill({
        status: 404,
        body: JSON.stringify({ detail: { error_code: "NOT_FOUND", message: "No state" } }),
      });
    }

    // FI Variance
    if (path.includes("/variance/noi")) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          items: [
            { id: "v1", run_id: "r1", asset_id: "a1", quarter: "2026Q1", line_code: "RENT", actual_amount: 86700, plan_amount: 85000, variance_amount: 1700, variance_pct: 0.02 },
            { id: "v2", run_id: "r1", asset_id: "a1", quarter: "2026Q1", line_code: "PAYROLL", actual_amount: -12600, plan_amount: -12000, variance_amount: -600, variance_pct: -0.05 },
          ],
          rollup: { total_actual: "74100", total_plan: "73000", total_variance: "1100", total_variance_pct: "0.0150" },
        }),
      });
    }

    // FI Fund metrics detail
    if (path.includes("/metrics-detail")) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          metrics: {
            id: "m1", run_id: "r1", fund_id: EQUITY_FUND_ID, quarter: "2026Q1",
            gross_irr: 0.18, net_irr: 0.14, gross_tvpi: 1.18, net_tvpi: 1.14,
            dpi: 0.06, rvpi: 1.12, cash_on_cash: 0.06, gross_net_spread: 0.04,
          },
          bridge: {
            id: "b1", run_id: "r1", fund_id: EQUITY_FUND_ID, quarter: "2026Q1",
            gross_return: 4500000, mgmt_fees: 93750, fund_expenses: 45000, carry_shadow: 560000, net_return: 3801250,
          },
        }),
      });
    }

    // FI Loans
    if (path.includes("/loans") && !path.includes("covenant")) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify([
          { id: "l1", fund_id: DEBT_FUND_ID, loan_name: "Senior Note A", upb: 15000000, rate_type: "floating", rate: 0.065, maturity: "2029-06-30", amort_type: "interest_only", created_at: "2026-01-01T00:00:00Z" },
        ]),
      });
    }

    // FI Covenant results
    if (path.includes("/covenant_results")) {
      return route.fulfill({ status: 200, body: JSON.stringify([]) });
    }

    // FI Watchlist
    if (path.includes("/watchlist")) {
      return route.fulfill({ status: 200, body: JSON.stringify([]) });
    }

    // FI Runs
    if (path.includes("/fi/runs")) {
      return route.fulfill({ status: 200, body: JSON.stringify([]) });
    }

    // UW Versions
    if (path.includes("/uw_versions")) {
      return route.fulfill({ status: 200, body: JSON.stringify([]) });
    }

    // Waterfall runs
    if (path.includes("/waterfall/runs")) {
      return route.fulfill({ status: 200, body: JSON.stringify([]) });
    }

    // Provenance runs
    if (path.includes("/funds/") && path.endsWith("/runs")) {
      return route.fulfill({ status: 200, body: JSON.stringify([]) });
    }

    // Assets
    if (path.includes("/assets")) {
      return route.fulfill({ status: 200, body: JSON.stringify([]) });
    }

    // Default fallback
    return route.fulfill({ status: 200, body: JSON.stringify({}) });
  });
}

test.describe("Financial Intelligence E2E", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test("1. Fund portfolio shows both funds with correct strategy", async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector("[data-testid='repe-sidebar']", { timeout: 10000 });

    // Should see both fund options in the fund selector
    const fundSelect = page.locator("select").first();
    await expect(fundSelect).toBeVisible();
    await expect(fundSelect.locator("option")).toHaveCount(3); // empty + 2 funds
  });

  test("2. Equity fund detail: Variance tab loads non-empty, Returns shows KPIs, no Covenant Tests", async ({ page }) => {
    await page.goto(`${BASE}/funds/${EQUITY_FUND_ID}`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    // Check tabs exist
    await expect(page.getByTestId("fund-tabs")).toBeVisible();
    await expect(page.getByTestId("tab-variance--noi-")).toBeVisible();
    await expect(page.getByTestId("tab-returns--gross-net-")).toBeVisible();
    await expect(page.getByTestId("tab-run-center")).toBeVisible();

    // Debt Surveillance tab should NOT exist for equity fund
    await expect(page.getByTestId("tab-debt-surveillance")).not.toBeVisible();

    // Click Variance tab
    await page.getByTestId("tab-variance--noi-").click();
    await page.waitForSelector("[data-testid='variance-table']", { timeout: 5000 });
    const rows = page.locator("[data-testid='variance-table'] tbody tr");
    await expect(rows).toHaveCount(2);

    // Click Returns tab
    await page.getByTestId("tab-returns--gross-net-").click();
    await page.waitForSelector("[data-testid='returns-kpis']", { timeout: 5000 });
    await expect(page.getByTestId("returns-kpis")).toBeVisible();
    await expect(page.getByTestId("gross-net-bridge")).toBeVisible();

    // Run Center should NOT have covenant tests button
    await page.getByTestId("tab-run-center").click();
    await page.waitForSelector("[data-testid='run-quarter-close']", { timeout: 5000 });
    await expect(page.getByTestId("run-quarter-close")).toBeVisible();
    await expect(page.getByTestId("run-covenant-tests")).not.toBeVisible();
  });

  test("3. Debt fund detail: Debt Surveillance tab exists", async ({ page }) => {
    await page.goto(`${BASE}/funds/${DEBT_FUND_ID}`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    // Debt Surveillance tab should exist
    await expect(page.getByTestId("tab-debt-surveillance")).toBeVisible();

    // Click it
    await page.getByTestId("tab-debt-surveillance").click();
    await page.waitForSelector("[data-testid='debt-surveillance-section']", { timeout: 5000 });
    await expect(page.getByTestId("loans-table")).toBeVisible();
  });

  test("4. Debt fund Run Center shows Covenant Tests button", async ({ page }) => {
    await page.goto(`${BASE}/funds/${DEBT_FUND_ID}`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    await page.getByTestId("tab-run-center").click();
    await page.waitForSelector("[data-testid='run-center-section']", { timeout: 5000 });

    // Should have Covenant Tests button
    await expect(page.getByTestId("run-covenant-tests")).toBeVisible();
    await expect(page.getByTestId("run-quarter-close")).toBeVisible();
  });

  test("5. Nav correctness: sidebar highlights correct item", async ({ page }) => {
    // Investments route
    await page.goto(`${BASE}/deals`);
    await page.waitForSelector("[data-testid='repe-left-nav']", { timeout: 10000 });
    const investmentsLink = page.locator("[data-testid='repe-left-nav'] a", { hasText: "Investments" });
    await expect(investmentsLink).toHaveClass(/border-l-bm-accent/);

    // Funds should NOT be active
    const fundsLink = page.locator("[data-testid='repe-left-nav'] a", { hasText: "Funds" });
    await expect(fundsLink).not.toHaveClass(/border-l-bm-accent/);

    // Assets route
    await page.goto(`${BASE}/assets`);
    await page.waitForSelector("[data-testid='repe-left-nav']", { timeout: 10000 });
    const assetsLink = page.locator("[data-testid='repe-left-nav'] a", { hasText: "Assets" });
    await expect(assetsLink).toHaveClass(/border-l-bm-accent/);

    // Fund detail route highlights Funds
    await page.goto(`${BASE}/funds/${EQUITY_FUND_ID}`);
    await page.waitForSelector("[data-testid='repe-left-nav']", { timeout: 10000 });
    const fundsLinkDetail = page.locator("[data-testid='repe-left-nav'] a", { hasText: "Funds" });
    await expect(fundsLinkDetail).toHaveClass(/border-l-bm-accent/);
  });

  test("6. Non-existent fund shows clean 404", async ({ page }) => {
    await page.goto(`${BASE}/funds/00000000-0000-0000-0000-000000000000`);
    await page.waitForSelector("[data-testid='fund-error']", { timeout: 10000 });
    await expect(page.getByTestId("fund-error")).toContainText("Fund Not Found");
  });
});
