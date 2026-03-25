import { test, expect } from "@playwright/test";

test.describe("Winston copilot workspace", () => {
  test("loads the full-screen copilot shell locally", async ({ page }) => {
    test.skip(!process.env.PLAYWRIGHT_ENV_ID, "Set PLAYWRIGHT_ENV_ID to run the copilot workspace locally.");

    await page.goto(`/lab/env/${process.env.PLAYWRIGHT_ENV_ID}/copilot`);
    await expect(page.getByText("Winston Copilot")).toBeVisible();
    await expect(page.getByPlaceholder("Ask Winston to analyze, retrieve, or act...")).toBeVisible();
  });
});
