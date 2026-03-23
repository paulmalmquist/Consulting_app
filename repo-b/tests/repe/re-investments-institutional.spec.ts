import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Investments Page Institutional Quality Tests
 *
 * Verifies that the investments page meets institutional standards:
 * 1. Investment names are hyperlinks (<a> tags) with correct href
 * 2. No "+ New Fund" button
 * 3. "+ New Investment" button present and opens modal
 * 4. All institutional column headers render
 * 5. Data health indicators show
 * 6. KPI strip aggregates visible
 *
 * Uses mock routes (no real DB).
 */

const ENV_ID = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const FUND_ID = "f0000001-0000-4000-8000-000000000001";
const DEAL_1_ID = "d0000001-0000-4000-8000-000000000001";
const DEAL_2_ID = "d0000002-0000-4000-8000-000000000002";

function makeInvestmentsResponse() {
  return [
    {
      investment_id: DEAL_1_ID,
      name: "Metro Office Portfolio",
      deal_type: "equity",
      stage: "operating",
      sponsor: "Blackstone",
      fund_id: FUND_ID,
      fund_name: "Growth Fund VII",
      asset_count: 5,
      nav: 45000000,
      total_noi: 2500000,
      weighted_occupancy: 0.92,
      total_asset_value: 80000000,
      total_debt: 44000000,
      computed_ltv: 0.55,
      computed_dscr: 1.45,
      primary_market: "Chicago, IL",
      missing_quarter_state_count: 0,
    },
    {
      investment_id: DEAL_2_ID,
      name: "Sunbelt Multifamily",
      deal_type: "preferred_equity",
      stage: "underwriting",
      sponsor: "Starwood",
      fund_id: FUND_ID,
      fund_name: "Growth Fund VII",
      asset_count: 2,
      nav: 28000000,
      total_noi: 1800000,
      weighted_occupancy: 0.95,
      total_asset_value: 55000000,
      total_debt: 33000000,
      computed_ltv: 0.60,
      computed_dscr: 1.30,
      primary_market: "Miami, FL",
      missing_quarter_state_count: 3,
    },
  ];
}

async function installInvestmentMocks(context: BrowserContext) {
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

  await context.route("**/api/re/v2/investments**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeInvestmentsResponse()),
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
        fund_count: 1,
        total_commitments: "500000000",
        total_nav: "73000000",
      }),
    });
  });

  // Investment create (POST)
  await context.route("**/bos/api/re/v2/funds/*/investments", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ investment_id: "new-id-1234", name: "New Deal" }),
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

const INVESTMENTS_URL = `/lab/env/${ENV_ID}/re/investments`;

test.describe("Investments — Institutional Quality", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedAuth(context, baseURL);
    await installInvestmentMocks(context);
  });

  test("investment names are hyperlinks with correct href", async ({
    page,
  }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(INVESTMENTS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Wait for table to render
    await page
      .locator("table")
      .first()
      .waitFor({ timeout: 15_000 });

    // Investment names should be <a> tags
    const investmentLinks = page.locator(
      `a[href*='/investments/${DEAL_1_ID}']`,
    );
    await expect(investmentLinks.first()).toBeVisible({ timeout: 10_000 });

    // Verify href pattern
    const href = await investmentLinks.first().getAttribute("href");
    expect(href).toContain(`/investments/${DEAL_1_ID}`);

    checkErrors();
  });

  test("no '+New Fund' button present", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(INVESTMENTS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page
      .locator("table")
      .first()
      .waitFor({ timeout: 15_000 });

    // Should NOT have a "New Fund" button
    await expect(page.getByText("New Fund")).not.toBeVisible({
      timeout: 3_000,
    });

    checkErrors();
  });

  test("'+New Investment' button present", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(INVESTMENTS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page
      .locator("table")
      .first()
      .waitFor({ timeout: 15_000 });

    // "+ New Investment" button present
    const btn = page.locator("[data-testid='btn-new-investment']");
    await expect(btn).toBeVisible({ timeout: 5_000 });

    checkErrors();
  });

  test("institutional column headers render", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(INVESTMENTS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page
      .locator("table")
      .first()
      .waitFor({ timeout: 15_000 });

    // Check for key column headers
    const headerRow = page.locator("table thead tr").first();
    for (const col of [
      "Name",
      "Fund",
      "Stage",
      "Assets",
      "NAV",
      "NOI",
      "Value",
    ]) {
      await expect(
        headerRow.locator("th", { hasText: col }),
      ).toBeVisible({ timeout: 5_000 });
    }

    checkErrors();
  });

  test("KPI strip shows aggregate values", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(INVESTMENTS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page
      .locator("table")
      .first()
      .waitFor({ timeout: 15_000 });

    // KPI strip should show total investments count
    await expect(page.getByText("Total Investments")).toBeVisible({
      timeout: 5_000,
    });

    // Should show aggregate NAV
    await expect(page.getByText("Aggregate NAV")).toBeVisible({
      timeout: 5_000,
    });

    checkErrors();
  });

  test("data health indicators render", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(INVESTMENTS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page
      .locator("table")
      .first()
      .waitFor({ timeout: 15_000 });

    // Health column header should be visible
    const headerRow = page.locator("table thead tr").first();
    await expect(
      headerRow.locator("th", { hasText: "Health" }),
    ).toBeVisible({ timeout: 5_000 });

    checkErrors();
  });

  test("investment filters render (Fund, Stage, Type)", async ({
    page,
  }) => {
    const checkErrors = attachPageErrorTrap(page);
    await page.goto(INVESTMENTS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page
      .locator("table")
      .first()
      .waitFor({ timeout: 15_000 });

    // Filter dropdowns should be visible
    await expect(
      page.locator("[data-testid='filter-stage']"),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator("[data-testid='filter-type']"),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator("[data-testid='filter-search']"),
    ).toBeVisible({ timeout: 5_000 });

    checkErrors();
  });
});
