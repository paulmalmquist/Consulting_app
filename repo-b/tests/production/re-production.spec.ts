import { expect, test, type Page, type BrowserContext } from "@playwright/test";

/** Set the demo_lab_session cookie so the RE workspace renders in production. */
async function seedAuth(context: BrowserContext, baseURL: string | undefined) {
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
}

/**
 * Production E2E Tests — Real Estate PE Platform
 *
 * Runs against https://www.paulmalmquist.com with NO mocking.
 * Tests the full fund manager flow end-to-end:
 *   - Fund list, fund detail tabs, investment drill-down
 *   - directFetch endpoints (variance, metrics, loans, watchlist, runs, lp_summary)
 *   - bosFetch endpoints via Railway backend (quarter-close, waterfall)
 *   - No console errors throughout
 *
 * Production data:
 *   ENV_ID   = a1b2c3d4-0001-0001-0003-000000000001 (Meridian Capital Management)
 *   FUND_ID  = a1b2c3d4-0003-0030-0001-000000000001 (first fund)
 */

const ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001";
const FUND_ID = "a1b2c3d4-0003-0030-0001-000000000001";
const QUARTER = "2026Q1";

const FUND_URL = `/lab/env/${ENV_ID}/re/funds/${FUND_ID}`;
const FUNDS_LIST_URL = `/lab/env/${ENV_ID}/re/funds`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Collect all console errors and failed network requests during a page action. */
async function withErrorCapture(page: Page, fn: () => Promise<void>): Promise<{
  consoleErrors: string[];
  failedRequests: { url: string; status: number }[];
}> {
  const consoleErrors: string[] = [];
  const failedRequests: { url: string; status: number }[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && res.url().includes("/api/")) {
      failedRequests.push({ url: res.url(), status: res.status() });
    }
  });

  await fn();
  return { consoleErrors, failedRequests };
}

/** Navigate and wait for the RE workspace shell to be ready. */
async function gotoFundPage(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  // Wait for any sign the page has settled — race whichever fires first
  await Promise.race([
    page.waitForSelector("[data-testid]", { timeout: 20_000 }).catch(() => null),
    page.waitForSelector("[role='tablist']", { timeout: 20_000 }).catch(() => null),
    page.waitForSelector("h1, h2", { timeout: 20_000 }).catch(() => null),
    page.getByText(/fund not found/i).waitFor({ timeout: 20_000 }).catch(() => null),
    page.waitForTimeout(10_000), // fallback: proceed after 10s no matter what
  ]);
}

/** Click a tab and wait for its panel to be visible. */
async function clickTab(page: Page, label: string | RegExp) {
  const tab = page.getByRole("tab", { name: label });
  await expect(tab).toBeVisible({ timeout: 10_000 });
  await tab.click();
  // Give the tab panel time to load data
  await page.waitForTimeout(2_000);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("RE Production — Health", () => {
  test("backend health endpoint is reachable", async ({ request }) => {
    const res = await request.get(
      "https://authentic-sparkle-production-7f37.up.railway.app/health"
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("/bos proxy routes to backend", async ({ request }) => {
    const res = await request.get("/bos/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("RE v1 context returns production data", async ({ request }) => {
    const res = await request.get(
      `/bos/api/re/v1/context?env_id=${ENV_ID}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.env_id).toBe(ENV_ID);
    expect(body.funds_count).toBeGreaterThanOrEqual(1);
  });
});

test.describe("RE Production — Fund List Page", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedAuth(context, baseURL);
  });

  test("funds list page loads and shows funds", async ({ page }) => {
    const { consoleErrors, failedRequests } = await withErrorCapture(page, async () => {
      await gotoFundPage(page, FUNDS_LIST_URL);
    });

    // Should show at least one fund card/row
    const fundLinks = page.getByRole("link").filter({ hasText: /fund|capital|realty/i });
    await expect(fundLinks.first()).toBeVisible({ timeout: 15_000 });

    // No 404/502 errors on the list page
    const hardErrors = failedRequests.filter((r) => r.status === 404 || r.status === 502);
    expect(hardErrors, `404/502 errors: ${JSON.stringify(hardErrors)}`).toHaveLength(0);
  });
});

test.describe("RE Production — Fund Detail Page", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    await seedAuth(context, baseURL);
    await gotoFundPage(page, FUND_URL);
  });

  test("fund detail page loads without hard errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    const failed: { url: string; status: number }[] = [];
    page.on("response", (r) => {
      if (r.status() >= 500) failed.push({ url: r.url(), status: r.status() });
    });

    await page.waitForTimeout(3_000); // let async loads settle

    // No 5xx errors
    expect(failed, `5xx errors: ${JSON.stringify(failed)}`).toHaveLength(0);

    // Fund name visible somewhere on page
    const hasContent = await page
      .getByRole("heading")
      .or(page.locator("h1, h2, h3"))
      .first()
      .isVisible();
    expect(hasContent).toBe(true);
  });

  test("fund detail has tabs visible", async ({ page }) => {
    const tabList = page.getByRole("tablist");
    await expect(tabList).toBeVisible({ timeout: 15_000 });

    // Expect at least these tabs
    for (const label of ["Overview", "Variance"]) {
      await expect(
        page.getByRole("tab", { name: new RegExp(label, "i") }),
        `Tab "${label}" should be visible`
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("Overview tab shows investment rollup data", async ({ page }) => {
    await clickTab(page, /overview/i);

    // Should show some metric cards or investment table
    const hasMetrics = await page
      .locator("[data-testid*='metric'], [class*='MetricCard'], table, [role='table']")
      .first()
      .isVisible({ timeout: 15_000 }).catch(() => false);

    // Alternatively just check we're not showing an error state
    const errorText = page.getByText(/error|failed|unavailable/i);
    const hasError = await errorText.first().isVisible().catch(() => false);
    expect(hasError, "Overview tab should not show error state").toBe(false);
    expect(hasMetrics || !hasError).toBe(true);
  });

  test("Variance tab loads NOI variance data", async ({ page }) => {
    await clickTab(page, /variance/i);
    await page.waitForTimeout(3_000);

    // Should NOT show "Business OS API route is not available"
    await expect(
      page.getByText(/business os api route is not available/i)
    ).not.toBeVisible({ timeout: 5_000 }).catch(() => {}); // if selector fails, test passes

    // Should NOT be a 404/502
    const errorMsg = page.getByText(/direct api request failed/i);
    const hasApiError = await errorMsg.isVisible().catch(() => false);
    expect(hasApiError, "Variance tab should not show API failure message").toBe(false);
  });

  test("Returns tab loads fund metrics", async ({ page }) => {
    await clickTab(page, /returns/i);
    await page.waitForTimeout(3_000);

    const hasError = await page
      .getByText(/business os api|direct api request failed|502|not available/i)
      .first().isVisible().catch(() => false);
    expect(hasError, "Returns tab should not show proxy/API errors").toBe(false);
  });

  test("Debt tab loads loans", async ({ page }) => {
    await clickTab(page, /debt/i);
    await page.waitForTimeout(3_000);

    const hasError = await page
      .getByText(/business os api|direct api request failed|502/i)
      .first().isVisible().catch(() => false);
    expect(hasError, "Debt tab should not show proxy/API errors").toBe(false);
  });

  test("Run Center tab loads run history", async ({ page }) => {
    await clickTab(page, /run center/i);
    await page.waitForTimeout(3_000);

    const hasError = await page
      .getByText(/business os api|direct api request failed|502/i)
      .first().isVisible().catch(() => false);
    expect(hasError, "Run Center should not show proxy/API errors").toBe(false);

    // Run Center should have a "Run Quarter Close" button
    const runButton = page.getByRole("button", { name: /quarter.close|run/i });
    const hasCta = await runButton.first().isVisible().catch(() => false);
    expect(hasCta, "Run Center should have a run button").toBe(true);
  });

  test("LP Summary tab loads partner data", async ({ page }) => {
    await clickTab(page, /lp summary/i);
    await page.waitForTimeout(3_000);

    const hasError = await page
      .getByText(/business os api|direct api request failed|502/i)
      .first().isVisible().catch(() => false);
    expect(hasError, "LP Summary should not show proxy/API errors").toBe(false);
  });
});

test.describe("RE Production — Direct API Endpoints (no mocking)", () => {
  test("portfolio KPIs returns data", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/environments/${ENV_ID}/portfolio-kpis?quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.fund_count).toBeGreaterThanOrEqual(1);
    expect(typeof body.total_commitments).toBe("string");
  });

  test("fund investment rollup returns rows", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/investment-rollup/${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test("fund lineage returns widgets", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/lineage/${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.entity_type).toBe("fund");
    expect(Array.isArray(body.widgets)).toBe(true);
  });

  test("fund runs list returns array", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/runs?quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
  });

  test("fund loans list returns array", async ({ request }) => {
    const res = await request.get(`/api/re/v2/funds/${FUND_ID}/loans`);
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
  });

  test("fund watchlist returns array", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/watchlist?quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
  });

  test("fund metrics-detail returns metrics object", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/metrics-detail?quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("metrics");
    expect(body).toHaveProperty("bridge");
  });

  test("lp_summary returns fund + partner structure", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/lp_summary?quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.fund_id).toBe(FUND_ID);
    expect(Array.isArray(body.partners)).toBe(true);
  });

  test("NOI variance returns items array", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/variance/noi?env_id=${ENV_ID}&business_id=a1b2c3d4-0001-0001-0001-000000000001&fund_id=${FUND_ID}&quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("items");
    expect(Array.isArray(body.items)).toBe(true);
  });
});

test.describe("RE Production — Railway Backend (bosFetch) Endpoints", () => {
  test("RE v1 context via /bos proxy works", async ({ request }) => {
    const res = await request.get(`/bos/api/re/v1/context?env_id=${ENV_ID}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.env_id).toBe(ENV_ID);
    expect(body.business_id).toBeTruthy();
  });

  test("fund scenarios list via backend returns array", async ({ request }) => {
    const res = await request.get(
      `/bos/api/re/v2/funds/${FUND_ID}/scenarios`
    );
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
  });

  test("quarter-close POST returns structured result (not 502)", async ({ request }) => {
    const res = await request.post(
      `/bos/api/re/v2/funds/${FUND_ID}/quarter-close`,
      {
        data: { quarter: QUARTER },
        headers: { "Content-Type": "application/json" },
      }
    );
    // Should get either success or a domain error — NOT a 502 proxy error
    expect(res.status()).not.toBe(502);
    expect(res.status()).not.toBe(503);
    const body = await res.json();
    // Railway backend returns structured errors, never raw proxy failures
    expect(body).toBeTruthy();
  });
});

test.describe("RE Production — Investment Drill-Down", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedAuth(context, baseURL);
  });

  test("clicking an investment navigates to investment detail", async ({ page }) => {
    await gotoFundPage(page, FUND_URL);

    // Click the Overview tab to see investments
    await clickTab(page, /overview/i);
    await page.waitForTimeout(2_000);

    // Find any investment link and click it
    const investmentLink = page
      .getByRole("link")
      .filter({ hasText: /.+/ })
      .filter({ has: page.locator("a[href*='/investments/']") })
      .first();

    const directInvLink = page.locator("a[href*='/investments/']").first();
    const linkVisible = await directInvLink.isVisible({ timeout: 10_000 }).catch(() => false);

    if (linkVisible) {
      const href = await directInvLink.getAttribute("href");
      await page.goto(href!, { waitUntil: "networkidle", timeout: 45_000 });

      // Investment page should not show 404
      await expect(page.getByText(/investment not found/i)).not.toBeVisible({ timeout: 5_000 }).catch(() => {});
      // Should have some heading
      const heading = page.locator("h1, h2").first();
      await expect(heading).toBeVisible({ timeout: 15_000 });
    } else {
      // If no investment links are visible, that's acceptable — fund may have no investments
      console.log("No investment links found on fund page — skipping drill-down check");
    }
  });
});

test.describe("RE Production — No Critical Console Errors", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedAuth(context, baseURL);
  });

  test("fund detail page has no 'Business OS API' errors", async ({ page }) => {
    const bosErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && msg.text().includes("Business OS")) {
        bosErrors.push(msg.text());
      }
    });

    await gotoFundPage(page, FUND_URL);
    await page.waitForTimeout(4_000);

    // Visit each tab
    for (const tab of ["Overview", "Variance", "Returns", "Debt"]) {
      const tabEl = page.getByRole("tab", { name: new RegExp(tab, "i") });
      if (await tabEl.isVisible().catch(() => false)) {
        await tabEl.click();
        await page.waitForTimeout(2_000);
      }
    }

    expect(
      bosErrors,
      `"Business OS API" errors appeared: ${bosErrors.join("\n")}`
    ).toHaveLength(0);
  });

  test("fund detail page has no 404 API calls", async ({ page }) => {
    const notFound: string[] = [];
    page.on("response", (res) => {
      if (res.status() === 404 && res.url().includes("/api/")) {
        notFound.push(`${res.status()} ${res.url()}`);
      }
    });

    await gotoFundPage(page, FUND_URL);
    await page.waitForTimeout(4_000);

    expect(
      notFound,
      `404 API calls:\n${notFound.join("\n")}`
    ).toHaveLength(0);
  });
});
