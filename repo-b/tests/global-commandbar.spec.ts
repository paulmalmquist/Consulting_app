import { type BrowserContext, expect, test } from "@playwright/test";

function mockContextSnapshot() {
  return {
    route: "/lab/environments",
    environments: [{ env_id: "env_1", client_name: "Acme" }],
    selectedEnv: { env_id: "env_1", client_name: "Acme", business_id: "biz_1" },
    business: { business_id: "biz_1", name: "Acme Holdings", slug: "acme" },
    modulesAvailable: ["environments", "tasks"],
    recentRuns: [],
  };
}

async function seedAuthCookie(baseURL: string, context: BrowserContext) {
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
}

test.describe("Winston companion", () => {
  test("renders the floating launcher, traps focus in the drawer, and closes on escape", async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("baseURL missing");
    await seedAuthCookie(baseURL, context);

    await page.route("**/api/mcp/context-snapshot**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockContextSnapshot()),
      });
    });

    await page.goto("/lab/environments");
    const launcher = page.getByTestId("global-commandbar-toggle");
    const composer = page.getByTestId("global-commandbar-input");

    await expect(launcher).toBeVisible();

    const dialog = page.getByRole("dialog", { name: "Winston companion" });

    await launcher.click();
    await expect(dialog).toBeVisible();
    await expect(composer).toBeFocused();
    await page.keyboard.type("why now");
    await expect(composer).toHaveValue("why now");

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    const focusInDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Winston companion"]');
      return Boolean(dialog?.contains(document.activeElement));
    });
    expect(focusInDialog).toBeTruthy();

    await expect(composer).toBeVisible();
    await expect(page.getByTestId("global-commandbar-output")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(launcher).toHaveAttribute("aria-label", "Open Winston companion");
    await expect(dialog).toHaveClass(/translate-x-full/);
    await expect(launcher).toBeFocused();
  });

  test("suppresses the launcher on public routes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("global-commandbar-toggle")).toHaveCount(0);
  });

  test("honors the winston-prefill-prompt event shim", async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("baseURL missing");
    await seedAuthCookie(baseURL, context);

    await page.route("**/api/mcp/context-snapshot**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockContextSnapshot()),
      });
    });

    await page.goto("/lab/environments");
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("winston-prefill-prompt", {
          detail: { prompt: "Summarize the current workspace context." },
        }),
      );
    });

    await expect(page.getByRole("dialog", { name: "Winston companion" })).toBeVisible();
    await expect(page.getByTestId("global-commandbar-input")).toHaveValue("Summarize the current workspace context.");
  });
});
