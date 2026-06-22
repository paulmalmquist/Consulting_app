import { test, expect } from "@playwright/test";

// Demo-critical route: the "How This Works" exhibit, now led by the Flow Explorer (v2).
// Static page (no backend fetch) — needs only the demo lab session cookie + the route.

const ENV_ID = "telemetry-demo";
const ROUTE = `/lab/env/${ENV_ID}/telemetry/how-it-works`;

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");
  const url = new URL(baseURL);
  await context.addCookies([
    { name: "demo_lab_session", value: "active", domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
});

test("Flow Explorer renders, scenario selection works, ledger is collapsible, deep-link intact", async ({ page }, testInfo) => {
  await page.goto(ROUTE);

  await expect(page.getByRole("heading", { name: "How This Works" })).toBeVisible();

  // Flow Explorer + the static-trace honesty disclaimer (no overclaiming of live execution).
  await expect(page.getByText("Static trace", { exact: true })).toBeVisible(); // the badge (caption also contains it)
  await expect(page.getByText(/No live call is made/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Aggregate count answer/i })).toBeVisible();

  // v2 evidence screenshot in the default (aggregate) scenario — chromium=desktop, webkit=mobile.
  const variant = /webkit|iphone|mobile/i.test(testInfo.project.name) ? "mobile" : "desktop";
  await page.screenshot({ path: `../telemetry-platform/docs/screenshots/flow-explorer_${variant}.png`, fullPage: variant === "desktop" });

  // Scenario selection swaps the trace packet (aggregate → anomaly verdict).
  await expect(page.getByText(/inventory_counts/i).first()).toBeVisible();
  await page.getByRole("button", { name: /Anomaly verdict/i }).click();
  await expect(page.getByText(/score_window/i).first()).toBeVisible();

  // The proof ledger is collapsed by default → expand it; the Model Registry deep-link is still there.
  await page.locator("summary").filter({ hasText: /Proof ledger/i }).click();
  const registryLink = page.getByRole("link", { name: /Model Registry/i }).first();
  await registryLink.scrollIntoViewIfNeeded();
  await expect(registryLink).toHaveAttribute("href", `/lab/env/${ENV_ID}/telemetry/registry`);
});
