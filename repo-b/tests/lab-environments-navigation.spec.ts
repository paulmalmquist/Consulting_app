import { test, expect, type Page } from "@playwright/test";

type Env = {
  env_id: string;
  industry: string;
  is_active: boolean;
  created_at?: string;
  status?: string;
};

async function openLabNav(page: Page) {
  const mobileToggle = page.getByTestId("lab-mobile-nav-toggle");
  if (await mobileToggle.isVisible()) {
    await mobileToggle.click();
    await expect(page.getByTestId("lab-mobile-nav-drawer")).toBeVisible();
    return "mobile";
  }

  await expect(page.getByTestId("lab-nav")).toBeVisible();
  return "desktop";
}

async function clickLabNavLink(page: Page, key: string) {
  const navMode = await openLabNav(page);
  await page.locator(`[data-testid="lab-nav-link-${key}"]:visible`).first().click();
  return navMode;
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
      industry: "healthcare",
      is_active: true,
      created_at: "2026-02-10T12:00:00.000Z",
      status: "active",
    },
    {
      env_id: "22222222-2222-4222-8222-222222222222",
      industry: "construction",
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
          industry: payload.industry || "website",
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
});

test("open environment updates selection and keeps it while navigating lab routes", async (
  { page },
  testInfo
) => {
  await page.goto("/lab/environments");
  await expect(page.getByRole("heading", { name: "Lab Environments" })).toBeVisible();

  await expect(page.getByText("Healthcare Provider · 11111111")).toBeVisible();

  await page.getByRole("button", { name: /^Open$/ }).nth(1).click();

  await expect(page).toHaveURL(/\/lab$/);
  await expect(
    page.getByRole("banner").getByText("Construction / Trades · 22222222")
  ).toBeVisible();

  const isMobileProject = /webkit|mobile|iphone|android/i.test(testInfo.project.name);
  const navMode = await clickLabNavLink(page, "metrics");
  if (isMobileProject) {
    expect(navMode).toBe("mobile");
    await expect(page.getByTestId("lab-mobile-nav-drawer")).toBeHidden();
  } else {
    expect(navMode).toBe("desktop");
  }

  await expect(page).toHaveURL(/\/lab\/metrics$/);

  const [metricsRequest] = await Promise.all([
    page.waitForRequest("**/v1/metrics**"),
    page.reload(),
  ]);
  const metricsEnvId = new URL(metricsRequest.url()).searchParams.get("env_id");
  expect(metricsEnvId).toBe("22222222-2222-4222-8222-222222222222");

  await clickLabNavLink(page, "dashboard");
  await expect(page).toHaveURL(/\/lab$/);
  await expect(
    page.getByRole("banner").getByText("Construction / Trades · 22222222")
  ).toBeVisible();
});

test("create environment from industry template and selects it", async ({ page }) => {
  await page.goto("/lab/environments");

  await page.getByRole("button", { name: /Dental Practice/ }).click();
  await page.getByRole("button", { name: "Create Environment" }).click();

  await expect(page.getByText("Environment created and selected.")).toBeVisible();
  await expect(page.getByText("Dental Practice · 33333333")).toBeVisible();
});
