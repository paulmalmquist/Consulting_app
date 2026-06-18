import { test, expect } from "@playwright/test";

// Demo-critical route: the "How This Works" architecture & evidence exhibit. The page is static
// (no backend fetch), so this smoke only needs the demo lab session cookie + the route.

const ENV_ID = "telemetry-demo";
const ROUTE = `/lab/env/${ENV_ID}/telemetry/how-it-works`;

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");
  const url = new URL(baseURL);
  await context.addCookies([
    { name: "demo_lab_session", value: "active", domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
});

test("How This Works exhibit renders, surfaces gaps, and deep-links to a real surface", async ({ page }, testInfo) => {
  await page.goto(ROUTE);

  await expect(page.getByRole("heading", { name: "How This Works" })).toBeVisible();

  // honesty: both an implemented status and an explicit "Not available" are on the page
  await expect(page.getByText("Built", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Not available/i).first()).toBeVisible();

  // known gaps surfaced up front
  await expect(page.getByText(/cost guardrail estimates only/i)).toBeVisible();

  // a Built capability deep-links to the real Model Registry route (env-scoped)
  const registryLink = page.getByRole("link", { name: /Model Registry/i }).first();
  await registryLink.scrollIntoViewIfNeeded();
  await expect(registryLink).toHaveAttribute("href", `/lab/env/${ENV_ID}/telemetry/registry`);

  // evidence screenshot — chromium = desktop, webkit (iPhone 14) = mobile.
  // fullPage only for desktop; at 390px the page stacks taller than Playwright's 32767px limit,
  // so the mobile shot is viewport-only (the top of the exhibit as it looks on a phone).
  const variant = /webkit|iphone|mobile/i.test(testInfo.project.name) ? "mobile" : "desktop";
  await page.screenshot({
    path: `../telemetry-platform/docs/screenshots/how-it-works_${variant}.png`,
    fullPage: variant === "desktop",
  });
});
