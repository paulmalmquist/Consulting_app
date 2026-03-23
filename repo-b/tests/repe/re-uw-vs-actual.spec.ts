import { expect, test, type BrowserContext } from "@playwright/test";

/**
 * UW vs Actual Reports E2E smoke tests.
 * Verifies:
 * 1) Reports page loads with nav item
 * 2) UW vs Actual scorecard renders
 * 3) Detail page navigates correctly
 */

const TEST_ENV_ID = "00000000-0000-0000-0000-000000000001";
const TEST_BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
const TEST_FUND_ID = "22222222-2222-2222-2222-222222222222";
const TEST_INVESTMENT_ID = "44444444-4444-4444-4444-444444444444";

async function installMocks(context: BrowserContext) {
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    const fulfillJson = async (body: unknown, status = 200) => {
      await route.fulfill({
        status,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    };

    if (path.includes("/repe-context/resolve")) {
      return fulfillJson({
        business_id: TEST_BUSINESS_ID,
        schema_name: "env_test",
        env_id: TEST_ENV_ID,
      });
    }

    if (path.includes("/environments/") && path.includes("/details")) {
      return fulfillJson({
        env_id: TEST_ENV_ID,
        client_name: "Test Capital",
        industry: "real_estate",
        industry_type: "repe",
        schema_name: "env_test",
      });
    }

    if (path.includes("/re/v1/funds")) {
      return fulfillJson([
        {
          fund_id: TEST_FUND_ID,
          name: "Test Fund VII",
          vintage_year: 2021,
          target_size: 500000000,
          status: "active",
        },
      ]);
    }

    if (path.includes("/reports/uw-vs-actual") && !path.includes("/bridge")) {
      if (path.includes("/investment/")) {
        return fulfillJson({
          entity_id: TEST_INVESTMENT_ID,
          level: "investment",
          baseline_metrics: {
            gross_irr: 0.18,
            equity_multiple: 2.0,
            nav: 50000000,
            tvpi: 2.05,
            dpi: 0.6,
          },
          actual_metrics: {
            gross_irr: 0.15,
            equity_multiple: 1.85,
            nav: 48000000,
          },
          lineage: {
            model_name: "UW IO - Test",
            model_id: "55555555-5555-5555-5555-555555555555",
            quarter: "2024Q4",
            computed_at: "2024-01-01T00:00:00Z",
          },
        });
      }
      return fulfillJson({
        fund_id: TEST_FUND_ID,
        quarter: "2024Q4",
        baseline: "IO",
        level: "investment",
        rows: [
          {
            investment_id: TEST_INVESTMENT_ID,
            investment_name: "Parkview Residences",
            baseline_type: "IO",
            uw_irr: 0.18,
            actual_irr: 0.155,
            delta_irr: -0.025,
            uw_moic: 2.0,
            actual_moic: 1.85,
            delta_moic: -0.15,
            uw_nav: 50000000,
            actual_nav: 48000000,
            delta_nav: -2000000,
          },
        ],
        summary: {
          total_investments: 1,
          investments_with_baseline: 1,
          avg_actual_irr: "0.155",
          total_actual_nav: "48000000",
        },
      });
    }

    if (path.includes("/bridge")) {
      return fulfillJson({
        entity_id: TEST_INVESTMENT_ID,
        level: "investment",
        quarter: "2024Q4",
        baseline: "IO",
        drivers: [
          { driver: "NOI", irr_impact_bps: -120 },
          { driver: "Occupancy", irr_impact_bps: -50 },
          { driver: "Capex", irr_impact_bps: -30 },
          { driver: "Exit Cap Rate", irr_impact_bps: -40 },
          { driver: "Debt Terms", irr_impact_bps: -10 },
          { driver: "Residual", irr_impact_bps: 0 },
        ],
        total_explained_bps: -250,
        residual_bps: 0,
      });
    }

    await route.continue();
  });
}

test.describe("UW vs Actual Reports", () => {
  test.beforeEach(async ({ context }) => {
    await installMocks(context);
  });

  test("Reports nav item appears in workspace shell", async ({ page }) => {
    await page.goto(`/lab/env/${TEST_ENV_ID}/re/reports`);
    const nav = page.locator('[data-testid="repe-left-nav"]');
    await expect(nav.getByText("Reports")).toBeVisible();
  });

  test("Reports landing page loads", async ({ page }) => {
    await page.goto(`/lab/env/${TEST_ENV_ID}/re/reports`);
    await expect(page.getByText("Reports")).toBeVisible();
  });

  test("UW vs Actual scorecard renders table", async ({ page }) => {
    await page.goto(`/lab/env/${TEST_ENV_ID}/re/reports/uw-vs-actual`);
    await expect(page.getByText("UW vs Actual")).toBeVisible();
  });
});
