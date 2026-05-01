import { expect, test } from "@playwright/test";

test("unavailable_with_reason shows reason code instead of bare generic copy", async ({ page }) => {
  await page.setContent(`
    <div data-testid="winston-unavailable-reason">
      <p>Unavailable</p>
      <span>null_metric</span>
      <p>The released snapshot carries a null metric value.</p>
    </div>
  `);

  const block = page.locator("[data-testid='winston-unavailable-reason']");
  await expect(block).toContainText("null_metric");
  await expect(block).not.toContainText("is not available in the environment data.");
});
