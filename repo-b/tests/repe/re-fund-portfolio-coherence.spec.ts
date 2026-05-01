/**
 * REPE Fund Portfolio coherence — Playwright spec.
 *
 * Asserts the cross-endpoint coherence contract that the previous three-call
 * stitch could not maintain: header fund count equals primary table row count,
 * no [QUARANTINED] rows render in the primary table, diagnostics panel shows
 * the excluded counterparts, NAV reconciliation strip reads "Reconciled", and
 * the IRR badge is locked to "NAV-weighted, n=N".
 *
 * Plan / gap report: audit/fund_portfolio_coherence/gap_report.md.
 *
 * Requires the dev server running with PLAYWRIGHT_BYPASS_AUTH=1. The new
 * `/api/re/v2/environments/[envId]/fund-portfolio` route returns a deterministic
 * synthetic payload in bypass mode (3 included funds, 2 quarantined).
 */

import { test, expect, type Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

// Serial mode: shares the same dev server / DB pool with other REPE specs.
test.describe.configure({ mode: "serial" });

const ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001";
const QUARTER = "2026Q2";

const SCREENSHOT_DIR = path.join(__dirname, "../../../audit/fund_portfolio_coherence/screenshots");

async function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function gotoPortfolio(page: Page) {
  const url = `/lab/env/${ENV_ID}/re`;
  await page.goto(url);
  // Wait until the data load completes — at least one fund row OR a definitive
  // empty-state message. The KPI selector renders before the fetch resolves,
  // so waiting on it alone observes a transient "—" value.
  await page.waitForSelector("[data-testid='fund-table-row']", { timeout: 30000 });
}

test.describe("REPE Fund Portfolio coherence", () => {
  test.beforeEach(async () => {
    await ensureScreenshotDir();
  });

  test("header fund count equals primary table row count", async ({ page }) => {
    await gotoPortfolio(page);

    const fundCountText = await page
      .locator("[data-testid='kpi-fund-count']")
      .textContent();
    const fundCount = parseInt(fundCountText?.trim() ?? "0", 10);
    expect(fundCount).toBeGreaterThan(0);

    const rowCount = await page.locator("[data-testid='fund-table-row']").count();
    expect(rowCount).toBe(fundCount);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "after_kpi_reconciliation.png"),
      fullPage: false,
    });
  });

  test("primary table contains zero rows whose name carries [QUARANTINED]", async ({ page }) => {
    await gotoPortfolio(page);

    const tableText =
      (await page.locator("[data-testid='re-fund-list']").textContent()) ?? "";
    expect(tableText).not.toContain("[QUARANTINED]");

    // Defensive: each primary row's name does not contain [QUARANTINED]
    const rows = page.locator("[data-testid='fund-table-row']");
    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i++) {
      const text = (await rows.nth(i).textContent()) ?? "";
      expect(text).not.toContain("[QUARANTINED]");
    }
  });

  test("diagnostics panel exists and contains at least one quarantined row", async ({ page }) => {
    await gotoPortfolio(page);

    const panel = page.locator("[data-testid='diagnostics-panel']");
    await expect(panel).toBeVisible();

    // Click to expand (panel defaults collapsed)
    await panel.locator("button").first().click();

    const quarantinedRows = panel.locator("[data-testid='diagnostics-row-quarantined']");
    const count = await quarantinedRows.count();
    expect(count).toBeGreaterThan(0);

    // Every diagnostics row must have a fund name that includes [QUARANTINED]
    for (let i = 0; i < count; i++) {
      const name =
        (await quarantinedRows
          .nth(i)
          .locator("[data-testid='diagnostics-fund-name']")
          .textContent()) ?? "";
      expect(name).toContain("[QUARANTINED]");
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "after_diagnostics_panel.png"),
      fullPage: false,
    });
  });

  test("NAV reconciliation strip reads ✓ Reconciled", async ({ page }) => {
    await gotoPortfolio(page);

    const strip = page.locator("[data-testid='nav-reconciliation']");
    await expect(strip).toBeVisible();

    const status = await strip.getAttribute("data-status");
    expect(status).toBe("reconciled");

    const text = (await strip.textContent()) ?? "";
    expect(text).toContain("Reconciled");
  });

  test("IRR method badge is locked to NAV-weighted, n=N", async ({ page }) => {
    await gotoPortfolio(page);

    const badge = page.locator("[data-testid='irr-method-badge']");
    await expect(badge).toBeVisible();

    const text = (await badge.textContent()) ?? "";
    // Allow either capitalization but require the literal "NAV-weighted, n="
    expect(text).toMatch(/NAV-weighted,\s*n=\d+/);

    // The string "portfolio_irr" must not appear anywhere on the page —
    // the locked label is "nav_weighted_average" and the visible name is
    // "Gross IRR" / "Net IRR" with the method badge.
    const pageContent = await page.content();
    expect(pageContent).not.toContain("portfolio_irr");
  });

  test("trend chart series count equals primary table row count", async ({ page, request }) => {
    // Cleanup PR regression: /fund-trend now joins the canonical
    // re_fund_portfolio_included_funds_v view (and the bypass stub mirrors
    // it), so the chart's fund set must equal the primary table's fund set
    // by construction.
    await gotoPortfolio(page);

    // Read the table row count from the rendered DOM.
    const rowCount = await page.locator("[data-testid='fund-table-row']").count();
    expect(rowCount).toBeGreaterThan(0);

    // Hit the /fund-trend endpoint directly and count the funds[] entries.
    // Direct API check is more robust than scraping recharts SVG because
    // chart series counts are not exposed in the DOM as discrete elements.
    const trendRes = await request.get(
      `/api/re/v2/environments/${ENV_ID}/fund-trend?metric=ending_nav&quarters=4`,
    );
    expect(trendRes.ok()).toBeTruthy();
    const trend = await trendRes.json();

    expect(Array.isArray(trend.funds)).toBe(true);
    expect(trend.funds.length).toBe(rowCount);

    // No quarantined names slip in.
    for (const series of trend.funds) {
      expect(series.name).not.toContain("[QUARANTINED]");
    }

    // Defensive: the chart fund_id set must equal the table fund_id set.
    const tableIds = new Set<string>();
    const tableRows = page.locator("[data-testid='fund-table-row']");
    for (let i = 0; i < rowCount; i++) {
      const id = await tableRows.nth(i).getAttribute("data-fund-id");
      if (id) tableIds.add(id);
    }
    const chartIds = new Set<string>(trend.funds.map((s: { fund_id: string }) => s.fund_id));
    expect(Array.from(chartIds).sort()).toEqual(Array.from(tableIds).sort());
  });

  test("full-page screenshot for the audit receipt", async ({ page }) => {
    await gotoPortfolio(page);
    // Expand diagnostics for the receipt screenshot
    const panel = page.locator("[data-testid='diagnostics-panel']");
    if (await panel.isVisible()) {
      await panel.locator("button").first().click();
    }
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "after_full_page.png"),
      fullPage: true,
    });
  });
});
