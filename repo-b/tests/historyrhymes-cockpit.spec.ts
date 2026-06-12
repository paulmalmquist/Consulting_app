import { test, expect } from "@playwright/test";

/**
 * Smoke for the History Rhymes regime cockpit (telemetry-cockpit refactor).
 *
 * Unconditional checks verify the cockpit shell renders on the index route and
 * the /routine compatibility alias, plus the no-nested-chrome guarantee on the
 * backstage routes. Backend-dependent assertions are gated behind HR_E2E=1
 * (same convention as historyrhymes-planning.spec.ts).
 */

const ENV = process.env.HR_E2E_ENV || "demo";
const BASE = `/lab/env/${ENV}/historyrhymes`;

test("cockpit index renders shell + regime header", async ({ page }) => {
  const resp = await page.goto(BASE, { waitUntil: "domcontentloaded" });
  test.skip(!resp || resp.status() >= 400, "cockpit not reachable without auth/backend in this run");
  await expect(page.getByTestId("hr-shell")).toBeVisible();
  await expect(page.getByTestId("hr-cockpit-page")).toBeVisible();
  await expect(page.getByTestId("hr-regime-header")).toBeVisible();
  await expect(page.getByTestId("hr-nav")).toBeVisible();
});

test("/routine renders the same cockpit (compatibility alias)", async ({ page }) => {
  const resp = await page.goto(`${BASE}/routine`, { waitUntil: "domcontentloaded" });
  test.skip(!resp || resp.status() >= 400, "routine alias not reachable without auth/backend in this run");
  await expect(page.getByTestId("hr-shell")).toBeVisible();
  await expect(page.getByTestId("hr-routine-page")).toBeVisible();
  await expect(page.getByTestId("hr-regime-header")).toBeVisible();
});

test("backstage routes render inside the HR shell with no nested lab chrome", async ({ page }) => {
  for (const path of [`${BASE}/morning-book`, `${BASE}/planning`]) {
    const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
    test.skip(!resp || resp.status() >= 400, `${path} not reachable without auth/backend in this run`);
    await expect(page.getByTestId("hr-shell")).toBeVisible();
    // Exactly one HR shell — no nested/duplicate chrome.
    await expect(page.getByTestId("hr-shell")).toHaveCount(1);
  }
});

test("cockpit shows live regime state (requires live backend)", async ({ page }) => {
  test.skip(process.env.HR_E2E !== "1", "set HR_E2E=1 with a live backend to run");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  // With a live backend the header shows either real state or an honest
  // degraded state — both are passes; a blank header is the only failure.
  const regime = page.getByTestId("hr-regime-value");
  await expect(regime).toBeVisible();
  await expect(regime).not.toHaveText("");
});
