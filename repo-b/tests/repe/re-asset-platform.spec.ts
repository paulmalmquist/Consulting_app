import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ENV_ID = "11111111-1111-4111-8111-111111111111";
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const FUND_ID = "f0000001-0000-4000-8000-000000000001";
const DEAL_ID = "d0000001-0000-4000-8000-000000000001";
const ASSET_1_ID = "a0000001-0000-4000-8000-000000000001";
const ASSET_2_ID = "a0000002-0000-4000-8000-000000000002";
const ASSET_3_ID = "a0000003-0000-4000-8000-000000000003";

function makeAssetListResponse() {
  return [
    {
      asset_id: ASSET_1_ID,
      name: "The Meridian Tower",
      asset_type: "property",
      sector: "Office",
      city: "Chicago",
      state: "IL",
      msa: "Chicago-Naperville-Elgin",
      market: "Chicago, IL",
      units: 0,
      square_feet: 185000,
      status: "active",
      investment_id: DEAL_ID,
      investment_name: "Meridian Office Portfolio",
      fund_id: FUND_ID,
      fund_name: "Fund I",
      latest_noi: 2100000,
      latest_occupancy: 0.92,
      latest_value: 45000000,
      latest_quarter: "2026Q1",
      created_at: "2026-01-01T00:00:00",
    },
    {
      asset_id: ASSET_2_ID,
      name: "Sunset Gardens",
      asset_type: "property",
      sector: "Multifamily",
      city: "Miami",
      state: "FL",
      msa: "Miami-Fort Lauderdale-Pompano Beach",
      market: "Miami, FL",
      units: 250,
      square_feet: 0,
      status: "active",
      investment_id: DEAL_ID,
      investment_name: "Meridian Office Portfolio",
      fund_id: FUND_ID,
      fund_name: "Fund I",
      latest_noi: 3200000,
      latest_occupancy: 0.95,
      latest_value: 68000000,
      latest_quarter: "2026Q1",
      created_at: "2026-01-01T00:00:00",
    },
    {
      asset_id: ASSET_3_ID,
      name: "Commerce Center",
      asset_type: "property",
      sector: "Industrial",
      city: "Dallas",
      state: "TX",
      msa: "Dallas-Fort Worth-Arlington",
      market: "Dallas, TX",
      units: 0,
      square_feet: 310000,
      status: "active",
      investment_id: DEAL_ID,
      investment_name: "Meridian Office Portfolio",
      fund_id: FUND_ID,
      fund_name: "Fund I",
      latest_noi: 1800000,
      latest_occupancy: 0.88,
      latest_value: 35000000,
      latest_quarter: "2026Q1",
      created_at: "2026-01-01T00:00:00",
    },
  ];
}

function makeAssetDetailResponse() {
  return {
    asset: {
      asset_id: ASSET_1_ID,
      name: "The Meridian Tower",
      asset_type: "property",
      status: "active",
      created_at: "2026-01-01T00:00:00",
    },
    property: {
      property_type: "Office",
      units: 0,
      market: "Chicago, IL",
      city: "Chicago",
      state: "IL",
      msa: "Chicago-Naperville-Elgin",
      address: "111 N Michigan Ave",
      square_feet: 185000,
    },
    investment: {
      investment_id: DEAL_ID,
      name: "Meridian Office Portfolio",
      investment_type: "equity",
      stage: "operating",
    },
    fund: { fund_id: FUND_ID, name: "Fund I" },
    env: { env_id: ENV_ID, business_id: BUSINESS_ID },
  };
}

function makePeriodsResponse() {
  return [
    { quarter: "2025Q2", revenue: 2000000, opex: 900000, noi: 1100000, occupancy: 0.88, asset_value: 40000000, capex: 160000 },
    { quarter: "2025Q3", revenue: 2040000, opex: 918000, noi: 1122000, occupancy: 0.90, asset_value: 41000000, capex: 163200 },
    { quarter: "2025Q4", revenue: 2080800, opex: 936360, noi: 1144440, occupancy: 0.89, asset_value: 42000000, capex: 166464 },
    { quarter: "2026Q1", revenue: 2122416, opex: 955087, noi: 1167329, occupancy: 0.92, asset_value: 45000000, capex: 169793 },
  ];
}

function makeTrialBalanceResponse() {
  return [
    { account_code: "4000", account_name: "Rental Income", category: "Revenue", is_balance_sheet: false, balance: 1800000 },
    { account_code: "4100", account_name: "Other Income", category: "Revenue", is_balance_sheet: false, balance: 322416 },
    { account_code: "5000", account_name: "Property Taxes", category: "Operating Expenses", is_balance_sheet: false, balance: 350000 },
    { account_code: "5100", account_name: "Insurance", category: "Operating Expenses", is_balance_sheet: false, balance: 120000 },
    { account_code: "5200", account_name: "Repairs & Maintenance", category: "Operating Expenses", is_balance_sheet: false, balance: 485087 },
  ];
}

async function installAssetMocks(context: BrowserContext) {
  // Environment mocks
  await context.route("**/v1/environments/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        env_id: ENV_ID,
        client_name: "RE Test",
        industry: "real_estate",
        industry_type: "real_estate",
        schema_name: "env_test",
        is_active: true,
        status: "active",
        business_id: BUSINESS_ID,
      }),
    });
  });

  // REPE context
  await context.route("**/api/repe/context**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ env_id: ENV_ID, business_id: BUSINESS_ID, created: false, source: "test", diagnostics: {} }),
    });
  });

  await context.route("**/api/re/v1/context**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ env_id: ENV_ID, business_id: BUSINESS_ID, created: false, source: "test", diagnostics: {} }),
    });
  });

  // RE v1 context bootstrap
  await context.route("**/api/re/v1/context/bootstrap**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ env_id: ENV_ID, business_id: BUSINESS_ID, ok: true }),
    });
  });

  // Funds list
  await context.route("**/api/re/v1/funds**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([{ fund_id: FUND_ID, business_id: BUSINESS_ID, name: "Fund I", vintage_year: 2025, strategy: "equity", status: "investing", created_at: "2025-01-01" }]),
    });
  });

  // Asset list (v2)
  await context.route("**/api/re/v2/assets?**", async (route) => {
    const url = new URL(route.request().url());
    const allAssets = makeAssetListResponse();
    const sector = url.searchParams.get("sector");
    const state = url.searchParams.get("state");

    let filtered = allAssets;
    if (sector) filtered = filtered.filter((a) => a.sector.toLowerCase() === sector.toLowerCase());
    if (state) filtered = filtered.filter((a) => a.state === state);

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(filtered),
    });
  });

  // Asset detail (v2)
  await context.route(`**/api/re/v2/assets/${ASSET_1_ID}`, async (route) => {
    if (route.request().url().includes("/periods") || route.request().url().includes("/accounting") || route.request().url().includes("/reports")) {
      return route.continue();
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeAssetDetailResponse()),
    });
  });

  // Asset periods
  await context.route(`**/api/re/v2/assets/${ASSET_1_ID}/periods**`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makePeriodsResponse()),
    });
  });

  // Asset quarter state
  await context.route("**/api/re/v2/assets/*/quarter-state/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "qs-1",
        asset_id: ASSET_1_ID,
        quarter: "2026Q1",
        run_id: "run-1",
        accounting_basis: "accrual",
        noi: 1167329,
        revenue: 2122416,
        opex: 955087,
        capex: 169793,
        occupancy: 0.92,
        asset_value: 45000000,
        nav: 22000000,
        debt_balance: 23000000,
        debt_service: 350000,
        ltv: 0.51,
        dscr: 1.42,
        inputs_hash: "abc123",
        created_at: "2026-01-15T00:00:00",
      }),
    });
  });

  // Trial balance
  await context.route("**/api/re/v2/assets/*/accounting/trial-balance**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeTrialBalanceResponse()),
    });
  });

  // P&L
  await context.route("**/api/re/v2/assets/*/accounting/pnl**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { line_code: "revenue", amount: 2122416 },
        { line_code: "opex", amount: 955087 },
        { line_code: "noi", amount: 1167329 },
      ]),
    });
  });

  // Transactions
  await context.route("**/api/re/v2/assets/*/accounting/transactions**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { period_month: "2026-01-01", gl_account: "4000", name: "Rental Income", category: "Revenue", amount: 600000 },
        { period_month: "2026-02-01", gl_account: "4000", name: "Rental Income", category: "Revenue", amount: 600000 },
        { period_month: "2026-03-01", gl_account: "4000", name: "Rental Income", category: "Revenue", amount: 600000 },
      ]),
    });
  });

  // Lineage
  await context.route("**/api/re/v2/assets/*/lineage/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ widgets: [], issues: [] }),
    });
  });

  // Reports
  await context.route("**/api/re/v2/assets/*/reports", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        report_type: "snapshot",
        quarter: "2026Q1",
        format: "json",
        generated_at: "2026-02-28T00:00:00Z",
        asset: makeAssetDetailResponse().asset,
        quarter_state: { noi: 1167329, revenue: 2122416, occupancy: 0.92 },
      }),
    });
  });

  // Investment assets (for investment detail page)
  await context.route("**/api/re/v2/investments/*/assets/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeAssetListResponse().map((a) => ({
        asset_id: a.asset_id,
        deal_id: DEAL_ID,
        asset_type: a.asset_type,
        name: a.name,
        property_type: a.sector,
        noi: a.latest_noi,
        asset_value: a.latest_value,
        nav: a.latest_value * 0.5,
      }))),
    });
  });

  // Investment detail
  await context.route(`**/api/re/v2/investments/${DEAL_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        investment_id: DEAL_ID,
        fund_id: FUND_ID,
        name: "Meridian Office Portfolio",
        investment_type: "equity",
        stage: "operating",
        committed_capital: 50000000,
        invested_capital: 45000000,
        realized_distributions: 5000000,
        created_at: "2025-06-01",
      }),
    });
  });

  // Investment JVs
  await context.route("**/api/re/v2/investments/*/jvs", async (route) => {
    await route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: "[]" });
  });

  // Investment quarter state
  await context.route("**/api/re/v2/investments/*/quarter-state/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nav: 22000000, gross_asset_value: 45000000, net_irr: 0.12, gross_irr: 0.15, equity_multiple: 1.3, inputs_hash: "x" }),
    });
  });

  // Investment lineage
  await context.route("**/api/re/v2/investments/*/lineage/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ widgets: [], issues: [] }),
    });
  });

  // Fund detail
  await context.route("**/api/repe/funds/*", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fund: { fund_id: FUND_ID, name: "Fund I" }, terms: [] }),
    });
  });

  // Catch-all for other API routes
  await context.route("**/api/businesses/**", async (route) => {
    await route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: "[]" });
  });

  await context.route("**/api/documents**", async (route) => {
    await route.fulfill({ status: 200, headers: { "content-type": "application/json" }, body: "[]" });
  });
}

async function setupAuth(context: BrowserContext, page: Page, baseURL: string | undefined) {
  if (!baseURL) throw new Error("baseURL missing");
  const url = new URL(baseURL);

  await context.addCookies([
    { name: "demo_lab_session", value: "active", domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" },
  ]);

  await page.addInitScript((envId: string) => {
    window.localStorage.setItem("demo_lab_env_id", envId);
  }, ENV_ID);
}

test.describe("Asset Index Page", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    await setupAuth(context, page, baseURL);
    await installAssetMocks(context);
  });

  test("loads with all assets by default", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/assets`);
    await expect(page.getByTestId("re-assets-index")).toBeVisible();
    await expect(page.getByText("The Meridian Tower")).toBeVisible();
    await expect(page.getByText("Sunset Gardens")).toBeVisible();
    await expect(page.getByText("Commerce Center")).toBeVisible();
  });

  test("shows quick stats", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/assets`);
    await expect(page.getByText("Total Assets")).toBeVisible();
    await expect(page.getByText("3", { exact: true })).toBeVisible();
  });

  test("sector filter reduces visible set", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/assets`);
    await expect(page.getByText("The Meridian Tower")).toBeVisible();

    const sectorSelect = page.locator('label:has-text("Sector") select');
    await sectorSelect.selectOption("Office");
    await page.waitForTimeout(500);

    await expect(page.getByText("The Meridian Tower")).toBeVisible();
    await expect(page.getByText("Sunset Gardens")).not.toBeVisible();
    await expect(page.getByText("Commerce Center")).not.toBeVisible();
  });

  test("state filter works", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/assets`);

    const stateSelect = page.locator('label:has-text("State") select');
    await stateSelect.selectOption("FL");
    await page.waitForTimeout(500);

    await expect(page.getByText("Sunset Gardens")).toBeVisible();
    await expect(page.getByText("The Meridian Tower")).not.toBeVisible();
  });

  test("clear filters resets view", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/assets`);

    const sectorSelect = page.locator('label:has-text("Sector") select');
    await sectorSelect.selectOption("Office");
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "Clear Filters" }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText("The Meridian Tower")).toBeVisible();
    await expect(page.getByText("Sunset Gardens")).toBeVisible();
  });

  test("asset name links to asset detail page", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/assets`);
    await page.getByRole("link", { name: "The Meridian Tower" }).click();
    await expect(page).toHaveURL(new RegExp(`/lab/env/${ENV_ID}/re/assets/${ASSET_1_ID}`));
  });
});

test.describe("Asset Detail Page", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    await setupAuth(context, page, baseURL);
    await installAssetMocks(context);
  });

  test("renders asset header with breadcrumb", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/assets/${ASSET_1_ID}`);
    await expect(page.getByTestId("re-asset-homepage")).toBeVisible();
    await expect(page.getByRole("heading", { name: "The Meridian Tower" })).toBeVisible();
    await expect(page.getByText("Fund I")).toBeVisible();
    await expect(page.getByText("Meridian Office Portfolio")).toBeVisible();
  });

  test("shows metric cards with NOI, occupancy, value", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/assets/${ASSET_1_ID}`);
    await expect(page.getByText("NOI")).toBeVisible();
    await expect(page.getByText("Occupancy")).toBeVisible();
    await expect(page.getByText("Value")).toBeVisible();
  });

  test("overview tab shows Occupancy vs NOI trend", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/assets/${ASSET_1_ID}`);
    await expect(page.getByText("Occupancy vs NOI Trend")).toBeVisible();
    await expect(page.getByText("2025Q2")).toBeVisible();
    await expect(page.getByText("2026Q1")).toBeVisible();
  });

  test("financials tab shows quarterly table", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/assets/${ASSET_1_ID}`);
    await page.getByRole("button", { name: "Financials" }).click();
    await expect(page.getByText("Quarterly Financials")).toBeVisible();
    await expect(page.getByText("Revenue")).toBeVisible();
    await expect(page.getByText("Margin")).toBeVisible();
  });

  test("accounting tab shows trial balance", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/assets/${ASSET_1_ID}`);
    await page.getByRole("button", { name: "Accounting" }).click();
    await expect(page.getByText("Trial Balance")).toBeVisible();
    await expect(page.getByText("Rental Income")).toBeVisible();
    await expect(page.getByText("4000")).toBeVisible();
  });

  test("generate report button opens modal", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/assets/${ASSET_1_ID}`);
    await page.getByRole("button", { name: "Generate Report" }).click();
    await expect(page.getByText("Generate Asset Report")).toBeVisible();
    await expect(page.getByText("Asset Snapshot")).toBeVisible();
  });

  test("no console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto(`/lab/env/${ENV_ID}/re/assets/${ASSET_1_ID}`);
    await page.waitForTimeout(2000);

    // Filter out known non-critical errors
    const realErrors = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("hydration") && !e.includes("net::ERR")
    );
    expect(realErrors).toHaveLength(0);
  });
});

test.describe("Investment → Asset drill-through", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    await setupAuth(context, page, baseURL);
    await installAssetMocks(context);
  });

  test("investment assets tab shows hyperlinked asset names", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/investments/${DEAL_ID}`);
    await expect(page.getByTestId("re-investment-homepage")).toBeVisible();

    await page.getByRole("button", { name: "Assets" }).click();

    const assetLink = page.getByRole("link", { name: "The Meridian Tower" });
    await expect(assetLink).toBeVisible();
    await expect(assetLink).toHaveAttribute("href", `/lab/env/${ENV_ID}/re/assets/${ASSET_1_ID}`);
  });

  test("clicking asset link navigates to asset detail", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/investments/${DEAL_ID}`);
    await page.getByRole("button", { name: "Assets" }).click();
    await page.getByRole("link", { name: "The Meridian Tower" }).click();

    await expect(page).toHaveURL(new RegExp(`/lab/env/${ENV_ID}/re/assets/${ASSET_1_ID}`));
    await expect(page.getByTestId("re-asset-homepage")).toBeVisible();
  });
});
