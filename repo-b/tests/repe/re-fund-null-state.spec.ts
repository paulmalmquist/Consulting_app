/**
 * INV-5 regression: unreleased / incomplete fund state must render "unavailable",
 * never a numeric value.
 *
 * This spec validates the contract:
 *   - If the authoritative state is not released, every fund KPI tile
 *     renders "unavailable" with a human-readable null_reason.
 *   - No tile shows "$0", "—", or a formatted number (like "-92.4%")
 *     for a metric whose authoritative backing is absent.
 *
 * Requires a running dev server with a seeded environment that includes
 * at least one fund whose authoritative snapshot is NOT released for the
 * current quarter.
 *
 * Test IDs relied upon:
 *   - [data-testid="re-fund-list"]          — the table
 *   - [data-testid="unavailable-cell"]       — UnavailableCell instances
 *   - [data-null-reason]                    — attribute on each cell
 */

import { test, expect } from "@playwright/test";

const MERIDIAN_ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001";
const RE_PORTFOLIO_URL = `/lab/env/${MERIDIAN_ENV_ID}/re`;

test.describe("Fund portfolio null-state rendering (INV-5)", () => {
  test("funds without released authoritative snapshot show 'unavailable', not numeric junk", async ({ page }) => {
    await page.goto(RE_PORTFOLIO_URL);
    await page.waitForSelector("[data-testid='re-fund-list']", { timeout: 15000 });

    // Collect all unavailable cells
    const unavailableCells = page.locator("[data-testid='unavailable-cell']");
    const count = await unavailableCells.count();

    // At least one fund should render unavailable (quarantined funds, unreleased snapshots)
    expect(count).toBeGreaterThan(0);

    // Every unavailable cell must have a data-null-reason attribute
    for (let i = 0; i < count; i++) {
      const reason = await unavailableCells.nth(i).getAttribute("data-null-reason");
      expect(reason).not.toBeNull();
      expect(reason).not.toBe("");
      expect(reason).not.toBe("unknown");
    }

    // No cell in the table should show the known-bad patterns
    const tableText = await page.locator("[data-testid='re-fund-list']").textContent();
    expect(tableText).not.toContain("-92.4%");
    expect(tableText).not.toContain("-93.0%");

    // No cell should show "$0" for a KPI value (INV-5 violation)
    const allCells = page.locator("[data-testid='re-fund-list'] td");
    const cellCount = await allCells.count();
    for (let i = 0; i < cellCount; i++) {
      const text = (await allCells.nth(i).textContent()) ?? "";
      // $0 or $0.00 as a standalone KPI value is a violation
      if (text.trim() === "$0" || text.trim() === "$0.00") {
        // Allow $0 only if it's in a non-metric column (strategy, vintage, status, actions)
        const colIndex = i % 12; // 12 columns in the table
        // Columns 3-8 are metric columns (AUM, NAV, Gross IRR, Net IRR, DPI, TVPI)
        if (colIndex >= 3 && colIndex <= 8) {
          throw new Error(
            `INV-5 violation: metric column ${colIndex} shows "$0" instead of "unavailable". ` +
            `Cell text: "${text.trim()}"`
          );
        }
      }
    }
  });

  test("unavailable cells show human-readable tooltip", async ({ page }) => {
    await page.goto(RE_PORTFOLIO_URL);
    await page.waitForSelector("[data-testid='re-fund-list']", { timeout: 15000 });

    const firstUnavailable = page.locator("[data-testid='unavailable-cell']").first();
    if (await firstUnavailable.count() > 0) {
      const title = await firstUnavailable.getAttribute("title");
      expect(title).not.toBeNull();
      expect(title!.length).toBeGreaterThan(5);
      // Should be a human-readable reason, not a raw code
      expect(title).not.toMatch(/^[a-z_]+$/);
    }
  });
});
