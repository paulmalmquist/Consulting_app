import { expect, test } from "@playwright/test";

const ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001";

test("Fund Portfolio uses shared REPE typography classes", async ({ page }) => {
  await page.goto(`/lab/env/${ENV_ID}/re`);
  await page.waitForSelector("[data-testid='re-fund-list']", { timeout: 30000 });

  const h1 = page.getByRole("heading", { name: "Fund Portfolio" });
  await expect(h1).toHaveClass(/nv-h1/);

  const header = page.locator("th").first();
  await expect(header).toHaveClass(/nv-table-header/);

  const metricCell = page.locator(".nv-metric").first();
  await expect(metricCell).toBeVisible();
});
