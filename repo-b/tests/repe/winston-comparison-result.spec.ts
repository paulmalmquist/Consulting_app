import { expect, test } from "@playwright/test";

test("comparison_result block exposes coverage and excluded reasons", async ({ page }) => {
  await page.setContent(`
    <div data-testid="winston-comparison-result">
      <p data-testid="comparison-coverage">Funds total: 3 · Included: 1 · Excluded: 2</p>
      <div data-testid="excluded-from-ranking">
        <table>
          <tr><td>Fund II</td><td>insufficient_history</td></tr>
          <tr><td>Fund III</td><td>draft_only</td></tr>
        </table>
      </div>
    </div>
  `);

  await expect(page.locator("[data-testid='comparison-coverage']")).toContainText("Funds total: 3");
  await expect(page.locator("[data-testid='comparison-coverage']")).toContainText("Included: 1");
  await expect(page.locator("[data-testid='excluded-from-ranking']")).toContainText("insufficient_history");
  await expect(page.locator("[data-testid='excluded-from-ranking']")).toContainText("draft_only");
});
