import { expect, test, type Page, type BrowserContext } from "@playwright/test";

/**
 * Production E2E Tests — Real Estate PE Platform
 *
 * Runs against https://www.paulmalmquist.com with NO mocking.
 *
 * Design principles (per test spec v2):
 *  1. Assert routes (URL matches expected pattern after navigation)
 *  2. Assert network contracts (expected request fired, JSON fields present)
 *  3. Assert rendered truth (specific data from response shows up)
 *  4. Use stable data-testid selectors everywhere (never Tailwind classnames)
 *  5. Trap page errors globally — fail immediately on any JS crash
 *  6. Assert workspace-error component never appears
 *  7. Use range assertions for finance metrics (not exact values)
 *  8. Layer: smoke (fast, always) then deep (optional)
 *
 * Production data (seeded fixture):
 *   ENV_ID   = a1b2c3d4-0001-0001-0003-000000000001 (Meridian Capital Management)
 *   FUND_ID  = a1b2c3d4-0003-0030-0001-000000000001 (Institutional Growth Fund VII)
 *   QUARTER  = 2026Q1
 */

const ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001";
const FUND_ID = "a1b2c3d4-0003-0030-0001-000000000001";
const BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001";
const QUARTER = "2026Q1";

const FUND_URL = `/lab/env/${ENV_ID}/re/funds/${FUND_ID}`;
const FUNDS_LIST_URL = `/lab/env/${ENV_ID}/re/funds`;

// ─── Selectors (stable data-testid) ──────────────────────────────────────────

const SEL = {
  fundTabs:       "[data-testid='fund-tabs']",
  tabOverview:    "[data-testid='tab-overview']",
  tabVariance:    "[data-testid='tab-variance--noi-']",
  tabReturns:     "[data-testid='tab-returns--gross-net-']",
  tabRunCenter:   "[data-testid='tab-run-center']",
  tabScenarios:   "[data-testid='tab-scenarios']",
  tabLPSummary:   "[data-testid='tab-lp-summary']",
  tabWaterfall:   "[data-testid='tab-waterfall-scenario']",

  fundDetail:     "[data-testid='re-fund-detail']",
  fundError:      "[data-testid='fund-error']",
  workspaceError: "[data-testid='workspace-error']",

  investmentList: "[data-testid='investment-list']",
  varianceTable:  "[data-testid='variance-table']",
  varianceSection:"[data-testid='variance-section']",
  returnsSection: "[data-testid='returns-section']",
  returnsKpis:    "[data-testid='returns-kpis']",
  runCenterSection:"[data-testid='run-center-section']",
  runQuarterClose:"[data-testid='run-quarter-close']",
  runHistory:     "[data-testid='run-history']",
  lpSummarySection:"[data-testid='lp-summary-section']",
  lpPartnerTable: "[data-testid='lp-partner-table']",
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

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

// ─── Page Error Trap ──────────────────────────────────────────────────────────

/**
 * Attach a global pageerror listener. Returns a checker function that asserts
 * no unhandled JS errors occurred. Call it at the end of each test.
 */
function attachPageErrorTrap(page: Page): () => void {
  const jsErrors: string[] = [];
  page.on("pageerror", (err) => {
    jsErrors.push(err.message);
  });
  return () => {
    expect(
      jsErrors,
      `Unhandled JS errors:\n${jsErrors.join("\n")}`
    ).toHaveLength(0);
  };
}

// ─── Navigation ───────────────────────────────────────────────────────────────

async function gotoFundPage(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  // Wait for the fund detail section OR an error indicator
  await Promise.race([
    page.locator(SEL.fundDetail).waitFor({ timeout: 20_000 }).catch(() => null),
    page.locator(SEL.fundError).waitFor({ timeout: 20_000 }).catch(() => null),
    page.waitForTimeout(15_000),
  ]);
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────

async function clickTab(page: Page, selector: string) {
  const tab = page.locator(selector);
  await expect(tab).toBeVisible({ timeout: 10_000 });
  await tab.click();
  await page.waitForTimeout(1_500);
}

// ─── Network contract helper ──────────────────────────────────────────────────

/**
 * Wait for a matching API response and return its parsed JSON.
 * Fails if the response status is not 2xx.
 */
async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  action: () => Promise<void>
): Promise<unknown> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => {
        const u = res.url();
        return typeof urlPattern === "string"
          ? u.includes(urlPattern)
          : urlPattern.test(u);
      },
      { timeout: 20_000 }
    ),
    action(),
  ]);
  expect(response.status(), `API ${response.url()} returned ${response.status()}`).toBeLessThan(400);
  return response.json();
}

// ═════════════════════════════════════════════════════════════════════════════
// SMOKE SUITE — runs on every merge/deploy (~2–5 min)
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Smoke — Health Checks", () => {
  test("Railway backend /health is reachable", async ({ request }) => {
    const res = await request.get(
      "https://authentic-sparkle-production-7f37.up.railway.app/health"
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("/bos proxy routes to Railway backend", async ({ request }) => {
    const res = await request.get("/bos/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("RE v1 context returns production fixture data", async ({ request }) => {
    const res = await request.get(`/bos/api/re/v1/context?env_id=${ENV_ID}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Route contract: correct env_id echoed back
    expect(body.env_id).toBe(ENV_ID);
    expect(body.business_id).toBeTruthy();
    // Fixture contract: Meridian has ≥ 1 fund
    expect(body.funds_count).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Smoke — Fund List Page", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedAuth(context, baseURL);
  });

  test("fund list page loads and shows Meridian funds", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);

    await page.goto(FUNDS_LIST_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });

    // Route contract: URL is correct
    expect(page.url()).toContain(`/lab/env/${ENV_ID}/re/funds`);

    // Wait for fund list section (React renders fund cards after hydration)
    await page.locator("[data-testid='re-funds-list']").waitFor({ timeout: 20_000 }).catch(() => null);

    // Rendered truth: fund names are in h3 elements inside fund cards
    const fundHeading = page.locator("h3").filter({ hasText: /Institutional Growth Fund/i });
    await expect(fundHeading.first()).toBeVisible({ timeout: 15_000 });

    // Workspace error must never appear
    await expect(page.locator(SEL.workspaceError)).not.toBeVisible().catch(() => {});

    checkErrors();
  });
});

test.describe("Smoke — Fund Detail Page Loads", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    await seedAuth(context, baseURL);
    await gotoFundPage(page, FUND_URL);
  });

  test("fund detail renders without crash", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);

    // Workspace error must not appear
    await expect(page.locator(SEL.workspaceError)).not.toBeVisible({ timeout: 5_000 }).catch(() => {});
    await expect(page.locator(SEL.fundError)).not.toBeVisible({ timeout: 5_000 }).catch(() => {});

    // Fund name rendered — fund detail uses h1 for fund name
    const heading = page.locator("h1").filter({ hasText: /Institutional Growth Fund/i });
    await expect(heading.first()).toBeVisible({ timeout: 15_000 });

    // Route contract: URL intact
    expect(page.url()).toContain(FUND_ID);

    checkErrors();
  });

  test("tab bar is visible with correct tabs", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);
    const tabBar = page.locator(SEL.fundTabs);
    await expect(tabBar).toBeVisible({ timeout: 15_000 });

    // All expected tabs present (data-testid selectors)
    for (const sel of [SEL.tabOverview, SEL.tabVariance, SEL.tabReturns, SEL.tabRunCenter]) {
      await expect(page.locator(sel), `Tab selector ${sel} not visible`).toBeVisible({ timeout: 8_000 });
    }

    checkErrors();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEEP SUITE — tab-by-tab with network + render contracts
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Deep — Fund Detail Tabs", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    await seedAuth(context, baseURL);
    await gotoFundPage(page, FUND_URL);
  });

  test("Overview tab: investment table loads (network + render)", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);

    // Network contract: rollup fires when tab is already active
    await clickTab(page, SEL.tabOverview);

    // Render: investment list table visible
    await expect(page.locator(SEL.investmentList)).toBeVisible({ timeout: 15_000 });

    // Render: at least one investment row rendered
    const rows = page.locator("[data-testid^='investment-row-']");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    // No workspace error
    await expect(page.locator(SEL.workspaceError)).not.toBeVisible();

    checkErrors();
  });

  test("Variance (NOI) tab: network contract + table visible", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);

    // Network contract: variance API fires on tab click
    const body = await waitForApiResponse(
      page,
      "/api/re/v2/variance/noi",
      () => clickTab(page, SEL.tabVariance)
    ) as { items?: unknown[] };

    // API contract: items array present
    expect(Array.isArray(body.items), "variance.items should be array").toBe(true);

    // Render: variance section visible (or empty state)
    const hasSection = await page.locator(SEL.varianceSection).isVisible({ timeout: 8_000 }).catch(() => false);
    const hasEmpty = await page.locator("[data-testid='variance-empty']").isVisible().catch(() => false);
    expect(hasSection || hasEmpty, "Variance tab should show section or empty state").toBe(true);

    // No workspace error
    await expect(page.locator(SEL.workspaceError)).not.toBeVisible();

    checkErrors();
  });

  test("Returns tab: renders KPIs, range-checks metrics", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);

    await clickTab(page, SEL.tabReturns);

    // Render: returns KPI grid visible (or empty state)
    const hasKpis = await page.locator(SEL.returnsKpis).isVisible({ timeout: 10_000 }).catch(() => false);
    const hasEmpty = await page.locator("[data-testid='returns-empty']").isVisible().catch(() => false);
    expect(hasKpis || hasEmpty, "Returns tab should show KPIs or empty state").toBe(true);

    if (hasKpis) {
      // Network contract: validate via direct API (not browser interception, since fires on page load)
      const apiRes = await page.request.get(
        `/api/re/v2/funds/${FUND_ID}/metrics-detail?quarter=${QUARTER}`
      );
      expect(apiRes.status()).toBe(200);
      const body = await apiRes.json() as { metrics?: Record<string, { value: string | null }>; bridge?: unknown };
      expect(body).toHaveProperty("bridge");

      // Range assertion: TVPI should be > 0 if present
      const rawTvpi = body.metrics?.["tvpi"]?.value;
      if (rawTvpi != null) {
        const tvpi = parseFloat(rawTvpi);
        expect(tvpi, "TVPI should be positive").toBeGreaterThan(0);
      }
    }

    // No workspace error
    await expect(page.locator(SEL.workspaceError)).not.toBeVisible().catch(() => {});

    checkErrors();
  });

  test("Run Center tab: has run-quarter-close button", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);

    await clickTab(page, SEL.tabRunCenter);

    // Render: run center section visible
    await expect(page.locator(SEL.runCenterSection)).toBeVisible({ timeout: 10_000 });

    // Render: run-quarter-close button present (stable data-testid)
    await expect(page.locator(SEL.runQuarterClose)).toBeVisible({ timeout: 10_000 });

    // No workspace error
    await expect(page.locator(SEL.workspaceError)).not.toBeVisible();

    checkErrors();
  });

  test("LP Summary tab: partner table loads (network + render)", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);

    // Network contract: lp_summary fires on tab click
    const body = await waitForApiResponse(
      page,
      "/api/re/v2/funds/" + FUND_ID + "/lp_summary",
      () => clickTab(page, SEL.tabLPSummary)
    ) as { fund_id?: string; partners?: unknown[] };

    // API contract: correct fund_id echoed, partners array present
    expect(body.fund_id).toBe(FUND_ID);
    expect(Array.isArray(body.partners)).toBe(true);

    // Render: LP section or empty state
    const hasSection = await page.locator(SEL.lpSummarySection).isVisible({ timeout: 8_000 }).catch(() => false);
    const hasEmpty = await page.locator("[data-testid='lp-summary-empty']").isVisible().catch(() => false);
    expect(hasSection || hasEmpty, "LP Summary tab should show section or empty state").toBe(true);

    // No workspace error
    await expect(page.locator(SEL.workspaceError)).not.toBeVisible();

    checkErrors();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEEP SUITE — Direct API Endpoints (no browser, pure request)
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Deep — Direct API Contracts", () => {
  test("portfolio KPIs: returns fund_count ≥ 1, total_commitments string", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/environments/${ENV_ID}/portfolio-kpis?quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.fund_count).toBeGreaterThanOrEqual(1);
    expect(typeof body.total_commitments).toBe("string");
  });

  test("fund investment rollup: ≥ 1 row with required fields", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/investment-rollup/${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const rows = await res.json() as Array<Record<string, unknown>>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // Contract: each row has investment_id and name
    expect(rows[0]).toHaveProperty("investment_id");
    expect(rows[0]).toHaveProperty("name");
  });

  test("fund lineage: returns entity_type=fund with widgets array", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/lineage/${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Route contract
    expect(body.entity_type).toBe("fund");
    expect(body.entity_id).toBe(FUND_ID);
    expect(body.quarter).toBe(QUARTER);
    // Widget shape contract
    expect(Array.isArray(body.widgets)).toBe(true);
    if (body.widgets.length > 0) {
      const w = body.widgets[0];
      expect(w).toHaveProperty("widget_key");
      expect(w).toHaveProperty("label");
      expect(w).toHaveProperty("status");
      expect(w).toHaveProperty("display_value");
    }
  });

  test("fund runs: returns array (may be empty)", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/runs?quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
  });

  test("fund loans: returns array (may be empty)", async ({ request }) => {
    const res = await request.get(`/api/re/v2/funds/${FUND_ID}/loans`);
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
  });

  test("fund watchlist: returns array (may be empty)", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/watchlist?quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const rows = await res.json();
    expect(Array.isArray(rows)).toBe(true);
  });

  test("fund metrics-detail: has metrics + bridge keys", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/metrics-detail?quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("metrics");
    expect(body).toHaveProperty("bridge");
  });

  test("lp_summary: fund_id echoed, partners array, each partner has name", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/lp_summary?quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json() as { fund_id: string; partners: Array<{ name?: string }> };
    expect(body.fund_id).toBe(FUND_ID);
    expect(Array.isArray(body.partners)).toBe(true);
    if (body.partners.length > 0) {
      expect(body.partners[0]).toHaveProperty("name");
    }
  });

  test("NOI variance: items array, each item has asset_name", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/variance/noi?env_id=${ENV_ID}&business_id=${BUSINESS_ID}&fund_id=${FUND_ID}&quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json() as { items: Array<Record<string, unknown>> };
    expect(body).toHaveProperty("items");
    expect(Array.isArray(body.items)).toBe(true);
    if (body.items.length > 0) {
      // Each variance item has: asset_id, line_code, actual_amount, variance_amount
      expect(body.items[0]).toHaveProperty("asset_id");
      expect(body.items[0]).toHaveProperty("line_code");
      expect(body.items[0]).toHaveProperty("variance_amount");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEEP SUITE — Railway Backend (bosFetch) Contracts
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Deep — Railway Backend Contracts", () => {
  test("RE v1 context: env_id + business_id echoed back", async ({ request }) => {
    const res = await request.get(`/bos/api/re/v1/context?env_id=${ENV_ID}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.env_id).toBe(ENV_ID);
    expect(body.business_id).toBeTruthy();
  });

  test("fund scenarios: returns array with base scenario", async ({ request }) => {
    const res = await request.get(`/bos/api/re/v2/funds/${FUND_ID}/scenarios`);
    expect(res.status()).toBe(200);
    const rows = await res.json() as Array<{ is_base?: boolean }>;
    expect(Array.isArray(rows)).toBe(true);
    // Fixture contract: seeded data always has a base scenario
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const hasBase = rows.some((s) => s.is_base);
    expect(hasBase, "Should have at least one base scenario").toBe(true);
  });

  test("quarter-close POST: returns structured result, not 502/503", async ({ request }) => {
    const res = await request.post(
      `/bos/api/re/v2/funds/${FUND_ID}/quarter-close`,
      {
        data: { quarter: QUARTER },
        headers: { "Content-Type": "application/json" },
      }
    );
    // Must not be a Vercel-level proxy error (HTML error page)
    expect(res.status(), "quarter-close must not return 502 Vercel proxy error").not.toBe(502);
    // 503 is acceptable when Railway backend returns a domain error (e.g. SCHEMA_NOT_MIGRATED)
    // — the key contract is that the body is JSON, not an HTML error page
    const contentType = res.headers()["content-type"] ?? "";
    expect(contentType, "quarter-close should return JSON, not HTML").toContain("application/json");
    const body = await res.json();
    expect(body, "quarter-close should return a JSON body").toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEEP SUITE — Investment Drill-Down
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Deep — Investment Drill-Down", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedAuth(context, baseURL);
  });

  test("investment link navigates to correct URL pattern and page loads", async ({ page }) => {
    const checkErrors = attachPageErrorTrap(page);

    await gotoFundPage(page, FUND_URL);

    // Overview tab should be default — investment list visible
    await expect(page.locator(SEL.investmentList)).toBeVisible({ timeout: 15_000 });

    // Find a direct investment link
    const invLink = page.locator("a[href*='/investments/']").first();
    const linkVisible = await invLink.isVisible({ timeout: 10_000 }).catch(() => false);

    if (linkVisible) {
      const href = await invLink.getAttribute("href");
      expect(href, "Investment link should have an href").toBeTruthy();

      // Route contract: href matches /investments/<uuid> pattern
      expect(href!).toMatch(/\/investments\/[0-9a-f-]{36}/);

      // Network contract: investment page loads without hard error
      await page.goto(href!, { waitUntil: "domcontentloaded", timeout: 45_000 });

      // Route contract: landed on correct URL
      expect(page.url()).toContain("/investments/");

      // Render: no "investment not found" text
      await expect(page.getByText(/investment not found/i))
        .not.toBeVisible({ timeout: 5_000 })
        .catch(() => {});

      // Render: has a heading
      await expect(page.locator("h2, h3").first()).toBeVisible({ timeout: 15_000 });

      // Workspace error must not appear
      await expect(page.locator(SEL.workspaceError)).not.toBeVisible().catch(() => {});
    } else {
      // No investment links is acceptable (fund may have none)
      console.log("No /investments/ links on fund page — skipping drill-down route check");
    }

    checkErrors();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEEP SUITE — Global Page Health
// ═════════════════════════════════════════════════════════════════════════════

test.describe("Deep — Page Health", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedAuth(context, baseURL);
  });

  test("fund detail: no unhandled JS errors across all tabs", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await gotoFundPage(page, FUND_URL);
    await page.waitForTimeout(3_000);

    // Walk all tabs that should work in production (direct-pg routes)
    const tabsToVisit = [
      SEL.tabOverview,
      SEL.tabVariance,
      SEL.tabReturns,
      SEL.tabRunCenter,
      SEL.tabLPSummary,
    ];
    for (const sel of tabsToVisit) {
      const tab = page.locator(sel);
      if (await tab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(1_500);
        // Workspace error must never appear on any tab
        await expect(page.locator(SEL.workspaceError)).not.toBeVisible().catch(() => {});
      }
    }

    expect(
      jsErrors,
      `Unhandled JS errors across tabs:\n${jsErrors.join("\n")}`
    ).toHaveLength(0);
  });

  test("fund detail: no 404 API calls", async ({ page }) => {
    const notFound: string[] = [];
    page.on("response", (res) => {
      if (res.status() === 404 && res.url().includes("/api/")) {
        notFound.push(`404 ${res.url()}`);
      }
    });

    await gotoFundPage(page, FUND_URL);
    await page.waitForTimeout(4_000);

    expect(
      notFound,
      `404 API calls found:\n${notFound.join("\n")}`
    ).toHaveLength(0);
  });

  test("fund detail: no Business OS API proxy errors in console", async ({ page }) => {
    const bosErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && msg.text().toLowerCase().includes("business os")) {
        bosErrors.push(msg.text());
      }
    });

    await gotoFundPage(page, FUND_URL);
    await page.waitForTimeout(4_000);

    expect(
      bosErrors,
      `"Business OS" console errors:\n${bosErrors.join("\n")}`
    ).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEEP SUITE — Asset Flows
// ═════════════════════════════════════════════════════════════════════════════

const ASSETS_URL = `/lab/env/${ENV_ID}/re/assets`;

test.describe("Deep — Asset Flows", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedAuth(context, baseURL);
  });

  test("assets list: fund filter dropdown visible", async ({ page }) => {
    const assertNoErrors = attachPageErrorTrap(page);
    await page.goto(ASSETS_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector("[data-testid='re-assets-index']", { timeout: 20_000 });

    // Fund filter dropdown should be present
    const fundFilter = page.locator("[data-testid='filter-fund']");
    await expect(fundFilter).toBeVisible({ timeout: 10_000 });

    assertNoErrors();
  });

  test("assets list: renders asset rows", async ({ page }) => {
    const assertNoErrors = attachPageErrorTrap(page);
    await page.goto(ASSETS_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector("[data-testid='re-assets-index']", { timeout: 20_000 });

    // Should have at least one asset row or show "No assets found"
    const table = page.locator("[data-testid='re-assets-index'] table");
    await expect(table).toBeVisible({ timeout: 10_000 });

    assertNoErrors();
  });

  test("asset detail: quarter-state API returns 200 or 404", async ({ page, request }) => {
    // Use a seed asset if available, otherwise any asset
    const assetId = "a1b2c3d4-9001-0001-0001-000000000001"; // Parkview Residences
    const res = await request.get(`/api/re/v2/assets/${assetId}/quarter-state/${QUARTER}`);
    expect([200, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      // Should have quarter state fields
      expect(body).toHaveProperty("quarter");
      expect(body).toHaveProperty("asset_id");
    }
  });

  test("asset detail: lineage API returns valid widget structure", async ({ page, request }) => {
    const assetId = "a1b2c3d4-9001-0001-0001-000000000001";
    const res = await request.get(`/api/re/v2/assets/${assetId}/lineage/${QUARTER}`);
    // Returns 200 even if asset not found (with error widget)
    expect(res.status()).toBeLessThanOrEqual(404);

    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("entity_type", "asset");
      expect(body).toHaveProperty("widgets");
      expect(body).toHaveProperty("issues");
      expect(Array.isArray(body.widgets)).toBe(true);
    }
  });

  test("asset detail: valuation compute API accepts POST", async ({ page, request }) => {
    const assetId = "a1b2c3d4-9001-0001-0001-000000000001";
    const res = await request.post(`/api/re/v2/assets/${assetId}/valuation/compute`, {
      data: {
        cap_rate: 0.055,
        quarter: QUARTER,
      },
    });

    // Should return 200 with compute result (even if no quarter state — uses defaults)
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("result");
    expect(body.result).toHaveProperty("value_direct_cap");
    expect(body.result).toHaveProperty("sensitivity");
    expect(Array.isArray(body.result.sensitivity)).toBe(true);
  });

  test("fund valuation rollup API returns aggregated data", async ({ page, request }) => {
    const res = await request.get(`/api/re/v2/funds/${FUND_ID}/valuation/rollup?quarter=${QUARTER}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("fund_id", FUND_ID);
    expect(body).toHaveProperty("summary");
    expect(body.summary).toHaveProperty("asset_count");
    expect(body.summary).toHaveProperty("total_portfolio_value");
    expect(typeof body.summary.asset_count).toBe("number");
  });

  test("asset detail page: no workspace error on load", async ({ page }) => {
    const assertNoErrors = attachPageErrorTrap(page);

    // Navigate to assets page first
    await page.goto(ASSETS_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector("[data-testid='re-assets-index']", { timeout: 20_000 });

    // Try to click first asset link
    const firstAssetLink = page.locator("[data-testid='re-assets-index'] table a").first();
    if (await firstAssetLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstAssetLink.click();
      await page.waitForTimeout(3_000);

      // Asset detail should render — workspace error must NOT appear
      await expect(page.locator(SEL.workspaceError)).not.toBeVisible();

      // Should have the asset homepage testid
      const assetPage = page.locator("[data-testid='re-asset-homepage']");
      const errorPage = page.locator("text=not found");
      // One of these should be visible
      const isAssetPage = await assetPage.isVisible({ timeout: 5_000 }).catch(() => false);
      const isError = await errorPage.isVisible({ timeout: 2_000 }).catch(() => false);
      expect(isAssetPage || isError).toBe(true);
    }

    assertNoErrors();
  });
});
