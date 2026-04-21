import { expect, test } from "@playwright/test";

const adminEnvironments = [
  {
    env_id: "11111111-1111-4111-8111-111111111111",
    slug: "meridian",
    client_name: "Meridian Capital Management",
    industry: "real_estate_pe",
    industry_type: "repe",
    repe_initialized: false,
    schema_name: "env_meridian_capital_management",
    is_active: true,
    created_at: "2026-02-25T00:00:00.000Z",
    business_id: "business-meridian",
  },
  {
    env_id: "22222222-2222-4222-8222-222222222222",
    slug: "ncf",
    client_name: "National Christian Foundation",
    industry: "ncf",
    industry_type: "ncf",
    schema_name: "env_ncf",
    is_active: true,
    created_at: "2026-02-24T00:00:00.000Z",
    business_id: "business-ncf",
  },
  {
    env_id: "33333333-3333-4333-8333-333333333333",
    slug: "hall-boys",
    client_name: "Hall Boys Operating System",
    industry: "multi_entity_operator",
    industry_type: "multi_entity_operator",
    schema_name: "env_hall_boys",
    is_active: true,
    created_at: "2026-02-23T00:00:00.000Z",
    business_id: "business-hall-boys",
  },
  {
    env_id: "44444444-4444-4444-8444-444444444444",
    slug: "novendor",
    client_name: "Novendor",
    industry: "consulting",
    industry_type: "consulting",
    schema_name: "env_novendor",
    is_active: true,
    created_at: "2026-02-22T00:00:00.000Z",
    business_id: "business-novendor",
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
    await expect(page.getByText("Current workspace")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tap to enter" })).toBeVisible();
    await expect(page.getByText("Workspaces")).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);

    const meridianCard = page
      .locator("section")
      .filter({ hasText: "Workspaces" })
      .getByRole("button", { name: /Meridian Capital Management/i });
    await expect(meridianCard).toBeVisible();
    await expect(meridianCard.getByTestId("env-lifecycle-pill")).toBeVisible();

    const [cardBox, pillBox] = await Promise.all([
      meridianCard.boundingBox(),
      meridianCard.getByTestId("env-lifecycle-pill").boundingBox(),
    ]);
    expect(cardBox).not.toBeNull();
    expect(pillBox).not.toBeNull();

    expect((pillBox?.x ?? 0) >= (cardBox?.x ?? 0)).toBe(true);
    expect((pillBox?.y ?? 0) >= (cardBox?.y ?? 0)).toBe(true);
    expect((pillBox?.x ?? 0) + (pillBox?.width ?? 0) <= (cardBox?.x ?? 0) + (cardBox?.width ?? 0)).toBe(true);
    expect((pillBox?.y ?? 0) + (pillBox?.height ?? 0) <= (cardBox?.y ?? 0) + (cardBox?.height ?? 0)).toBe(true);

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
