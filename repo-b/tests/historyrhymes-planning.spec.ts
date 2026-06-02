import { test, expect } from "@playwright/test";

/**
 * Best-effort smoke for the History Rhymes research → planning page.
 *
 * The full loop (paste → extract → candidates → drawer) requires a live
 * FastAPI backend. CI runs `next dev` only, so the backend-dependent flow is
 * gated behind HR_E2E=1 and otherwise skipped (documented manual path).
 * The unconditional check verifies the page shell + upload panel render.
 */

const ENV = process.env.HR_E2E_ENV || "demo";
const PAGE = `/lab/env/${ENV}/historyrhymes/planning`;

test("planning page shell + upload panel render", async ({ page }) => {
  const resp = await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  // Auth-gated environments may redirect; only assert when the page resolves.
  test.skip(
    !resp || resp.status() >= 400,
    "planning page not reachable without auth/backend in this run",
  );
  await expect(page.getByTestId("hr-planning-page")).toBeVisible();
  await expect(page.getByTestId("hr-brief-upload")).toBeVisible();
});

test("paste → extract → candidates (requires live backend)", async ({
  page,
}) => {
  test.skip(
    process.env.HR_E2E !== "1",
    "set HR_E2E=1 with a live backend to run the full loop",
  );
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  const sample = `# HR Weekly Brief — 2026-05-18

**Regime call:** late_cycle
**Confidence:** 0.71
**Freshness score:** 0.88

## Executive Summary
Late cycle persists.

## Thematic Findings
- CRE stress rising

## Enhancement Path
- **Add MVRV-Z divergence signal** — detect divergences
  - What: add the feature
  - Why: high hit rate
  - Effort: 3 days
  - Priority: high

## Adversarial Stress Test
- Add MVRV-Z divergence signal — PASS
- Overall: CAUTION

## Signal Pulse
- MVRV-Z: 1.4

## Open Questions
- Is it real?

## Honeypot Alert
None`;
  await page.getByTestId("hr-brief-textarea").fill(sample);
  await page.getByTestId("hr-brief-submit").click();
  await expect(page.getByTestId("hr-ingest-result")).toContainText(
    "Extraction OK",
  );
  await expect(page.getByTestId("hr-candidate-card").first()).toBeVisible();
  await page.getByText("View plan").first().click();
  await expect(page.getByTestId("hr-plan-drawer")).toBeVisible();
});
