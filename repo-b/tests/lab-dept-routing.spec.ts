import { test, expect } from "@playwright/test";

const ENV_ID = "11111111-1111-4111-8111-111111111111";

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

  await page.route("**/v1/environments", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: {
          environments: [
            {
              env_id: ENV_ID,
              client_name: "NoVendor",
              industry: "healthcare",
              is_active: true,
              created_at: "2026-02-10T12:00:00.000Z",
              status: "active",
            },
          ],
        },
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/v1/metrics**", async (route) => {
    await route.fulfill({
      json: {
        uploads_count: 2,
        tickets_count: 3,
        pending_approvals: 1,
        approval_rate: 0.8,
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

test("redirects /lab/env/:envId to default dept route", async ({ page }) => {
  await page.goto("/lab/environments");
  await page.evaluate((envId) => {
    window.localStorage.removeItem(`lab:lastDept:${envId}`);
    window.localStorage.removeItem("lab_active_env_id");
    window.localStorage.removeItem("demo_lab_env_id");
    window.localStorage.removeItem("lab_user_role");
  }, ENV_ID);
  await page.goto(`/lab/env/${ENV_ID}`);
  await expect(page).toHaveURL(new RegExp(`/lab/env/${ENV_ID}/dept/operations$`));
});

test("redirects /lab/env/:envId to stored last dept when valid", async ({ page }) => {
  await page.goto("/lab/environments");
  await page.evaluate((envId) => {
    window.localStorage.removeItem("lab_active_env_id");
    window.localStorage.removeItem("demo_lab_env_id");
    window.localStorage.removeItem("lab_user_role");
    window.localStorage.setItem(`lab:lastDept:${envId}`, "accounting");
  }, ENV_ID);
  await page.goto(`/lab/env/${ENV_ID}`);
  await expect(page).toHaveURL(new RegExp(`/lab/env/${ENV_ID}/dept/accounting$`));
});

test("invalid dept key redirects deterministically to default dept", async ({ page }) => {
  await page.goto(`/lab/env/${ENV_ID}/dept/not-a-real-dept`);
  await expect(page).toHaveURL(new RegExp(`/lab/env/${ENV_ID}/dept/operations$`));
});

test("clicking department updates URL, selected state, sidebar, and back/forward", async ({ page }) => {
  await page.goto(`/lab/env/${ENV_ID}/dept/operations`);

  const accountingTab = page.locator('[data-testid="dept-tab-accounting"]:visible').first();
  await accountingTab.click();
  await expect(page).toHaveURL(new RegExp(`/lab/env/${ENV_ID}/dept/accounting$`));
  await expect(accountingTab).toHaveAttribute("aria-current", "page");
  await expect(accountingTab).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("lab-sidebar")).toContainText("General Ledger");

  const lastDept = await page.evaluate((envId) => {
    return window.localStorage.getItem(`lab:lastDept:${envId}`);
  }, ENV_ID);
  expect(lastDept).toBe("accounting");

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/lab/env/${ENV_ID}/dept/operations$`));
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/lab/env/${ENV_ID}/dept/accounting$`));
});

test("mobile drawer department selection navigates and closes drawer", async ({ page }) => {
  await page.goto(`/lab/env/${ENV_ID}/dept/operations`);
  const mobileToggle = page.getByTestId("lab-env-sidebar-toggle");
  if (!(await mobileToggle.isVisible())) return;

  await mobileToggle.click();
  await expect(page.getByTestId("lab-env-sidebar-drawer")).toBeVisible();
  await page.getByTestId("drawer-dept-tab-accounting").click();
  await expect(page.getByTestId("lab-env-sidebar-drawer")).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/lab/env/${ENV_ID}/dept/accounting$`));
});
