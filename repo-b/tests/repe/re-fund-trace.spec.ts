/**
 * REPE Fund metric trace — Playwright spec.
 *
 * Asserts the contract for the trace surface introduced in the Traceable Fund
 * Metrics milestone:
 *
 *   1. NAV cell on the fund portfolio is a link to /trace/nav.
 *   2. NAV trace page renders asset rows that reconcile to the fund NAV.
 *   3. Gross IRR cell is a link to /trace/gross_irr.
 *   4. Gross IRR trace page renders CF rows when the hash gate matches.
 *   5. Hash-missing fixture renders the lineage_missing surface (no CF rows,
 *      no recomputed value).
 *   6. /trace/dscr renders the "Metric not traceable" page.
 *
 * Plan / receipts: audit/fund_trace/.
 *
 * Requires the dev server running with PLAYWRIGHT_BYPASS_AUTH=1. The
 * /api/re/v2/environments/[envId]/funds/[fundId]/trace/[metricKey] route
 * returns deterministic synthetic payloads keyed on the same fund_ids the
 * fund-portfolio bypass stub emits.
 */

import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001";
const QUARTER = "2026Q2";

// These match repo-b/src/app/api/re/v2/environments/[envId]/fund-portfolio/route.ts.
const FUND_MREF3 = "a1b2c3d4-0001-0010-0001-000000000001";  // hash gate passes
const FUND_IGF7  = "a1b2c3d4-0003-0030-0001-000000000001";  // hash empty → lineage_missing
const FUND_QUARANTINED = "d4560000-0003-0030-0004-000000000001";

async function gotoPortfolio(page: Page) {
  await page.goto(`/lab/env/${ENV_ID}/re`);
  await page.waitForSelector("[data-testid='fund-table-row']", { timeout: 30000 });
}

test.describe("REPE Fund Metric Trace", () => {
  test("NAV cell on the portfolio is a link to /trace/nav and the page renders asset rows", async ({ page }) => {
    await gotoPortfolio(page);

    const navLink = page.locator(`[data-testid='nav-trace-link-${FUND_MREF3}']`);
    await expect(navLink).toHaveCount(1);
    const href = await navLink.getAttribute("href");
    expect(href).toContain(`/funds/${FUND_MREF3}/trace/nav`);
    expect(href).toContain(`quarter=${QUARTER}`);

    await navLink.click();
    await page.waitForSelector("[data-testid='nav-trace-table']", { timeout: 15000 });

    const rowCount = await page.locator("[data-testid='nav-trace-row']").count();
    expect(rowCount).toBeGreaterThan(0);

    const recon = page.locator("[data-testid='nav-reconciliation']");
    const status = await recon.getAttribute("data-status");
    expect(status).toBe("reconciled");
  });

  test("Gross IRR cell on the portfolio is a link to /trace/gross_irr", async ({ page }) => {
    await gotoPortfolio(page);

    const irrLink = page.locator(`[data-testid='irr-trace-link-${FUND_MREF3}']`);
    await expect(irrLink).toHaveCount(1);
    const href = await irrLink.getAttribute("href");
    expect(href).toContain(`/funds/${FUND_MREF3}/trace/gross_irr`);

    await irrLink.click();
    await page.waitForSelector("[data-testid='irr-trace-table']", { timeout: 15000 });

    const rowCount = await page.locator("[data-testid='irr-trace-row']").count();
    expect(rowCount).toBeGreaterThan(0);

    const recon = page.locator("[data-testid='irr-reconciliation']");
    const status = await recon.getAttribute("data-status");
    expect(status).toBe("reconciled");
  });

  test("Gross IRR trace shows lineage_missing when the snapshot has no cf_series_hash", async ({ page }) => {
    await page.goto(
      `/lab/env/${ENV_ID}/re/funds/${FUND_IGF7}/trace/gross_irr?quarter=${QUARTER}`,
    );
    await page.waitForSelector("[data-testid='irr-lineage-missing']", { timeout: 15000 });

    // No CF table rendered when lineage is missing.
    const tableCount = await page.locator("[data-testid='irr-trace-table']").count();
    expect(tableCount).toBe(0);

    const recon = page.locator("[data-testid='irr-reconciliation']");
    const status = await recon.getAttribute("data-status");
    expect(status).toBe("lineage_missing");

    const nullReason = await page
      .locator("[data-testid='irr-trace-null-reason']")
      .textContent();
    expect(nullReason).toContain("source_lineage_missing");
  });

  test("Unsupported metric (DSCR) renders the not-traceable page", async ({ page }) => {
    await page.goto(
      `/lab/env/${ENV_ID}/re/funds/${FUND_MREF3}/trace/dscr?quarter=${QUARTER}`,
    );
    await page.waitForSelector("[data-testid='trace-metric-unsupported']", {
      timeout: 15000,
    });

    const text = (await page
      .locator("[data-testid='trace-metric-unsupported']")
      .textContent()) ?? "";
    expect(text).toContain("Metric not traceable");
  });

  test("Quarantined fund_id 404s into the not-found page", async ({ page }) => {
    await page.goto(
      `/lab/env/${ENV_ID}/re/funds/${FUND_QUARANTINED}/trace/nav?quarter=${QUARTER}`,
    );
    await page.waitForSelector("[data-testid='trace-not-found']", {
      timeout: 15000,
    });

    const text = (await page
      .locator("[data-testid='trace-not-found']")
      .textContent()) ?? "";
    expect(text).toContain("Fund not in portfolio");
  });

  test("NAV trace asset rows are scoped to the fund's audit_run_id (provenance check)", async ({ page }) => {
    await page.goto(
      `/lab/env/${ENV_ID}/re/funds/${FUND_MREF3}/trace/nav?quarter=${QUARTER}`,
    );
    await page.waitForSelector("[data-testid='nav-trace-table']", { timeout: 15000 });

    // Provenance JSON should reference re_authoritative_asset_state_qtr.
    const summary = page.locator("details summary").filter({ hasText: "Provenance" });
    await summary.click();
    const pre = page.locator("details pre").first();
    const text = (await pre.textContent()) ?? "";
    expect(text).toContain("re_authoritative_asset_state_qtr");
    expect(text).toContain("audit_run_id = fund_snapshot.audit_run_id");
  });
});
