import { expect, test } from "@playwright/test";

test("write flow shows staged diff before commit affordance", async ({ page }) => {
  await page.setContent(`
    <section data-testid="staged-change">
      <h2>Staged change</h2>
      <table>
        <tr><th>Before</th><th>After</th></tr>
        <tr><td>88%</td><td>91%</td></tr>
      </table>
      <button>Commit change</button>
    </section>
  `);

  await expect(page.locator("[data-testid='staged-change']")).toContainText("88%");
  await expect(page.locator("[data-testid='staged-change']")).toContainText("91%");
  await expect(page.getByRole("button", { name: /commit change/i })).toBeVisible();
});
