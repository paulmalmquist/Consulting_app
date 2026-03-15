import { expect, test, type BrowserContext } from "@playwright/test";

/**
 * RE Models workspace smoke tests.
 * Verifies:
 * 1) Fund portfolio has no global filter strip
 * 2) Left nav shows "Models" (not "Scenarios")
 * 3) /scenarios redirects to /models
 * 4) Models page loads and displays correctly
 */

const TEST_ENV_ID = "00000000-0000-0000-0000-000000000001";
const TEST_BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
const TEST_FUND_ID = "22222222-2222-2222-2222-222222222222";
const TEST_MODEL_ID = "33333333-3333-3333-3333-333333333333";

async function installMocks(context: BrowserContext) {
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;

    const fulfillJson = async (body: unknown, status = 200) => {
      await route.fulfill({
        status,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    };

    // Business context resolution
    if (path.includes("/repe-context/resolve")) {
      return fulfillJson({
        business_id: TEST_BUSINESS_ID,
        schema_name: "env_test",
        env_id: TEST_ENV_ID,
      });
    }

    // Environment lookup
    if (path.includes("/environments/") && path.includes("/details")) {
      return fulfillJson({
        env_id: TEST_ENV_ID,
        client_name: "Test Capital",
        industry: "real_estate",
        industry_type: "repe",
        schema_name: "env_test",
      });
    }

    // Funds
    if (path.includes("/funds") && method === "GET" && !path.includes("/models")) {
      return fulfillJson([
        {
          fund_id: TEST_FUND_ID,
          name: "IGF VII",
          status: "investing",
          fund_code: "IGF7",
          strategy: "equity",
          created_at: "2026-01-01T00:00:00",
        },
      ]);
    }

    // Models
    if (path.includes(`/funds/${TEST_FUND_ID}/models`) && method === "GET") {
      return fulfillJson([
        {
          model_id: TEST_MODEL_ID,
          fund_id: TEST_FUND_ID,
          name: "Base Case Q4",
          description: "Quarterly base case",
          status: "draft",
          strategy_type: "equity",
          base_snapshot_id: null,
          created_by: null,
          approved_at: null,
          approved_by: null,
          created_at: "2026-01-15T00:00:00",
          updated_at: "2026-01-15T00:00:00",
        },
      ]);
    }

    // Default: 404
    return fulfillJson({ error: "not found" }, 404);
  });
}

test.describe("RE Models Workspace", () => {
  test("left nav shows Models instead of Scenarios", async ({ page, context }) => {
    await installMocks(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/lab/env/${TEST_ENV_ID}/re`);
    await page.waitForSelector("[data-testid='repe-left-nav']");

    const navText = await page.textContent("[data-testid='repe-left-nav']");
    expect(navText).toContain("Models");
    expect(navText).not.toContain("Scenarios");
  });

  test("sidebar groups follow the institutional workflow order", async ({ page, context }) => {
    await installMocks(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/lab/env/${TEST_ENV_ID}/re`);
    await page.waitForSelector("[data-testid='repe-left-nav']");

    const labels = await page.locator("[data-testid='repe-nav-group-label']").allTextContents();
    expect(labels).toEqual([
      "Acquisitions",
      "Portfolio",
      "Investor Management",
      "Accounting",
      "Insights",
      "Governance",
      "Automation",
    ]);

    const navText = await page.textContent("[data-testid='repe-left-nav']");
    expect(navText).toContain("Saved Views");
  });

  test("workspace header has no global filter strip (Fund/Investment/JV/Asset dropdowns)", async ({ page, context }) => {
    await installMocks(context);
    await page.goto(`/lab/env/${TEST_ENV_ID}/re`);
    await page.waitForSelector("[data-testid='repe-sidebar']");

    // The old filter strip had 4 <select> elements inside the header section
    // After removal, there should be no <select> elements in the header
    const headerSelects = await page.$$("section select");
    expect(headerSelects.length).toBe(0);
  });

  test("header does not show env debug identifier", async ({ page, context }) => {
    await installMocks(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/lab/env/${TEST_ENV_ID}/re`);
    await page.waitForSelector("[data-testid='repe-sidebar']");

    const pageText = await page.textContent("body");
    // Should not show schema name or business ID slice
    expect(pageText).not.toContain("env_test");
    expect(pageText).not.toContain(TEST_BUSINESS_ID.slice(0, 8));
  });

  test("desktop utility nav shows lightweight shortcut links", async ({ page, context }) => {
    await installMocks(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/lab/env/${TEST_ENV_ID}/re`);
    await page.waitForSelector("[data-testid='repe-utility-nav']");

    const utilityNav = page.getByTestId("repe-utility-nav");
    await expect(utilityNav.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(utilityNav.getByRole("link", { name: "Funds" })).toBeVisible();
    await expect(utilityNav.getByRole("link", { name: "Investments" })).toBeVisible();
    await expect(utilityNav.getByRole("link", { name: "Assets" })).toBeVisible();
  });

  test("/scenarios redirects to /models", async ({ page, context }) => {
    await installMocks(context);
    await page.goto(`/lab/env/${TEST_ENV_ID}/re/scenarios`);
    // Wait for redirect
    await page.waitForURL(/\/models/);
    expect(page.url()).toContain("/models");
  });

  test("models page loads and shows model list", async ({ page, context }) => {
    await installMocks(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/lab/env/${TEST_ENV_ID}/re/models`);
    await page.waitForSelector("[data-testid='re-models-page']");

    // Should show Models title
    const title = await page.textContent("h1");
    expect(title).toContain("Models");

    // Should show the mock model
    const pageText = await page.textContent("[data-testid='re-models-page']");
    expect(pageText).toContain("Base Case Q4");
  });

  test("create model form is present", async ({ page, context }) => {
    await installMocks(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/lab/env/${TEST_ENV_ID}/re/models`);
    await page.waitForSelector("[data-testid='re-models-page']");

    // Verify form elements exist
    const nameInput = page.locator("[data-testid='model-name-input']");
    const strategySelect = page.locator("[data-testid='model-strategy-select']");
    const createBtn = page.locator("[data-testid='create-model-btn']");

    await expect(nameInput).toBeVisible();
    await expect(strategySelect).toBeVisible();
    await expect(createBtn).toBeVisible();
  });

  test("tablet view shows compact icon rail and expandable drawer", async ({ page, context }) => {
    await installMocks(context);
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(`/lab/env/${TEST_ENV_ID}/re`);
    await page.waitForSelector("[data-testid='repe-sidebar-compact']");

    await expect(page.getByTestId("repe-sidebar-compact")).toBeVisible();
    await page.getByLabel("Open navigation").click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    await expect(page.locator("[data-testid='repe-left-nav']")).toContainText("Acquisitions");
    await expect(page.locator("[data-testid='repe-left-nav']")).toContainText("Automation");
  });
});
