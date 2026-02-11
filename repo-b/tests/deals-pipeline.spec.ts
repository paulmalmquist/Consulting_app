import { test, expect } from "@playwright/test";

const BIZ_ID = "biz_deals_test";

const departments = [
  {
    department_id: "dept_accounting",
    key: "accounting",
    label: "Accounting",
    icon: "calculator",
    sort_order: 1,
    enabled: true,
  },
];

test.beforeEach(async ({ context, page, baseURL }) => {
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

  await page.addInitScript(
    ([bizId]) => {
      localStorage.setItem("bos_business_id", bizId);
    },
    [BIZ_ID]
  );

  await page.route("**/api/departments", async (route) => {
    await route.fulfill({ json: departments });
  });
  await page.route("**/api/templates", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route(`**/api/businesses/${BIZ_ID}/departments`, async (route) => {
    await route.fulfill({ json: departments });
  });
  await page.route(
    `**/api/businesses/${BIZ_ID}/departments/**/capabilities`,
    async (route) => {
      await route.fulfill({ json: [] });
    }
  );
});

test.describe("Deal Pipeline", () => {
  test("renders Kanban board with all 5 stage columns", async ({ page }) => {
    await page.goto("/app/deals");
    await expect(page.getByRole("heading", { name: "Deal Pipeline" })).toBeVisible();
    await expect(page.getByTestId("pipeline-summary")).toBeVisible();
    await expect(page.getByTestId("deal-pipeline")).toBeVisible();

    // All 5 stage columns
    await expect(page.getByTestId("stage-column-origination")).toBeVisible();
    await expect(page.getByTestId("stage-column-underwriting")).toBeVisible();
    await expect(page.getByTestId("stage-column-ic_review")).toBeVisible();
    await expect(page.getByTestId("stage-column-closed_won")).toBeVisible();
    await expect(page.getByTestId("stage-column-closed_lost")).toBeVisible();
  });

  test("add deal modal opens, fills form, and saves deal", async ({ page }) => {
    await page.goto("/app/deals");

    // Clear any existing deals from localStorage
    await page.evaluate(() => localStorage.removeItem("winston_deals"));
    await page.reload();

    // Open modal
    await page.getByTestId("add-deal-button").click();
    await expect(page.getByTestId("add-deal-modal")).toBeVisible();

    // Fill form
    await page.getByTestId("deal-name-input").fill("Test Deal Alpha");
    await page.getByTestId("deal-company-input").fill("Acme Corp");
    await page.getByTestId("deal-value-input").fill("100000");

    // Save
    await page.getByTestId("save-deal-button").click();

    // Modal should close
    await expect(page.getByTestId("add-deal-modal")).not.toBeVisible();

    // Deal card should appear in origination column (default stage)
    const origColumn = page.getByTestId("stage-column-origination");
    await expect(origColumn.getByText("Test Deal Alpha")).toBeVisible();
    await expect(origColumn.getByText("Acme Corp")).toBeVisible();
  });

  test("save button is disabled when required fields are empty", async ({ page }) => {
    await page.goto("/app/deals");

    await page.getByTestId("add-deal-button").click();
    await expect(page.getByTestId("add-deal-modal")).toBeVisible();

    // Save should be disabled initially (no name, no company, no value)
    await expect(page.getByTestId("save-deal-button")).toBeDisabled();

    // Fill only name
    await page.getByTestId("deal-name-input").fill("Partial Deal");
    await expect(page.getByTestId("save-deal-button")).toBeDisabled();

    // Add company
    await page.getByTestId("deal-company-input").fill("Some Corp");
    await expect(page.getByTestId("save-deal-button")).toBeDisabled();

    // Add value — now should be enabled
    await page.getByTestId("deal-value-input").fill("50000");
    await expect(page.getByTestId("save-deal-button")).toBeEnabled();
  });

  test("summary bar shows pipeline metrics", async ({ page }) => {
    // Seed a deal
    await page.addInitScript(() => {
      localStorage.setItem(
        "winston_deals",
        JSON.stringify([
          {
            id: "deal-1",
            name: "Seeded Deal",
            company: "SeedCo",
            value: 250000,
            stage: "origination",
            owner: "Jane",
            probability: 80,
            createdAt: new Date().toISOString(),
          },
        ])
      );
    });

    await page.goto("/app/deals");

    const summary = page.getByTestId("pipeline-summary");
    await expect(summary).toBeVisible();
    await expect(summary.getByText("$250,000")).toBeVisible();
  });

  test("deal can be added to a specific stage", async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem("winston_deals"));
    await page.goto("/app/deals");

    await page.getByTestId("add-deal-button").click();
    await page.getByTestId("deal-name-input").fill("Underwriting Deal");
    await page.getByTestId("deal-company-input").fill("BetaCorp");
    await page.getByTestId("deal-value-input").fill("75000");
    await page.getByTestId("deal-stage-select").selectOption("underwriting");
    await page.getByTestId("save-deal-button").click();

    const uwColumn = page.getByTestId("stage-column-underwriting");
    await expect(uwColumn.getByText("Underwriting Deal")).toBeVisible();
  });
});
