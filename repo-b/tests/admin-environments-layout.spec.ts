import { test, expect } from "@playwright/test";

type Env = {
  env_id: string;
  client_name: string;
  industry: string;
  industry_type: string;
  schema_name: string;
  is_active: boolean;
  created_at: string;
};

const environments: Env[] = [
  {
    env_id: "11111111-1111-4111-8111-111111111111",
    client_name: "Meridian Capital Management",
    industry: "real_estate",
    industry_type: "real_estate",
    schema_name: "env_meridian_capital_management",
    is_active: true,
    created_at: "2026-02-25T00:00:00.000Z",
  },
  {
    env_id: "22222222-2222-4222-8222-222222222222",
    client_name: "newreagain",
    industry: "real_estate",
    industry_type: "real_estate",
    schema_name: "env_newreagain",
    is_active: true,
    created_at: "2026-02-24T00:00:00.000Z",
  },
  {
    env_id: "33333333-3333-4333-8333-333333333333",
    client_name: "new real estate",
    industry: "real_estate",
    industry_type: "real_estate",
    schema_name: "env_new_real_estate",
    is_active: true,
    created_at: "2026-02-23T00:00:00.000Z",
  },
  {
    env_id: "44444444-4444-4444-8444-444444444444",
    client_name: "AutoTest Real Estate",
    industry: "real_estate",
    industry_type: "real_estate",
    schema_name: "env_autotest_real_estate",
    is_active: true,
    created_at: "2026-02-22T00:00:00.000Z",
  },
  {
    env_id: "55555555-5555-4555-8555-555555555555",
    client_name: "TestRepe",
    industry: "real_estate",
    industry_type: "real_estate",
    schema_name: "env_testrepe",
    is_active: true,
    created_at: "2026-02-21T00:00:00.000Z",
  },
  {
    env_id: "66666666-6666-4666-8666-666666666666",
    client_name: "new pe real estate test",
    industry: "real_estate",
    industry_type: "real_estate",
    schema_name: "env_new_pe_real_estate_test",
    is_active: true,
    created_at: "2026-02-20T00:00:00.000Z",
  },
];

test.describe("admin environment card layout", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keeps delete buttons inside cards at MacBook-width viewports", async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== "chromium", "Desktop chromium regression only.");

    await page.route("**/v1/environments", async (route) => {
      await route.fulfill({ json: { environments } });
    });
    await page.route("**/api/ai/gateway/health", async (route) => {
      await route.fulfill({ json: { enabled: true, model: "gpt-5.4" } });
    });

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Control Tower" })).toBeVisible();
    await expect(page.getByText("System Status")).toBeVisible();
    await expect(page.getByText("Active Environments")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Environment Queue" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Operational Alerts" })).toBeVisible();
    await expect(page.getByText("Recent Activity")).toBeVisible();

    const titleBox = await page.getByRole("heading", { name: "Control Tower" }).boundingBox();
    const statusBox = await page.getByText("System Status").boundingBox();
    const metricBox = await page.getByText("Active Environments").boundingBox();
    const queueBox = await page.getByRole("heading", { name: "Environment Queue" }).boundingBox();
    const alertsBox = await page.getByRole("heading", { name: "Operational Alerts" }).boundingBox();
    const activityBox = await page.getByText("Recent Activity").boundingBox();

    expect(titleBox).not.toBeNull();
    expect(statusBox).not.toBeNull();
    expect(metricBox).not.toBeNull();
    expect(queueBox).not.toBeNull();
    expect(alertsBox).not.toBeNull();
    expect(activityBox).not.toBeNull();

    if (titleBox && statusBox && metricBox && queueBox && alertsBox && activityBox) {
      expect(statusBox.y).toBeGreaterThan(titleBox.y);
      expect(metricBox.y).toBeGreaterThan(statusBox.y);
      expect(queueBox.y).toBeGreaterThan(metricBox.y);
      expect(alertsBox.y).toBeGreaterThan(metricBox.y);
      expect(activityBox.y).toBeGreaterThan(queueBox.y);
    }

    for (const env of environments.slice(0, 3)) {
      const card = page.getByTestId(`env-card-${env.env_id}`);
      const deleteButton = page.getByTestId(`env-delete-${env.env_id}`);
      await expect(card).toBeVisible();
      await expect(deleteButton).toBeVisible();

      const cardBox = await card.boundingBox();
      const deleteBox = await deleteButton.boundingBox();

      expect(cardBox).not.toBeNull();
      expect(deleteBox).not.toBeNull();

      if (!cardBox || !deleteBox) continue;

      expect(deleteBox.x + deleteBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
      expect(deleteBox.x).toBeGreaterThanOrEqual(cardBox.x - 1);
    }

    await page.screenshot({
      path: testInfo.outputPath("admin-environments-1280x800.png"),
      fullPage: true,
    });
  });
});
