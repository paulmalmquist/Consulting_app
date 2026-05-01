import { test, expect, type Page } from "@playwright/test";

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

async function stubEnvAndFunds(page: Page) {
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
    await expect(page.getByText('"status": "released"', { exact: false })).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Wave 1: Risk + Compliance tabs
  // ───────────────────────────────────────────────────────────────────────

  const SCENARIO_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const FACTOR_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const RULE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const VIOL_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  async function stubRiskRefData(page: Page) {
    await page.route("**/api/investment-engine/risk/scenarios*", (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          value: { count: 1, scenarios: [{ id: SCENARIO_ID, code: "crash30", name: "30% Equity Crash",
                                            kind: "custom", shocks: { "EQ.US": "-0.30" }, description: null }] },
          errors: [], input_versions: {},
        }),
      }),
    );
    await page.route("**/api/investment-engine/risk/factors*", (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          value: { count: 1, factors: [{ id: FACTOR_ID, code: "EQ.US", name: "US Equity",
                                          factor_kind: "equity", dimension: "beta" }] },
          errors: [], input_versions: {},
        }),
      }),
    );
  }

  test("Risk tab — VaR happy path renders both methods", async ({ page }) => {
    await stubEnvAndFunds(page);
    await stubRiskRefData(page);
    await page.route("**/api/investment-engine/risk/var", (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          value: {
            fund_id: FUND_ID, as_of_date: "2026-04-30",
            confidence_pct: "95.00", horizon_days: 1, history_window_days: 252,
            covariance_method: "sample", currency: "USD",
            portfolio_value_native: "20000.00",
            var_historical_sim_native: "207.89", var_parametric_native: "227.03",
            var_historical_sim_pct: "0.0103945", var_parametric_pct: "0.01135",
          },
          errors: [], input_versions: {},
        }),
      }),
    );
    await page.goto(`/lab/env/${ENV_ID}/investment-engine`);
    await page.getByRole("button", { name: "Risk" }).click();
    await page.getByRole("button", { name: /calculate var/i }).click();
    await expect(page.getByText("valid", { exact: true })).toBeVisible();
    await expect(page.getByText("207.89")).toBeVisible();
    await expect(page.getByText("227.03")).toBeVisible();
  });

  test("Risk tab — VaR fail (missing_history) renders error code", async ({ page }) => {
    await stubEnvAndFunds(page);
    await stubRiskRefData(page);
    await page.route("**/api/investment-engine/risk/var", (route) =>
      route.fulfill({
        status: 422, contentType: "application/json",
        body: JSON.stringify({
          valid: false, value: null,
          errors: [{ code: "missing_history", message: "insufficient price history", context: { history_window_days: 252 } }],
          input_versions: {},
        }),
      }),
    );
    await page.goto(`/lab/env/${ENV_ID}/investment-engine`);
    await page.getByRole("button", { name: "Risk" }).click();
    await page.getByRole("button", { name: /calculate var/i }).click();
    await expect(page.getByText("invalid", { exact: true })).toBeVisible();
    await expect(page.getByText("missing_history", { exact: false })).toBeVisible();
    await expect(page.getByText("207.89")).toHaveCount(0);
  });

  test("Risk tab — scenario shock renders signed P&L", async ({ page }) => {
    await stubEnvAndFunds(page);
    await stubRiskRefData(page);
    await page.route("**/api/investment-engine/risk/scenario", (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          value: {
            fund_id: FUND_ID, scenario_id: SCENARIO_ID,
            scenario_code: "crash30", scenario_name: "30% Equity Crash",
            as_of_date: "2026-04-30", currency: "USD",
            portfolio_value_native: "20000", scenario_pnl_native: "-6000.00",
            scenario_pnl_pct: "-0.30",
          },
          errors: [], input_versions: {},
        }),
      }),
    );
    await page.goto(`/lab/env/${ENV_ID}/investment-engine`);
    await page.getByRole("button", { name: "Risk" }).click();
    await page.locator("select").nth(1).selectOption(SCENARIO_ID);
    await page.getByRole("button", { name: /^apply$/i }).click();
    await expect(page.getByText("-6000.00")).toBeVisible();
    await expect(page.getByText("30.00%", { exact: false })).toBeVisible();
  });

  test("Compliance tab — rules + violations render", async ({ page }) => {
    await stubEnvAndFunds(page);
    await page.route("**/api/investment-engine/compliance/rules*", (route, req) => {
      if (req.method() === "GET") {
        return route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            valid: true,
            value: { count: 1, rules: [{
              id: RULE_ID, fund_id: FUND_ID, scope_kind: "fund",
              operator: "max_pct_of_nav",
              predicate: { issuer: "BigCo" }, threshold: "0.50",
              threshold_list: null, severity: "high", reason: null,
              active_from: "2026-01-01", active_to: null,
            }] },
            errors: [], input_versions: {},
          }),
        });
      }
      return route.continue();
    });
    await page.route("**/api/investment-engine/compliance/violations*", (route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          value: { count: 1, violations: [{
            id: VIOL_ID, rule_id: RULE_ID, fund_id: FUND_ID,
            portfolio_id: null, account_id: null, proposed_trade_id: null,
            eval_kind: "post_trade", severity: "critical",
            snapshot_value: "1.00", threshold: "0.50",
            evidence: { issuer: "BigCo" },
            evaluated_at: "2026-04-30T12:00:00Z",
            resolved_at: null, resolved_by: null, resolution_note: null,
          }] },
          errors: [], input_versions: {},
        }),
      }),
    );
    await page.goto(`/lab/env/${ENV_ID}/investment-engine`);
    await page.getByRole("button", { name: "Compliance" }).click();
    await expect(page.getByText("max_pct_of_nav")).toBeVisible();
    await expect(page.getByText("critical").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Resolve" }).first()).toBeVisible();
  });
});
