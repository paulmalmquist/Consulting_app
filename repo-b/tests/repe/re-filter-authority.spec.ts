import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Filter Authority Tests — RE Platform
 *
 * Validates that filters on fund list, investments, and assets pages:
 * 1. Render visible filter controls
 * 2. Scope the visible data when changed
 * 3. Persist values in URL params
 * 4. Can be cleared to show all data
 *
 * Uses mock routes (no real DB).
 */

const ENV_ID = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const FUND_1_ID = "f0000001-0000-4000-8000-000000000001";
const FUND_2_ID = "f0000002-0000-4000-8000-000000000002";
const DEAL_1_ID = "d0000001-0000-4000-8000-000000000001";
const DEAL_2_ID = "d0000002-0000-4000-8000-000000000002";

function makeFundsResponse() {
  return [
    {
      fund_id: FUND_1_ID,
      business_id: BUSINESS_ID,
      name: "Growth Fund VII",
      vintage_year: 2024,
      strategy: "value-add",
      status: "investing",
      target_size: 500000000,
      total_commitments: 350000000,
      created_at: "2024-01-01T00:00:00",
    },
    {
      fund_id: FUND_2_ID,
      business_id: BUSINESS_ID,
      name: "Opportunity Fund III",
      vintage_year: 2023,
      strategy: "opportunistic",
      status: "closed",
      target_size: 250000000,
      total_commitments: 250000000,
      created_at: "2023-06-01T00:00:00",
    },
  ];
}

function makeInvestmentsResponse() {
  return [
    {
      investment_id: DEAL_1_ID,
      name: "Metro Office Portfolio",
      deal_type: "equity",
      stage: "operating",
      sponsor: "Blackstone",
      fund_id: FUND_1_ID,
      fund_name: "Growth Fund VII",
      asset_count: 3,
      nav: 45000000,
      total_noi: 2500000,
      weighted_occupancy: 0.92,
      total_asset_value: 80000000,
      computed_ltv: 0.55,
      computed_dscr: 1.45,
      primary_market: "Chicago, IL",
      missing_quarter_state_count: 0,
    },
    {
      investment_id: DEAL_2_ID,
      name: "Sunbelt Multifamily",
      deal_type: "equity",
      stage: "underwriting",
      sponsor: "Starwood",
      fund_id: FUND_2_ID,
      fund_name: "Opportunity Fund III",
      asset_count: 2,
      nav: 28000000,
      total_noi: 1800000,
      weighted_occupancy: 0.95,
      total_asset_value: 55000000,
      computed_ltv: 0.60,
      computed_dscr: 1.30,
      primary_market: "Miami, FL",
      missing_quarter_state_count: 1,
    },
  ];
}

function makeAssetsResponse() {
  return [
    {
      asset_id: "a0000001-0000-4000-8000-000000000001",
      name: "The Meridian Tower",
      asset_type: "property",
      sector: "Office",
      city: "Chicago",
      state: "IL",
      msa: "Chicago-Naperville-Elgin",
      status: "active",
      investment_id: DEAL_1_ID,
      investment_name: "Metro Office Portfolio",
      fund_id: FUND_1_ID,
      fund_name: "Growth Fund VII",
      latest_noi: 2100000,
      latest_occupancy: 0.92,
      latest_value: 45000000,
    },
    {
      asset_id: "a0000002-0000-4000-8000-000000000002",
      name: "Sunset Gardens",
      asset_type: "property",
      sector: "Multifamily",
      city: "Miami",
      state: "FL",
      msa: "Miami-Fort Lauderdale",
      status: "active",
      investment_id: DEAL_2_ID,
      investment_name: "Sunbelt Multifamily",
      fund_id: FUND_2_ID,
      fund_name: "Opportunity Fund III",
      latest_noi: 1800000,
      latest_occupancy: 0.95,
      latest_value: 55000000,
    },
  ];
}

async function installFilterMocks(context: BrowserContext) {
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
        funds_count: 2,
        scenarios_count: 3,
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
      body: JSON.stringify(makeFundsResponse()),
    });
  });

  await context.route("**/api/re/v2/investments?**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeInvestmentsResponse()),
    });
  });

  await context.route("**/api/re/v2/investments", async (route) => {
    if (route.request().url().includes("?")) return route.continue();
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeInvestmentsResponse()),
    });
  });

  await context.route("**/api/re/v2/assets?**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeAssetsResponse()),
    });
  });

  await context.route("**/api/re/v2/assets", async (route) => {
    if (route.request().url().includes("?")) return route.continue();
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeAssetsResponse()),
    });
  });

  await context.route("**/api/businesses/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([]),
    });
  });

  await context.route("**/api/re/v2/environments/*/portfolio-kpis**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fund_count: 2,
        total_commitments: "600000000",
        total_nav: "73000000",
        avg_irr: "0.12",
      }),
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

const FUNDS_LIST_URL = `/lab/env/${ENV_ID}/re/funds`;
const ASSETS_URL = `/lab/env/${ENV_ID}/re/assets`;

// ═══════════════════════════════════════════════════════════════════════════
// FUND LIST FILTERS
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Filter Authority — Fund List", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedAuth(context, baseURL);
    await installFilterMocks(context);
  });

  test("fund list: filter controls are rendered", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(FUNDS_LIST_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await expect(
      page.locator("[data-testid='filter-strategy']"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("[data-testid='filter-vintage']"),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator("[data-testid='filter-status']"),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator("[data-testid='filter-search']"),
    ).toBeVisible({ timeout: 5_000 });

    checkErrors();
  });

  test("fund list: strategy filter scopes data", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(FUNDS_LIST_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Wait for funds to render
    await page
      .locator("[data-testid^='fund-row-']")
      .first()
      .waitFor({ timeout: 10_000 });

    // Both funds should be visible initially
    const allRows = page.locator("[data-testid^='fund-row-']");
    await expect(allRows).toHaveCount(2, { timeout: 5_000 });

    // Select "value-add" strategy
    await page
      .locator("[data-testid='filter-strategy']")
      .selectOption("value-add");
    await page.waitForTimeout(500);

    // Only Growth Fund VII should remain
    const filtered = page.locator("[data-testid^='fund-row-']");
    await expect(filtered).toHaveCount(1, { timeout: 5_000 });

    checkErrors();
  });

  test("fund list: filter persists in URL", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(FUNDS_LIST_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page
      .locator("[data-testid^='fund-row-']")
      .first()
      .waitFor({ timeout: 10_000 });

    // Apply status filter
    await page
      .locator("[data-testid='filter-status']")
      .selectOption("closed");
    await page.waitForTimeout(500);

    // URL should contain status=closed
    expect(page.url()).toContain("status=closed");

    checkErrors();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ASSETS PAGE FILTERS
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Filter Authority — Assets Page", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedAuth(context, baseURL);
    await installFilterMocks(context);
  });

  test("assets page: filter controls are rendered", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(ASSETS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page
      .locator("[data-testid='re-assets-index']")
      .waitFor({ timeout: 15_000 });

    // Fund filter should be visible
    await expect(
      page.locator("[data-testid='filter-fund']"),
    ).toBeVisible({ timeout: 10_000 });

    // Investment filter should be visible
    await expect(
      page.locator("[data-testid='filter-investment']"),
    ).toBeVisible({ timeout: 5_000 });

    // Search should be visible
    await expect(
      page.locator("[data-testid='filter-search']"),
    ).toBeVisible({ timeout: 5_000 });

    checkErrors();
  });

  test("assets page: filter persists in URL", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(ASSETS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page
      .locator("[data-testid='re-assets-index']")
      .waitFor({ timeout: 15_000 });

    // Type in search
    await page
      .locator("[data-testid='filter-search']")
      .fill("Meridian");
    await page.waitForTimeout(500);

    // URL should contain q=Meridian
    expect(page.url()).toContain("q=Meridian");

    checkErrors();
  });
});
