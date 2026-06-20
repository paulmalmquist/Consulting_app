import { test, expect } from "@playwright/test";

/**
 * History Rhymes research → planning smoke tests (PR 14).
 *
 * Upload moved from /planning to /research. Unconditional checks verify the
 * page shell + upload panel at /research and the candidates shell at /planning.
 * The full ingest-and-promote loop (HR_E2E=1) uploads on /research, then
 * asserts candidates appear on /planning.
 */

const ENV = process.env.HR_E2E_ENV || "demo";
const RESEARCH_PAGE = `/lab/env/${ENV}/historyrhymes/research`;
const PLANNING_PAGE = `/lab/env/${ENV}/historyrhymes/planning`;

// ── unconditional shell smokes ────────────────────────────────────────────────

test("research page shell + upload panel render", async ({ page }) => {
  const resp = await page.goto(RESEARCH_PAGE, { waitUntil: "domcontentloaded" });
  test.skip(
    !resp || resp.status() >= 400,
    "research page not reachable without auth/backend in this run",
  );
  await expect(page.getByTestId("hr-research-page")).toBeVisible();
  await expect(page.getByTestId("hr-brief-upload")).toBeVisible();
});

test("planning page shell renders without upload panel", async ({ page }) => {
  const resp = await page.goto(PLANNING_PAGE, { waitUntil: "domcontentloaded" });
  test.skip(
    !resp || resp.status() >= 400,
    "planning page not reachable without auth/backend in this run",
  );
  await expect(page.getByTestId("hr-planning-page")).toBeVisible();
  // Upload was demoted to /research — must NOT appear on /planning.
  await expect(page.getByTestId("hr-brief-upload")).not.toBeVisible();
});

// ── full ingest loop: upload on /research, candidates on /planning ────────────

test("paste on /research → extract → candidates on /planning (requires live backend)", async ({
  page,
}) => {
  test.skip(
    process.env.HR_E2E !== "1",
    "set HR_E2E=1 with a live backend to run the full loop",
  );

  await page.goto(RESEARCH_PAGE, { waitUntil: "domcontentloaded" });

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

  // Navigate to /planning — candidates should now appear.
  await page.goto(PLANNING_PAGE, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("hr-candidate-card").first()).toBeVisible();
  await page.getByText("View plan").first().click();
  await expect(page.getByTestId("hr-plan-drawer")).toBeVisible();
});
