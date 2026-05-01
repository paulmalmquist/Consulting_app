import { expect, test } from "@playwright/test";

test("invalid write value shows validation error and no commit control", async ({ page }) => {
  await page.setContent(`
    <section data-testid="validation-block">
      <h2>Validation failed</h2>
      <p>occupancy_between_0_and_1</p>
      <p>Set Oakwood occupancy to 180% was blocked.</p>
    </section>
  `);

  await expect(page.locator("[data-testid='validation-block']")).toContainText("occupancy_between_0_and_1");
  await expect(page.getByRole("button", { name: /commit/i })).toHaveCount(0);
});
