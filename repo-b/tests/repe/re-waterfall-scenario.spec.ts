import { expect, test, type Page } from "@playwright/test";

/**
 * Waterfall Scenario E2E Tests
 *
 * Verifies the end-to-end waterfall scenario calculation flow:
 * 1. Waterfall Scenario tab is visible on fund detail page
 * 2. Scenario selector shows available scenarios
 * 3. Scenario run executes and displays results
 * 4. Base vs Scenario comparison table renders
 * 5. Tier allocations table renders
 * 6. Run history updates after execution
 *
 * Tests use route mocking to avoid requiring a live backend.
 */

const ENV_ID = "meridian";
const BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
const FUND_ID = "22222222-2222-2222-2222-222222222222";
const SCENARIO_ID = "44444444-4444-4444-4444-444444444444";
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

    // Fund list (RepeWorkspaceShell calls listReV1Funds)
    if (path.includes("/api/re/v1/funds") && method === "GET" && !path.includes(FUND_ID)) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            fund_id: FUND_ID,
            business_id: BUSINESS_ID,
            name: "Institutional Growth Fund VII",
            strategy: "equity",
            sub_strategy: "value-add",
            vintage_year: 2023,
            target_size: 500000000,
            status: "active",
            created_at: "2023-01-01T00:00:00Z",
          },
        ]),
      });
    }

    // Fund detail (exclude sub-paths like /deals, /scenarios, /investments, etc.)
    if (path.includes(`/api/repe/funds/${FUND_ID}`) && method === "GET" && path.endsWith(FUND_ID)) {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          fund: {
            fund_id: FUND_ID,
            business_id: BUSINESS_ID,
            name: "Institutional Growth Fund VII",
            strategy: "equity",
            sub_strategy: "value-add",
            vintage_year: 2023,
            target_size: 500000000,
            status: "active",
            created_at: "2023-01-01T00:00:00Z",
          },
          terms: [{
            fund_term_id: "t1",
            fund_id: FUND_ID,
            effective_from: "2023-01-01",
            preferred_return_rate: 0.08,
            carry_rate: 0.20,
            waterfall_style: "european",
          }],
        }),
      });
    }

    // Scenarios list
    if (path.includes("/scenarios") && method === "GET") {
      return route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            scenario_id: SCENARIO_ID,
            fund_id: FUND_ID,
            name: "Downside CapRate +75bps",
            scenario_type: "downside",
            is_base: false,
            status: "active",
            created_at: "2023-01-01T00:00:00Z",
          },
          {
            scenario_id: "55555555-5555-5555-5555-555555555555",
            fund_id: FUND_ID,
            name: "Upside NOI Growth +10%",
            scenario_type: "upside",
            is_base: false,
            status: "active",
            created_at: "2023-01-01T00:00:00Z",
          },
        ]),
      });
    }

    // Waterfall scenario runs list
    if (path.includes("/waterfall-scenarios/runs") && method === "GET") {
      return route.fulfill({
        status: 200,
        body: JSON.stringify([]),
      });
    }

    // Waterfall scenario run execution
    if (path.includes("/waterfall-scenarios/run") && method === "POST") {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: "success",
          run_id: "run-001",
          waterfall_run_id: "wf-run-001",
          fund_id: FUND_ID,
          scenario_id: SCENARIO_ID,
          quarter: "2025Q1",
          mode: "shadow",
          overrides: {
            cap_rate_delta_bps: "75",
            noi_stress_pct: "5",
            exit_date_shift_months: 0,
          },
          base: {
            nav: "425000000",
            gross_irr: "0.1245",
            net_irr: "0.0987",
            gross_tvpi: "1.3571",
            net_tvpi: "1.2143",
            dpi: "0.1429",
            rvpi: "1.2143",
          },
          scenario: {
            nav: "371250000",
            gross_irr: "0.0812",
            net_irr: "0.0534",
            gross_tvpi: "1.2036",
            net_tvpi: "1.0643",
            dpi: "0.1429",
            rvpi: "1.0607",
          },
          deltas: {
            nav: "-53750000",
            gross_irr: "-0.0433",
            net_irr: "-0.0453",
            gross_tvpi: "-0.1535",
          },
          carry_estimate: "8250000",
          mgmt_fees: "7500000",
          fund_expenses: "1200000",
          tier_allocations: [
            {
              tier_name: "tier_1_return_of_capital",
              partner_name: "CalPERS LP",
              partner_type: "lp",
              payout_type: "return_of_capital",
              amount: "85000000",
            },
            {
              tier_name: "tier_1_return_of_capital",
              partner_name: "Ontario Teachers LP",
              partner_type: "lp",
              payout_type: "return_of_capital",
              amount: "76500000",
            },
            {
              tier_name: "tier_2_preferred_return",
              partner_name: "CalPERS LP",
              partner_type: "lp",
              payout_type: "preferred_return",
              amount: "20000000",
            },
            {
              tier_name: "tier_3_gp_catch_up",
              partner_name: "Meridian GP",
              partner_type: "gp",
              payout_type: "catch_up",
              amount: "5000000",
            },
            {
              tier_name: "tier_4_carry_split_gp",
              partner_name: "Meridian GP",
              partner_type: "gp",
              payout_type: "carry",
              amount: "3250000",
            },
          ],
          snapshot_id: "1",
        }),
      });
    }

    // Deals / investments
    if (path.includes("/investments") || path.includes("/deals")) {
      return route.fulfill({ status: 200, body: JSON.stringify([]) });
    }

    // Quarter state
    if (path.includes("/quarter-state/")) {
      return route.fulfill({ status: 404, body: JSON.stringify({}) });
    }

    // Default fallback
    return route.fulfill({ status: 200, body: JSON.stringify({}) });
  });
}

test.describe("Waterfall Scenario E2E", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test("1. Waterfall Scenario tab is visible on fund detail page", async ({ page }) => {
    await page.goto(`${BASE}/funds/${FUND_ID}`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    // Check tab exists
    await expect(page.getByTestId("tab-waterfall-scenario")).toBeVisible();
  });

  test("2. Clicking Waterfall Scenario tab shows scenario selector", async ({ page }) => {
    await page.goto(`${BASE}/funds/${FUND_ID}`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    // Click the Waterfall Scenario tab
    await page.getByTestId("tab-waterfall-scenario").click();

    // Should show the scenario run panel
    await page.waitForSelector("text=Waterfall Scenario Run", { timeout: 5000 });
    await expect(page.locator("text=Waterfall Scenario Run")).toBeVisible();

    // Scenario selector should have options
    const select = page.locator("select").first();
    await expect(select).toBeVisible();
    await expect(select.locator("option")).toHaveCount(2); // 2 scenarios
  });

  test("3. Running scenario shows base vs scenario comparison", async ({ page }) => {
    await page.goto(`${BASE}/funds/${FUND_ID}`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    // Go to Waterfall Scenario tab
    await page.getByTestId("tab-waterfall-scenario").click();
    await page.waitForSelector("text=Waterfall Scenario Run", { timeout: 5000 });

    // Click Run button
    const runButton = page.getByRole("button", { name: /Run Scenario Waterfall/i });
    await expect(runButton).toBeVisible();
    await runButton.click();

    // Wait for results
    await page.waitForSelector("text=Base vs Scenario Comparison", { timeout: 10000 });

    // Verify comparison table has expected rows
    const comparisonTable = page.locator("table").first();
    await expect(comparisonTable).toBeVisible();
    await expect(comparisonTable.getByRole("cell", { name: "Gross IRR" })).toBeVisible();
    await expect(comparisonTable.getByRole("cell", { name: "Net IRR" })).toBeVisible();
    await expect(comparisonTable.getByRole("cell", { name: "Gross TVPI" })).toBeVisible();
    await expect(comparisonTable.getByRole("cell", { name: "DPI" })).toBeVisible();
    await expect(comparisonTable.getByRole("cell", { name: "RVPI" })).toBeVisible();
  });

  test("4. Scenario overrides are displayed", async ({ page }) => {
    await page.goto(`${BASE}/funds/${FUND_ID}`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    await page.getByTestId("tab-waterfall-scenario").click();
    await page.waitForSelector("text=Waterfall Scenario Run", { timeout: 5000 });

    await page.getByRole("button", { name: /Run Scenario Waterfall/i }).click();
    await page.waitForSelector("text=Scenario Overrides Applied", { timeout: 10000 });

    await expect(page.locator("text=Cap Rate Delta")).toBeVisible();
    await expect(page.locator("text=NOI Stress")).toBeVisible();
  });

  test("5. Tier allocations table renders with partner data", async ({ page }) => {
    await page.goto(`${BASE}/funds/${FUND_ID}`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    await page.getByTestId("tab-waterfall-scenario").click();
    await page.waitForSelector("text=Waterfall Scenario Run", { timeout: 5000 });

    await page.getByRole("button", { name: /Run Scenario Waterfall/i }).click();
    await page.waitForSelector("text=Waterfall Tier Allocations", { timeout: 10000 });

    // Verify tier allocation table has expected partners and tier types
    await expect(page.locator("text=Waterfall Tier Allocations")).toBeVisible();
    const tierTable = page.locator("table").nth(1);
    await expect(tierTable.getByRole("cell", { name: "CalPERS LP" }).first()).toBeVisible();
    await expect(tierTable.getByRole("cell", { name: "Meridian GP" }).first()).toBeVisible();
    await expect(tierTable.getByRole("cell", { name: "return_of_capital" }).first()).toBeVisible();
    await expect(tierTable.getByRole("cell", { name: "carry", exact: true })).toBeVisible();
  });

  test("6. Debug footer visible with ?debug=1", async ({ page }) => {
    await page.goto(`${BASE}/funds/${FUND_ID}?debug=1`);
    await page.waitForSelector("[data-testid='re-fund-detail']", { timeout: 10000 });

    // Debug footer should be visible
    await expect(page.getByTestId("debug-footer")).toBeVisible();
    await expect(page.getByTestId("debug-footer")).toContainText("envId");
    await expect(page.getByTestId("debug-footer")).toContainText("fundId");
    await expect(page.getByTestId("debug-footer")).toContainText("supabase");
  });
});
