import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Model > Scenario > Version Spine Tests
 *
 * 1. Model CRUD API works (via direct request)
 * 2. Version creation and locking works
 * 3. Investment cockpit shows Model/Scenario/Version selectors
 * 4. Scenario context persists across investment → asset drilldown
 *
 * Uses mock routes (no real DB) for browser tests.
 */

const ENV_ID = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const FUND_ID = "f0000001-0000-4000-8000-000000000001";
const DEAL_ID = "d0000001-0000-4000-8000-000000000001";
const MODEL_ID = "m0000001-0000-4000-8000-000000000001";
const SCENARIO_ID = "s0000001-0000-4000-8000-000000000001";
const VERSION_ID = "v0000001-0000-4000-8000-000000000001";
const ASSET_ID = "a0000001-0000-4000-8000-000000000001";

function makeModelsResponse() {
  return [
    {
      model_id: MODEL_ID,
      fund_id: FUND_ID,
      name: "Default Model",
      description: "Auto-generated",
      status: "approved",
      created_at: "2026-01-01T00:00:00",
    },
  ];
}

function makeScenariosResponse() {
  return [
    {
      scenario_id: SCENARIO_ID,
      fund_id: FUND_ID,
      model_id: MODEL_ID,
      name: "Base Case",
      scenario_type: "base",
      is_base: true,
      status: "active",
      created_at: "2026-01-01T00:00:00",
    },
  ];
}

function makeVersionsResponse() {
  return [
    {
      version_id: VERSION_ID,
      scenario_id: SCENARIO_ID,
      model_id: MODEL_ID,
      version_number: 1,
      label: "Initial Version",
      is_locked: false,
      created_at: "2026-01-01T00:00:00",
    },
  ];
}

function makeInvestmentResponse() {
  return {
    investment_id: DEAL_ID,
    fund_id: FUND_ID,
    name: "Metro Office Portfolio",
    investment_type: "equity",
    stage: "operating",
    sponsor: "Blackstone",
    committed_capital: 50000000,
    invested_capital: 45000000,
    target_close_date: "2024-06-15",
    created_at: "2024-01-01T00:00:00",
  };
}

function makeAssetsResponse() {
  return [
    {
      asset_id: ASSET_ID,
      deal_id: DEAL_ID,
      asset_type: "property",
      property_type: "Office",
      name: "The Meridian Tower",
      noi: 2500000,
      asset_value: 45000000,
      nav: 22000000,
      debt_balance: 23000000,
    },
  ];
}

async function installSpineMocks(context: BrowserContext) {
  await context.route("**/v1/environments/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        env_id: ENV_ID,
        client_name: "Test Corp",
        industry: "real_estate",
        is_active: true,
        status: "active",
        business_id: BUSINESS_ID,
      }),
    });
  });

  await context.route("**/api/re/v1/context**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        env_id: ENV_ID,
        business_id: BUSINESS_ID,
        is_bootstrapped: true,
        funds_count: 1,
        scenarios_count: 1,
      }),
    });
  });

  await context.route("**/api/re/v1/context/bootstrap**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        env_id: ENV_ID,
        business_id: BUSINESS_ID,
        ok: true,
      }),
    });
  });

  await context.route("**/api/re/v1/funds**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        {
          fund_id: FUND_ID,
          business_id: BUSINESS_ID,
          name: "Growth Fund VII",
          vintage_year: 2024,
          strategy: "value-add",
          status: "investing",
          created_at: "2024-01-01",
        },
      ]),
    });
  });

  // Investment detail
  await context.route(
    `**/api/re/v2/investments/${DEAL_ID}`,
    async (route) => {
      if (route.request().url().includes("/assets/")) return route.continue();
      if (route.request().url().includes("/quarter-state/"))
        return route.continue();
      if (route.request().url().includes("/lineage/"))
        return route.continue();
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeInvestmentResponse()),
      });
    },
  );

  // JVs
  await context.route(
    `**/api/re/v2/investments/${DEAL_ID}/jvs`,
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify([]),
      });
    },
  );

  // Investment quarter state
  await context.route(
    `**/api/re/v2/investments/${DEAL_ID}/quarter-state/**`,
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "iqs-1",
          investment_id: DEAL_ID,
          quarter: "2026Q1",
          nav: 22000000,
          gross_asset_value: 45000000,
          debt_balance: 23000000,
          net_irr: 0.15,
          gross_irr: 0.18,
          equity_multiple: 1.85,
          fund_nav_contribution: 22000000,
          inputs_hash: "abc123",
          created_at: "2026-01-15",
        }),
      });
    },
  );

  // Investment assets
  await context.route(
    `**/api/re/v2/investments/${DEAL_ID}/assets/**`,
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeAssetsResponse()),
      });
    },
  );

  // Investment lineage
  await context.route(
    `**/api/re/v2/investments/${DEAL_ID}/lineage/**`,
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ widgets: [], issues: [] }),
      });
    },
  );

  // Fund detail
  await context.route(`**/api/repe/funds/${FUND_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fund: {
          fund_id: FUND_ID,
          name: "Growth Fund VII",
        },
        terms: null,
      }),
    });
  });

  // Models list
  await context.route(
    `**/api/re/v2/funds/${FUND_ID}/models`,
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeModelsResponse()),
      });
    },
  );

  // Scenarios list
  await context.route(
    `**/api/re/v2/funds/${FUND_ID}/scenarios`,
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeScenariosResponse()),
      });
    },
  );

  // Versions list
  await context.route(
    `**/api/re/v2/scenarios/${SCENARIO_ID}/versions`,
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeVersionsResponse()),
      });
    },
  );

  // Businesses
  await context.route("**/api/businesses/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([]),
    });
  });
}

async function seedAuth(
  context: BrowserContext,
  baseURL: string | undefined,
) {
  if (!baseURL) throw new Error("baseURL missing");
  const url = new URL(baseURL);
  await context.addCookies([
    {
      name: "demo_lab_session",
      value: "active",
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

function attachPageErrorTrap(page: Page): () => void {
  const jsErrors: string[] = [];
  page.on("pageerror", (err) => jsErrors.push(err.message));
  return () =>
    expect(
      jsErrors,
      `Unhandled JS errors:\n${jsErrors.join("\n")}`,
    ).toHaveLength(0);
}

const INVESTMENT_URL = `/lab/env/${ENV_ID}/re/investments/${DEAL_ID}`;

// ═══════════════════════════════════════════════════════════════════════════
// Investment Cockpit — Model/Scenario/Version Selectors
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Scenario Spine — Investment Cockpit", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedAuth(context, baseURL);
    await installSpineMocks(context);
  });

  test("investment cockpit renders with KPI cards", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(INVESTMENT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Cockpit container
    await expect(
      page.locator("[data-testid='re-investment-cockpit']"),
    ).toBeVisible({ timeout: 15_000 });

    // Investment name rendered
    await expect(
      page.locator("h1", { hasText: "Metro Office Portfolio" }),
    ).toBeVisible({ timeout: 5_000 });

    // KPI cards should have key metrics
    await expect(page.getByText("NAV")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("NOI")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("IRR")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("MOIC")).toBeVisible({ timeout: 5_000 });

    checkErrors();
  });

  test("model selector is visible and populated", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(INVESTMENT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await expect(
      page.locator("[data-testid='re-investment-cockpit']"),
    ).toBeVisible({ timeout: 15_000 });

    // Model selector should be visible
    const modelSelector = page.locator(
      "[data-testid='selector-model']",
    );
    await expect(modelSelector).toBeVisible({ timeout: 10_000 });

    // Should have "All Models" default + "Default Model" option
    const options = modelSelector.locator("option");
    await expect(options).toHaveCount(2, { timeout: 5_000 }); // "All Models" + "Default Model"

    checkErrors();
  });

  test("scenario selector is visible and populated", async ({
    page,
  }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(INVESTMENT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await expect(
      page.locator("[data-testid='re-investment-cockpit']"),
    ).toBeVisible({ timeout: 15_000 });

    // Scenario selector should be visible
    const scenarioSelector = page.locator(
      "[data-testid='selector-scenario']",
    );
    await expect(scenarioSelector).toBeVisible({ timeout: 10_000 });

    // Should have "Default" + "Base Case (Base)" options
    const options = scenarioSelector.locator("option");
    await expect(options).toHaveCount(2, { timeout: 5_000 });

    checkErrors();
  });

  test("selecting scenario updates URL params", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(INVESTMENT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await expect(
      page.locator("[data-testid='re-investment-cockpit']"),
    ).toBeVisible({ timeout: 15_000 });

    // Select the Base Case scenario
    await page
      .locator("[data-testid='selector-scenario']")
      .selectOption(SCENARIO_ID);
    await page.waitForTimeout(500);

    // URL should contain scenarioId param
    expect(page.url()).toContain(`scenarioId=${SCENARIO_ID}`);

    checkErrors();
  });

  test("asset list shows contribution % and hyperlinks", async ({
    page,
  }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(INVESTMENT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await expect(
      page.locator("[data-testid='re-investment-cockpit']"),
    ).toBeVisible({ timeout: 15_000 });

    // Asset row should be visible
    const assetRow = page.locator(
      `[data-testid='investment-asset-row-${ASSET_ID}']`,
    );
    await expect(assetRow).toBeVisible({ timeout: 10_000 });

    // Asset name should be a hyperlink
    const assetLink = assetRow.locator("a");
    await expect(assetLink).toBeVisible({ timeout: 5_000 });
    const href = await assetLink.getAttribute("href");
    expect(href).toContain(`/assets/${ASSET_ID}`);

    // % of NAV column header should be visible
    await expect(
      page.locator("th", { hasText: "% of NAV" }),
    ).toBeVisible({ timeout: 5_000 });

    checkErrors();
  });

  test("scenario context preserved in asset drill-through link", async ({
    page,
  }) => {
    const checkErrors = attachPageErrorTrap(page);

    // Navigate with scenarioId in URL
    await page.goto(`${INVESTMENT_URL}?scenarioId=${SCENARIO_ID}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await expect(
      page.locator("[data-testid='re-investment-cockpit']"),
    ).toBeVisible({ timeout: 15_000 });

    // Asset link should preserve scenarioId
    const assetRow = page.locator(
      `[data-testid='investment-asset-row-${ASSET_ID}']`,
    );
    await expect(assetRow).toBeVisible({ timeout: 10_000 });

    const assetLink = assetRow.locator("a");
    const href = await assetLink.getAttribute("href");
    expect(href).toContain(`scenarioId=${SCENARIO_ID}`);

    checkErrors();
  });

  test("sector exposure chart renders", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(INVESTMENT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await expect(
      page.locator("[data-testid='re-investment-cockpit']"),
    ).toBeVisible({ timeout: 15_000 });

    // Sector exposure header
    await expect(
      page.getByText("Sector Exposure"),
    ).toBeVisible({ timeout: 5_000 });

    // Office type should appear in sector bars
    await expect(page.getByText("Office")).toBeVisible({
      timeout: 5_000,
    });

    checkErrors();
  });
});
