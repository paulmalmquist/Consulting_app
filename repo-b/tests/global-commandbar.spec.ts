import { test, expect } from "@playwright/test";

test.describe("Global command bar", () => {
  test.beforeEach(async ({ context, baseURL }) => {
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
  });

  test("opens via toggle and keyboard shortcut", async ({ page }) => {
    await page.goto("/lab/environments");

    const toggle = page.getByTestId("global-commandbar-toggle");
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(page.getByTestId("global-commandbar-output")).toBeVisible();
    await expect(page.getByTestId("global-commandbar-input")).toBeVisible();
    await expect(page.getByTestId("global-commandbar-status")).toContainText(/Local-only|Unavailable|Checking/);

    await page.getByTestId("global-commandbar-close").click();
    await expect(page.getByTestId("global-commandbar-output")).toBeHidden();

    await page.keyboard.press("Meta+K");
    if (!(await page.getByTestId("global-commandbar-output").isVisible())) {
      await page.keyboard.press("Control+K");
    }
    await expect(page.getByTestId("global-commandbar-output")).toBeVisible();

    await page.goto("/");
    await expect(page.getByTestId("global-commandbar-toggle")).toBeVisible();
  });

  test("viewer role cannot submit commands", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("lab_user_role", "viewer");
    });
    await page.goto("/lab/environments");
    await page.getByTestId("global-commandbar-toggle").click();

    await expect(page.getByText("Viewer role can review transcripts")).toBeVisible();
    await expect(page.getByTestId("global-commandbar-send")).toBeDisabled();
  });
});
