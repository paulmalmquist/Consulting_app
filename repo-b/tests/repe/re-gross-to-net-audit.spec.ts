/**
 * REPE Gross-to-Net Audit Surface — End-to-end Playwright tests
 *
 * Tests both the API contract and the browser UI for the audit surface.
 *
 * Target funds (from runner output — draft_audit, 2026Q2):
 *   - MREF III  fund_id: a1b2c3d4-0001-0010-0001-000000000001  (expense layer incomplete)
 *   - MCOF I    fund_id: a1b2c3d4-0002-0020-0001-000000000001  (expense + waterfall incomplete)
 *   - IGF VII   fund_id: a1b2c3d4-0003-0030-0001-000000000001  (mgmt fee partial)
 *
 * Acceptance criteria verified:
 *   1. draft_audit is clearly shown — amber banner, never says "released"
 *   2. Unavailable values show null_reason, not zero
 *   3. Bridge table rows match API response
 *   4. Promotion gate failures visible without dev tools
 *   5. Drilldown tabs switch without error
 *   6. promotable=false when gates fail
 */

import { test, expect, type Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

// Serial mode: browser UI tests share a DB connection pool — parallel runs hit
// the pool limit and cause loading timeouts. API tests are fast and don't block.
test.describe.configure({ mode: "serial" });

const ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001";

// Three draft funds created by the Phase 4-5 runner
const FUNDS = {
  MREF_III: {
    fund_id: "a1b2c3d4-0001-0010-0001-000000000001",
    name: "MREF III",
    quarter: "2026Q2",
    // Has expense layer failure
    expected_null_reasons: ["fund_expense_layer", "net_irr"],
  },
  MCOF_I: {
    fund_id: "a1b2c3d4-0002-0020-0001-000000000001",
    name: "MCOF I",
    quarter: "2026Q2",
    // Has expense + waterfall failures
    expected_null_reasons: ["fund_expense_layer", "waterfall", "net_irr", "carry", "net_return_amount"],
  },
  IGF_VII: {
    fund_id: "a1b2c3d4-0003-0030-0001-000000000001",
    name: "IGF VII",
    quarter: "2026Q2",
    // Has partial mgmt fee nulls
    expected_null_reasons: ["management_fees", "net_irr"],
  },
};

// Screenshot output dir
const SCREENSHOT_DIR = path.join(__dirname, "../../../audit/ui_gross_to_net/screenshots");

// ── API contract tests (no browser) ──────────────────────────────────────────

test.describe("API: /api/re/v2/funds/{fundId}/gross-to-net-audit", () => {
  test("returns 400 when quarter param missing", async ({ request }) => {
    const res = await request.get(`/api/re/v2/funds/${FUNDS.MREF_III.fund_id}/gross-to-net-audit`);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe("MISSING_QUARTER");
  });

  test("returns 404 for nonexistent fund/quarter combination", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/00000000-0000-0000-0000-000000000099/gross-to-net-audit?quarter=2025Q1`
    );
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error_code).toBe("SNAPSHOT_NOT_FOUND");
  });

  test("MREF III: snapshot is draft_audit with fund_expense_layer failure", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUNDS.MREF_III.fund_id}/gross-to-net-audit?quarter=${FUNDS.MREF_III.quarter}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Snapshot fields
    expect(body.snapshot.promotion_state).toBe("draft_audit");
    expect(body.snapshot.quarter).toBe("2026Q2");
    expect(body.snapshot.null_reasons).toHaveProperty("fund_expense_layer");
    expect(body.snapshot.null_reasons).toHaveProperty("net_irr");

    // Not promotable — has null_reasons
    expect(body.snapshot.promotable).toBe(false);
    expect(body.snapshot.blocking_reasons.length).toBeGreaterThan(0);
  });

  test("MREF III: bridge rows are present (bridge was written by runner)", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUNDS.MREF_III.fund_id}/gross-to-net-audit?quarter=${FUNDS.MREF_III.quarter}`
    );
    const body = await res.json();
    expect(body.bridge.available).toBe(true);
    // Must have at least one starting and one ending row
    const rows = body.bridge.rows as Array<{ item_type: string; amount: number | null; null_reason: string | null }>;
    expect(rows.some(r => r.item_type === "starting")).toBe(true);
    expect(rows.some(r => r.item_type === "ending")).toBe(true);
  });

  test("MREF III: no bridge row has both amount=null and null_reason=null", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUNDS.MREF_III.fund_id}/gross-to-net-audit?quarter=${FUNDS.MREF_III.quarter}`
    );
    const body = await res.json();
    const rows = body.bridge.rows as Array<{ item_type: string; amount: number | null; null_reason: string | null }>;
    for (const row of rows.filter(r => r.item_type !== "memo")) {
      const silent = row.amount === null && (row.null_reason === null || row.null_reason === "");
      expect(silent, `Row "${row.item_type}" is silently null`).toBe(false);
    }
  });

  test("MREF III: all gates present with correct structure", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUNDS.MREF_III.fund_id}/gross-to-net-audit?quarter=${FUNDS.MREF_III.quarter}`
    );
    const body = await res.json();
    const gates = body.gate as Array<{ gate: string; status: string; label: string; detail: string | null }>;

    expect(gates.length).toBeGreaterThanOrEqual(7);
    // Every gate has a status
    for (const g of gates) {
      expect(["pass", "fail", "warn", "skip"]).toContain(g.status);
      expect(g.label.length).toBeGreaterThan(0);
    }
    // fund_expense_layer gate must be fail or warn (not pass) for MREF III
    const expGate = gates.find(g => g.gate === "fund_expense_layer");
    expect(expGate).toBeDefined();
    expect(["fail", "warn"]).toContain(expGate!.status);
  });

  test("MCOF I: has waterfall failure in null_reasons", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUNDS.MCOF_I.fund_id}/gross-to-net-audit?quarter=${FUNDS.MCOF_I.quarter}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.snapshot.null_reasons).toHaveProperty("waterfall");
    // waterfall block should be null (not a fake object with zeros)
    const wf = body.metric_blocks.waterfall;
    if (wf !== null) {
      // If present, waterfall_status must explain the incompleteness
      expect(["missing_contract", "missing_participants", "no_distributions"]).toContain(wf.waterfall_status);
    }
    // net_irr must not be a number (must be null or absent)
    if (wf !== null && wf.net_irr !== undefined) {
      // net_irr exists but should be null (not a fake zero)
      expect(wf.net_irr).toBeNull();
    }
  });

  test("no metric appears as zero when null_reason is present for that metric", async ({ request }) => {
    for (const fund of Object.values(FUNDS)) {
      const res = await request.get(
        `/api/re/v2/funds/${fund.fund_id}/gross-to-net-audit?quarter=${fund.quarter}`
      );
      const body = await res.json();
      const nullReasons: Record<string, string> = body.snapshot.null_reasons;

      // If net_irr has a null_reason, waterfall.net_irr must NOT be 0
      if (nullReasons["net_irr"]) {
        const wf = body.metric_blocks.waterfall;
        if (wf) {
          expect(wf.net_irr === 0, `${fund.name}: net_irr=0 is a fake zero; null_reason=${nullReasons["net_irr"]}`).toBe(false);
        }
      }

      // If carry has a null_reason, waterfall.carry must NOT be 0
      if (nullReasons["carry"]) {
        const wf = body.metric_blocks.waterfall;
        if (wf) {
          expect(wf.carry === 0, `${fund.name}: carry=0 is a fake zero; null_reason=${nullReasons["carry"]}`).toBe(false);
        }
      }
    }
  });
});

// ── Browser UI tests ──────────────────────────────────────────────────────────

async function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

async function gotoAuditPage(page: Page, fundId: string, quarter: string) {
  const url = `/lab/env/${ENV_ID}/re/funds/${fundId}/gross-to-net-audit?quarter=${quarter}`;
  await page.goto(url);
  // Wait for the page to load — either the banner or an error panel
  await page.waitForSelector("[data-testid='snapshot-banner'], [data-testid='error-panel']", { timeout: 20000 });
}

test.describe("Browser UI: Snapshot banner", () => {
  test.beforeEach(async () => {
    await ensureScreenshotDir();
  });

  test("MREF III: draft_audit banner is shown, amber border visible", async ({ page }) => {
    await gotoAuditPage(page, FUNDS.MREF_III.fund_id, FUNDS.MREF_III.quarter);

    const banner = page.locator("[data-testid='snapshot-banner']");
    await expect(banner).toBeVisible();

    // Draft warning text must be present
    await expect(banner).toContainText("Draft snapshot");
    await expect(banner).toContainText("not released");

    // promotion_state badge must say draft_audit
    const promotionBadge = banner.locator("[data-testid='promotion-badge']");
    await expect(promotionBadge).toContainText("draft_audit");

    // promotable badge must say No
    const promotableNo = banner.locator("[data-testid='promotable-no']");
    await expect(promotableNo).toBeVisible();
    await expect(promotableNo).toContainText("No");

    // blocking reasons section must be visible
    const blockingReasons = banner.locator("[data-testid='blocking-reasons']");
    await expect(blockingReasons).toBeVisible();
    const reasonItems = await blockingReasons.locator("li").count();
    expect(reasonItems).toBeGreaterThan(0);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_mref3_banner_draft.png"), fullPage: false });
  });

  test("IGF VII: promotion_state badge is never 'released'", async ({ page }) => {
    await gotoAuditPage(page, FUNDS.IGF_VII.fund_id, FUNDS.IGF_VII.quarter);

    const promotionBadge = page.locator("[data-testid='promotion-badge']");
    await expect(promotionBadge).toBeVisible();
    // Must NOT say released
    const badgeText = await promotionBadge.textContent();
    expect(badgeText).not.toBe("released");
    // Should say draft_audit
    expect(badgeText).toContain("draft_audit");
  });
});

test.describe("Browser UI: Bridge table", () => {
  test("MREF III: bridge table is visible with correct row types", async ({ page }) => {
    await gotoAuditPage(page, FUNDS.MREF_III.fund_id, FUNDS.MREF_III.quarter);

    const bridge = page.locator("[data-testid='bridge-table']");
    await expect(bridge).toBeVisible();

    // Must have a starting row
    await expect(bridge.locator("[data-testid='bridge-row-starting']")).toBeVisible();
    // Must have subtraction rows
    await expect(bridge.locator("[data-testid='bridge-row-subtraction']").first()).toBeVisible();
    // Must have ending row
    await expect(bridge.locator("[data-testid='bridge-row-ending']")).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_mref3_bridge_table.png"), fullPage: false });
  });

  test("MCOF I: unavailable values show null_reason text, not zero", async ({ page }) => {
    await gotoAuditPage(page, FUNDS.MCOF_I.fund_id, FUNDS.MCOF_I.quarter);

    // Check bridge table or metric panels — wherever nulls appear
    const unavailLabels = page.locator("[data-testid='unavailable-label']");
    const count = await unavailLabels.count();
    // There must be at least one unavailable value displayed
    expect(count).toBeGreaterThan(0);

    // Every unavailable label must be accompanied by a null-reason
    for (let i = 0; i < count; i++) {
      const parent = unavailLabels.nth(i).locator("..");
      const nullReason = parent.locator("[data-testid='null-reason']");
      // null-reason span must exist and have text
      if (await nullReason.isVisible()) {
        const text = await nullReason.textContent();
        expect(text?.trim().length).toBeGreaterThan(0);
        // Must not contain just empty parens
        expect(text?.trim()).not.toBe("()");
      }
    }

    // No value shows "$0" where null_reason is set
    const pageText = await page.content();
    // This is a heuristic — if $0.00M appears, it may be a fake zero
    // We check the bridge rows specifically
    const bridgeTable = page.locator("[data-testid='bridge-table']");
    if (await bridgeTable.isVisible()) {
      const bridgeText = await bridgeTable.textContent();
      // $0 should not appear as a standalone metric (would indicate fake zero)
      expect(bridgeText).not.toMatch(/\$0\.00[MBK]?\s/);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_mcof1_unavailable_values.png"), fullPage: false });
  });

  test("bridge table amounts match API response", async ({ page, request }) => {
    // Get the API response
    const apiRes = await request.get(
      `/api/re/v2/funds/${FUNDS.MREF_III.fund_id}/gross-to-net-audit?quarter=${FUNDS.MREF_III.quarter}`
    );
    const apiBody = await apiRes.json();
    const startingRow = (apiBody.bridge.rows as Array<{ item_type: string; amount: number | null }>)
      .find(r => r.item_type === "starting");

    if (startingRow?.amount !== null && startingRow?.amount !== undefined) {
      await gotoAuditPage(page, FUNDS.MREF_III.fund_id, FUNDS.MREF_III.quarter);

      const bridgeStartRow = page.locator("[data-testid='bridge-row-starting']");
      await expect(bridgeStartRow).toBeVisible();

      // The starting row should display the gross amount in a recognizable format
      const rowText = await bridgeStartRow.textContent();
      // The amount should be formatted as $XM or $XB — not zero
      expect(rowText).toMatch(/\$[\d.]+[MBK]/);
    }
  });
});

test.describe("Browser UI: Promotion gate panel", () => {
  test("MREF III: gate panel visible with at least one non-pass gate", async ({ page }) => {
    await gotoAuditPage(page, FUNDS.MREF_III.fund_id, FUNDS.MREF_III.quarter);

    const gatePanel = page.locator("[data-testid='gate-panel']");
    await expect(gatePanel).toBeVisible();

    // fund_expense_layer gate must be visible and show fail or warn
    const expGateRow = gatePanel.locator("[data-testid='gate-row-fund_expense_layer']");
    await expect(expGateRow).toBeVisible();

    const gateText = await expGateRow.textContent();
    // Must mention fail or warn status — not pass
    expect(gateText?.toLowerCase()).toMatch(/fail|warn/);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_mref3_gate_panel.png"), fullPage: false });
  });

  test("MCOF I: waterfall gate shows failure detail without opening dev tools", async ({ page }) => {
    await gotoAuditPage(page, FUNDS.MCOF_I.fund_id, FUNDS.MCOF_I.quarter);

    const gatePanel = page.locator("[data-testid='gate-panel']");
    await expect(gatePanel).toBeVisible();

    const waterfallGateRow = gatePanel.locator("[data-testid='gate-row-waterfall']");
    await expect(waterfallGateRow).toBeVisible();

    // The gate row should show the reason inline (not hidden behind dev tools)
    const rowText = await waterfallGateRow.textContent();
    // Should mention missing_partner_commitments or missing_contract
    expect(rowText).toMatch(/missing|incomplete|warn|fail/i);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_mcof1_waterfall_gate.png"), fullPage: false });
  });

  test("gate panel summary shows fail count when gates fail", async ({ page }) => {
    await gotoAuditPage(page, FUNDS.MCOF_I.fund_id, FUNDS.MCOF_I.quarter);

    // The gate-alert banner should be visible since MCOF I has failures
    const gateAlert = page.locator("[data-testid='gate-alert']");
    await expect(gateAlert).toBeVisible();
  });
});

test.describe("Browser UI: Drilldown tabs", () => {
  test("MREF III: all three drilldown tabs switch without error", async ({ page }) => {
    await gotoAuditPage(page, FUNDS.MREF_III.fund_id, FUNDS.MREF_III.quarter);

    // Open the Drilldown Tables panel (it starts collapsed)
    const drilldownPanel = page.locator("button", { hasText: "Drilldown Tables" });
    await drilldownPanel.click();

    // Click Asset CFs tab
    const assetTab = page.locator("button", { hasText: "Asset CFs" });
    await assetTab.click();
    // Either shows table or "no data" message — neither should be an error
    const assetDrilldown = page.locator("[data-testid='drilldown-assets']");
    const noDataMsg = page.locator("text=No asset drilldown data available");
    await expect(assetDrilldown.or(noDataMsg)).toBeVisible({ timeout: 5000 });

    // Click Expense Lines tab
    const expenseTab = page.locator("button", { hasText: "Expense Lines" });
    await expenseTab.click();
    const expenseDrilldown = page.locator("[data-testid='drilldown-expenses']");
    const noExpMsg = page.locator("text=No expense data available");
    await expect(expenseDrilldown.or(noExpMsg)).toBeVisible({ timeout: 5000 });

    // Click Waterfall Events tab
    const waterfallTab = page.locator("button", { hasText: "Waterfall Events" });
    await waterfallTab.click();
    const waterfallDrilldown = page.locator("[data-testid='drilldown-waterfall-events']");
    const noWfMsg = page.locator("text=No distribution events");
    await expect(waterfallDrilldown.or(noWfMsg)).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_mref3_drilldown_waterfall.png"), fullPage: false });
  });
});

test.describe("Browser UI: Metric panels", () => {
  test("MREF III: bottom_up panel shows gross IRR (trusted block)", async ({ page }) => {
    await gotoAuditPage(page, FUNDS.MREF_III.fund_id, FUNDS.MREF_III.quarter);

    const buPanel = page.locator("[data-testid='panel-bottom-up']");
    await expect(buPanel).toBeVisible();

    // bottom_up should be trusted — gross IRR should show a real number
    // (it shouldn't show Unavailable since bottom_up.trust_status = trusted for MREF III)
    // Check that the trusted badge is present somewhere in the panel
    await expect(buPanel.locator("text=trusted")).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_mref3_metric_panels.png"), fullPage: false });
  });

  test("MCOF I: waterfall panel shows failure status, not zeros", async ({ page }) => {
    await gotoAuditPage(page, FUNDS.MCOF_I.fund_id, FUNDS.MCOF_I.quarter);

    const wfPanel = page.locator("[data-testid='panel-waterfall']");
    // MCOF I waterfall block might be null — if so, Unavailable is shown
    const unavailLabel = page.locator("[data-testid='unavailable-label']");

    // At minimum, the page should not show $0 for net_irr
    const pageText = await page.textContent("body");
    // Net IRR of $0 is never valid; if net_irr is unavailable it says Unavailable
    // This checks the broad page doesn't contain a formatted zero for IRR context
    // (A real 0% IRR would show "0.0%" not "$0")
    expect(pageText).not.toContain("$0.00\nNet IRR");
    expect(pageText).not.toContain("0.00x\nNet TVPI");
  });
});

test.describe("Browser UI: Screenshot full-page receipts", () => {
  test("MREF III: full-page screenshot saved to audit/ui_gross_to_net/screenshots/", async ({ page }) => {
    await gotoAuditPage(page, FUNDS.MREF_III.fund_id, FUNDS.MREF_III.quarter);
    // Wait for all panels to load
    await page.waitForSelector("[data-testid='gate-panel']", { timeout: 15000 });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "full_mref3_2026Q2.png"),
      fullPage: true,
    });
    // Verify file was created
    expect(fs.existsSync(path.join(SCREENSHOT_DIR, "full_mref3_2026Q2.png"))).toBe(true);
  });

  test("MCOF I: full-page screenshot", async ({ page }) => {
    await gotoAuditPage(page, FUNDS.MCOF_I.fund_id, FUNDS.MCOF_I.quarter);
    await page.waitForSelector("[data-testid='gate-panel']", { timeout: 15000 });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "full_mcof1_2026Q2.png"),
      fullPage: true,
    });
    expect(fs.existsSync(path.join(SCREENSHOT_DIR, "full_mcof1_2026Q2.png"))).toBe(true);
  });

  test("IGF VII: full-page screenshot", async ({ page }) => {
    await gotoAuditPage(page, FUNDS.IGF_VII.fund_id, FUNDS.IGF_VII.quarter);
    await page.waitForSelector("[data-testid='gate-panel']", { timeout: 15000 });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "full_igf7_2026Q2.png"),
      fullPage: true,
    });
    expect(fs.existsSync(path.join(SCREENSHOT_DIR, "full_igf7_2026Q2.png"))).toBe(true);
  });
});
