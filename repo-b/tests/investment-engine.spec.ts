import { test, expect } from "@playwright/test";

/**
 * Investment Engine page — Phase 7 acceptance test.
 *
 * Per project_instructions:
 *   - run NAV
 *   - verify output renders
 *   - verify failure case shows correctly
 *
 * Strategy:
 *   - Mock the bos-api proxy responses (no live backend required)
 *   - Stub funds list, NAV calc happy path, NAV calc failure path
 *   - Drive the form through the UI and assert visible state
 */

const ENV_ID = "11111111-1111-4111-8111-111111111111";
const FUND_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ENV_FIXTURE = {
  env_id: ENV_ID,
  client_name: "Investment Engine Test Env",
  industry: "real_estate",
  industry_type: "real_estate",
  schema_name: "env_investment_test",
  is_active: true,
  created_at: "2026-04-30T00:00:00.000Z",
};

const FUNDS_OK = {
  valid: true,
  value: {
    count: 1,
    funds: [{
      id: FUND_ID,
      name: "Test Fund I",
      inception_date: "2026-01-01",
      base_currency: "USD",
      lot_relief_method: "fifo",
      status: "active",
    }],
  },
  errors: [],
  input_versions: {},
};

const NAV_HAPPY = {
  valid: true,
  value: {
    fund_id: FUND_ID,
    as_of_date: "2026-04-30",
    total_assets: "20000.00000000",
    total_liabilities: "250.00000000",
    nav: "19750.00000000",
    currency: "USD",
  },
  errors: [],
  input_versions: { fund: FUND_ID, prices: ["p1"], fx_rates: [] },
};

const NAV_FAIL = {
  valid: false,
  value: null,
  errors: [
    {
      code: "missing_price",
      message: "no price for security",
      context: {
        security_id: "ssss1111-1111-4111-8111-111111111111",
        as_of_date: "2026-04-30",
      },
    },
    {
      code: "missing_fx",
      message: "no fx rate available for translation",
      context: { from_ccy: "EUR", to_ccy: "USD" },
    },
  ],
  input_versions: {},
};

async function stubEnvAndFunds(page) {
  // Environment registry list (used by admin shell)
  await page.route("**/api/lab/env-context/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ENV_FIXTURE) }),
  );
  // Funds list
  await page.route("**/api/investment-engine/funds*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FUNDS_OK) }),
  );
}

test.describe("Investment Engine page", () => {
  test("NAV happy path renders the value and a valid badge", async ({ page }) => {
    await stubEnvAndFunds(page);
    await page.route("**/api/investment-engine/calculate/nav", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(NAV_HAPPY) }),
    );

    await page.goto(`/lab/env/${ENV_ID}/investment-engine`);
    await expect(page.getByRole("heading", { name: "Investment Engine" })).toBeVisible();

    // Fund picker should populate
    await expect(page.locator("select").first()).toContainText("Test Fund I");

    // Run calculation
    await page.getByRole("button", { name: /run calculation/i }).click();

    // Status badge + NAV value visible
    await expect(page.getByText("valid", { exact: true })).toBeVisible();
    await expect(page.getByText("19750.00000000")).toBeVisible();
    await expect(page.getByText("USD", { exact: false })).toBeVisible();

    // Snapshot lifecycle controls show up
    await expect(page.getByRole("button", { name: /produce draft/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^lock$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^release$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /reconstruct/i })).toBeVisible();
  });

  test("NAV failure shows structured errors with codes (no fake numbers)", async ({ page }) => {
    await stubEnvAndFunds(page);
    await page.route("**/api/investment-engine/calculate/nav", (route) =>
      route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify(NAV_FAIL) }),
    );

    await page.goto(`/lab/env/${ENV_ID}/investment-engine`);
    await page.getByRole("button", { name: /run calculation/i }).click();

    // invalid badge appears
    await expect(page.getByText("invalid", { exact: true })).toBeVisible();
    // Both error codes surface
    await expect(page.getByText("missing_price", { exact: false })).toBeVisible();
    await expect(page.getByText("missing_fx", { exact: false })).toBeVisible();
    // No NAV value appears (system rule: surface unavailable, not a placeholder)
    await expect(page.getByText("19750.00000000")).toHaveCount(0);
    // Snapshot lifecycle controls should NOT appear (only on valid result)
    await expect(page.getByRole("button", { name: /produce draft/i })).toHaveCount(0);
  });

  test("Reconciliation tab renders empty-state when no breaks", async ({ page }) => {
    await stubEnvAndFunds(page);
    await page.route("**/api/investment-engine/reconciliation/breaks*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          value: { count: 0, breaks: [] },
          errors: [],
          input_versions: {},
        }),
      }),
    );

    await page.goto(`/lab/env/${ENV_ID}/investment-engine`);
    await page.getByRole("button", { name: "Reconciliation" }).click();
    await expect(page.getByText("No breaks match the current filters.")).toBeVisible();
  });

  test("Audit tab loads timeline and expands JSON diff on click", async ({ page }) => {
    await stubEnvAndFunds(page);
    await page.route("**/api/investment-engine/audit/timeline*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          value: {
            count: 1,
            events: [{
              id: "evt-1",
              entity_type: "inv_nav_snapshot",
              entity_id: "11111111-1111-4111-8111-111111111111",
              change_type: "release",
              previous_state: { status: "locked", version: 1 },
              new_state: { status: "released", version: 1 },
              actor: "ui",
              reason: "period close",
              correlation_id: null,
              created_at: "2026-04-30T12:00:00Z",
            }],
          },
          errors: [],
          input_versions: {},
        }),
      }),
    );

    await page.goto(`/lab/env/${ENV_ID}/investment-engine`);
    await page.getByRole("button", { name: "Audit" }).click();
    await expect(page.getByText("release", { exact: true })).toBeVisible();
    await expect(page.getByText("inv_nav_snapshot")).toBeVisible();

    // Expand the row — JSON diff should render previous + new
    await page.getByRole("button", { name: /release.*inv_nav_snapshot/i }).click();
    await expect(page.getByText('"status": "locked"', { exact: false })).toBeVisible();
    await expect(page.getByText('"status": "released"', { exact: false })).toBeVisible();
  });
});
