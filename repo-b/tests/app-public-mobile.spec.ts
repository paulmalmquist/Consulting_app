import { expect, test } from "@playwright/test";

const adminEnvironments = [
  {
    env_id: "11111111-1111-4111-8111-111111111111",
    slug: "novendor",
    client_name: "Meridian Capital Management",
    industry: "real_estate",
    industry_type: "real_estate",
    schema_name: "env_meridian_capital_management",
    is_active: true,
    created_at: "2026-02-25T00:00:00.000Z",
    business_id: "business-meridian",
  },
  {
    env_id: "22222222-2222-4222-8222-222222222222",
    slug: "resume",
    client_name: "Paul Malmquist Resume",
    industry: "visual_resume",
    industry_type: "visual_resume",
    schema_name: "env_resume",
    is_active: true,
    created_at: "2026-02-24T00:00:00.000Z",
    business_id: "business-resume",
  },
];

test.describe("mobile entry surfaces", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("app home prioritizes the active environment on mobile", async ({ page }, testInfo) => {
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        json: {
          authenticated: true,
          session: {
            platformAdmin: true,
            activeEnvironment: { env_id: adminEnvironments[0].env_id, env_slug: adminEnvironments[0].slug },
          },
        },
      });
    });
    await page.route("**/v1/environments", async (route) => {
      await route.fulfill({ json: { environments: adminEnvironments } });
    });

    await page.goto("/app");

    await expect(page.getByRole("heading", { name: "Winston" })).toBeVisible();
    await expect(page.getByText("Current environment")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open workspace" })).toBeVisible();
    await expect(page.getByText("Provisioned workspaces")).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await page.screenshot({
      path: testInfo.outputPath("app-mobile-selector.png"),
      fullPage: true,
    });
  });

  test("public onboarding keeps grouped steps and sticky submit action on mobile", async ({ page }, testInfo) => {
    await page.goto("/public/onboarding");

    await expect(page.getByRole("heading", { name: "Onboarding Intake" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Organization" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Operating profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit Intake" })).toBeVisible();

    const stickySubmitVisible = await page.locator("button[form='public-onboarding-form']").isVisible();
    expect(stickySubmitVisible).toBe(true);

    await page.screenshot({
      path: testInfo.outputPath("public-onboarding-mobile.png"),
      fullPage: true,
    });
  });
});
