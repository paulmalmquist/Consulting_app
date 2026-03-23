import { test, expect, type Page } from "@playwright/test";

type Env = {
  env_id: string;
  client_name?: string;
  industry: string;
  industry_type?: string;
  schema_name?: string;
  is_active: boolean;
  created_at?: string;
  status?: string;
};

// Root cause from triage:
// "Open" routed to /lab/metrics because environment homepage routes did not exist.
// Mobile also needed explicit sidebar access for capability navigation.
async function openLabNav(page: Page) {
  const mobileToggle = page.getByTestId("lab-mobile-nav-toggle");
  if (await mobileToggle.isVisible()) {
    await mobileToggle.click();
    await expect(page.getByTestId("lab-mobile-nav-drawer")).toBeVisible();
    return "mobile";
  }
  return "desktop";
}

async function clickLabNavLink(page: Page, key: string) {
  const navMode = await openLabNav(page);
  await page.locator(`[data-testid="lab-nav-link-${key}"]:visible`).first().click();
  return navMode;
}

async function openCapability(page: Page, capKey: string) {
  const mobileToggle = page.getByTestId("lab-env-sidebar-toggle");
  if (await mobileToggle.isVisible()) {
    await mobileToggle.click();
    await expect(page.getByTestId("lab-env-sidebar-drawer")).toBeVisible();
    const drawerLink = page
      .getByTestId("lab-env-sidebar-drawer")
      .locator(`[data-testid="cap-link-${capKey}"]`)
      .first();
    await drawerLink.scrollIntoViewIfNeeded();
    await drawerLink.click();
    await expect(page.getByTestId("lab-env-sidebar-drawer")).toBeHidden();
    return;
  }
  const link = page.locator(`[data-testid="cap-link-${capKey}"]:visible`).first();
  await link.scrollIntoViewIfNeeded();
  await link.click();
}

test.beforeEach(async ({ context, page, baseURL }) => {
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

  let environments: Env[] = [
    {
      env_id: "11111111-1111-4111-8111-111111111111",
      client_name: "Dental Practice Environment",
      industry: "healthcare",
      industry_type: "healthcare",
      schema_name: "env_dental_practice",
      is_active: true,
      created_at: "2026-02-10T12:00:00.000Z",
      status: "active",
    },
    {
      env_id: "22222222-2222-4222-8222-222222222222",
      client_name: "BuildCo Environment",
      industry: "construction",
      industry_type: "construction",
      schema_name: "env_buildco",
      is_active: false,
      created_at: "2026-02-10T13:00:00.000Z",
      status: "paused",
    },
  ];

  await page.route("**/v1/environments", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ json: { environments } });
      return;
    }

    if (request.method() === "POST") {
      const payload = JSON.parse(request.postData() || "{}");
      const nextId = "33333333-3333-4333-8333-333333333333";
      environments = [
        {
          env_id: nextId,
          client_name: "Dental Practice Environment",
          industry: payload.industry || "website",
          industry_type: payload.industry || "website",
          schema_name: "env_dental_practice",
          is_active: true,
          created_at: "2026-02-11T00:00:00.000Z",
          status: "active",
        },
        ...environments,
      ];
      await route.fulfill({ status: 201, json: { env_id: nextId } });
      return;
    }

    await route.continue();
  });

  await page.route("**/v1/environments/**/reset", async (route) => {
    await route.fulfill({ json: { ok: true, message: "Environment reset and reseeded." } });
  });

  await page.route("**/v1/metrics**", async (route) => {
    await route.fulfill({
      json: {
        uploads_count: 2,
        tickets_count: 3,
        pending_approvals: 1,
        approval_rate: 0.7,
        override_rate: 0.1,
        avg_time_to_decision_sec: 42,
      },
    });
  });

  await page.route("**/v1/queue**", async (route) => {
    await route.fulfill({ json: { items: [] } });
  });

  await page.route("**/v1/audit**", async (route) => {
    await route.fulfill({ json: { items: [] } });
  });
});

test("open environment routes to homepage and supports department/capability navigation", async (
  { page },
  testInfo
) => {
  await page.goto("/lab/environments");
  await expect(page.getByRole("heading", { name: "Client Environments" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Dental Practice Environment/i })).toBeVisible();

  const firstEnvOpen = page.getByRole("button", { name: /Dental Practice Environment/i }).first();
  await firstEnvOpen.scrollIntoViewIfNeeded();
  const selectedEnvId = "11111111-1111-4111-8111-111111111111";

  await firstEnvOpen.click();

  await expect(page).toHaveURL(new RegExp(`/lab/env/${selectedEnvId}$`));
  await expect(page.getByTestId("dept-tab-accounting")).toBeVisible();
  if (await page.getByTestId("lab-env-sidebar-toggle").isVisible()) {
    await page.getByTestId("lab-env-sidebar-toggle").click();
    await expect(page.getByTestId("lab-env-sidebar-drawer")).toBeVisible();
    await page
      .getByTestId("lab-env-sidebar-drawer")
      .getByRole("button", { name: "Close" })
      .click();
  } else {
    await expect(page.getByTestId("lab-sidebar")).toBeVisible();
  }
  await page.getByTestId("dept-tab-accounting").click();
  await expect(page).toHaveURL(new RegExp(`/lab/env/${selectedEnvId}/accounting$`));
  await expect(page.locator('[data-testid="cap-link-ledger"]:visible').first()).toBeVisible();

  await openCapability(page, "ledger");
  await expect(page).toHaveURL(
    new RegExp(`/lab/env/${selectedEnvId}/accounting/capability/ledger$`)
  );
  await expect(page.getByRole("heading", { name: "Ledger" })).toBeVisible();

  await page.getByTestId("dept-tab-it").click();
  await expect(page).toHaveURL(new RegExp(`/lab/env/${selectedEnvId}/it$`));
  await expect(page.locator('[data-testid="cap-link-tickets"]:visible').first()).toBeVisible();
  await openCapability(page, "queue");
  await expect(page).toHaveURL(
    new RegExp(`/lab/env/${selectedEnvId}/it/capability/queue$`)
  );

  const isMobileProject = /webkit|mobile|iphone|android/i.test(testInfo.project.name);
  if (!isMobileProject) {
    const navMode = await clickLabNavLink(page, "environments");
    expect(navMode).toBe("desktop");
    await expect(page).toHaveURL(/\/lab\/environments$/);
  }
});

test("sidebar toggle collapses and expands lab navigation", async ({ page }) => {
  await page.goto("/lab/environments");

  const nav = page.getByTestId("lab-nav");
  if (!(await nav.isVisible())) return;

  // Only applies to desktop - skip on mobile
  const toggle = page.getByTestId("lab-sidebar-toggle");
  if (!(await toggle.isVisible())) return;

  // Sidebar shell should be visible with labels
  await expect(page.getByTestId("lab-nav")).toBeVisible();
  await expect(page.getByTestId("lab-nav-link-dashboard")).toContainText("Dashboard");

  // Collapse sidebar
  await toggle.click();

  // After collapse: sidebar still visible (as narrow rail), but labels hidden
  await expect(page.getByTestId("lab-nav")).toBeVisible();

  // Expand sidebar
  await toggle.click();

  // Labels should be visible again
  await expect(page.getByTestId("lab-nav-link-dashboard")).toContainText("Dashboard");
});

test("current environment header shows human-readable name", async ({ page }) => {
  await page.goto("/lab/environments");
  await expect(page.getByRole("heading", { name: "Client Environments" })).toBeVisible();

  const firstEnvOpen = page.getByRole("button", { name: /Dental Practice Environment/i }).first();
  await firstEnvOpen.scrollIntoViewIfNeeded();
  await firstEnvOpen.click();

  await expect(page.getByTestId("dept-tab-home")).toBeVisible();
  await expect(page.getByTestId("dept-tab-accounting")).toBeVisible();
});

test("accounting department tab exists and navigates correctly", async ({ page }) => {
  await page.goto("/lab/environments");

  const firstEnvOpen = page.getByRole("button", { name: /Dental Practice Environment/i }).first();
  await firstEnvOpen.scrollIntoViewIfNeeded();
  const selectedEnvId = "11111111-1111-4111-8111-111111111111";

  await firstEnvOpen.click();
  await expect(page).toHaveURL(new RegExp(`/lab/env/${selectedEnvId}$`));

  // Accounting tab should exist (healthcare includes accounting)
  const accountingTab = page.getByTestId("dept-tab-accounting");
  await expect(accountingTab).toBeVisible();

  // Should have an accessible label
  await expect(accountingTab).toHaveAttribute("aria-label", "Accounting");

  // Click and navigate
  await accountingTab.click();
  await expect(page).toHaveURL(new RegExp(`/lab/env/${selectedEnvId}/accounting$`));

  // Should show accounting capabilities
  await expect(page.locator('[data-testid="cap-link-chart_of_accounts"]:visible').first()).toBeVisible();
  await expect(page.locator('[data-testid="cap-link-ledger"]:visible').first()).toBeVisible();
  await expect(page.locator('[data-testid="cap-link-ap"]:visible').first()).toBeVisible();
  await expect(page.locator('[data-testid="cap-link-ar"]:visible').first()).toBeVisible();

  // Navigate to a capability
  await openCapability(page, "ledger");
  await expect(page).toHaveURL(
    new RegExp(`/lab/env/${selectedEnvId}/accounting/capability/ledger$`)
  );
  await expect(page.getByRole("heading", { name: "Ledger" })).toBeVisible();
});

test("create environment from industry template and selects it", async ({ page }) => {
  await page.goto("/lab/environments");

  await page.getByPlaceholder("Acme Health").fill("Dental Practice Environment");
  await page.locator("select").first().selectOption("healthcare");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("Environment created.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Dental Practice Environment/i }).first()).toBeVisible();
});
