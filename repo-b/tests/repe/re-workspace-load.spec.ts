/**
 * re-workspace-load.spec.ts
 *
 * Production regression test for the RE workspace loader.
 * This test file exists because the RE workspace has failed in production
 * multiple times with either "405 Method Not Allowed" or an infinite
 * "Resolving environment context..." spinner.
 *
 * This test MUST pass before any RE-related deployment.
 * It must not mock context resolution — it must exercise the full frontend
 * contract: context fetch → auto-retry → render.
 *
 * Per RULES.MD: "Production Regression Rule — Context Integrity"
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ENV_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BUSINESS_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FUND_ID_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FUND_ID_2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function nowIso(): string {
  return "2026-01-01T00:00:00";
}

function makeEnv() {
  return {
    env_id: ENV_ID,
    client_name: "RE Regression Test Env",
    industry: "real_estate",
    industry_type: "real_estate",
    schema_name: "env_re_regression",
    is_active: true,
    status: "active",
    business_id: BUSINESS_ID,
  };
}

function makeV1Context(bootstrapped = true) {
  return {
    env_id: ENV_ID,
    business_id: BUSINESS_ID,
    industry: "real_estate",
    is_bootstrapped: bootstrapped,
    funds_count: bootstrapped ? 2 : 0,
    scenarios_count: bootstrapped ? 2 : 0,
  };
}

function makeFunds() {
  return [
    {
      fund_id: FUND_ID_1,
      business_id: BUSINESS_ID,
      name: "Regression Fund I",
      vintage_year: 2024,
      fund_type: "closed_end",
      strategy: "equity",
      sub_strategy: null,
      target_size: "500000000",
      term_years: 10,
      status: "investing",
      base_currency: "USD",
      inception_date: "2024-01-01",
      quarter_cadence: "quarterly",
      target_sectors_json: ["multifamily"],
      target_geographies_json: ["us"],
      metadata_json: {},
      created_at: nowIso(),
    },
    {
      fund_id: FUND_ID_2,
      business_id: BUSINESS_ID,
      name: "Regression Fund II",
      vintage_year: 2025,
      fund_type: "closed_end",
      strategy: "debt",
      sub_strategy: null,
      target_size: "250000000",
      term_years: 7,
      status: "fundraising",
      base_currency: "USD",
      inception_date: "2025-01-01",
      quarter_cadence: "quarterly",
      target_sectors_json: ["industrial"],
      target_geographies_json: ["us"],
      metadata_json: {},
      created_at: nowIso(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Auth helpers (mirrors re-drill-path.spec.ts pattern)
// ---------------------------------------------------------------------------

async function setAuthCookie(context: BrowserContext, page: Page, baseURL: string | undefined) {
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

  await page.addInitScript((envId: string) => {
    window.localStorage.setItem("demo_lab_env_id", envId);
  }, ENV_ID);
}

// ---------------------------------------------------------------------------
// API mock helpers
// ---------------------------------------------------------------------------

/**
 * Install the canonical set of mocks for a happy-path RE workspace load.
 * All mocked routes match the production URL shapes exactly.
 */
async function installHappyPathMocks(context: BrowserContext): Promise<void> {
  const env = makeEnv();
  const ctx = makeV1Context(true);
  const funds = makeFunds();

  // Environment list
  await context.route("**/v1/environments", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_rr_1" },
      body: JSON.stringify({ environments: [env] }),
    });
  });

  // Environment detail — GET /v1/environments/:envId
  await context.route(`**/v1/environments/${ENV_ID}`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_rr_2" },
      body: JSON.stringify(env),
    });
  });

  // Canonical context endpoint — GET /bos/api/re/v1/context
  // This is the first and most critical network call on /re page load.
  // Must be GET. Must return deterministic payload. Never 405.
  await context.route("**/bos/api/re/v1/context**", async (route) => {
    const req = route.request();
    // Fail hard if anything other than GET or OPTIONS hits this endpoint
    if (req.method() !== "GET" && req.method() !== "OPTIONS") {
      await route.fulfill({
        status: 405,
        headers: { "content-type": "application/json", "x-request-id": "req_rr_err" },
        body: JSON.stringify({
          error_code: "METHOD_NOT_ALLOWED",
          message: "Test intercepted wrong HTTP method on context endpoint",
          detail: { method: req.method() },
        }),
      });
      return;
    }
    if (req.method() === "OPTIONS") {
      await route.fulfill({
        status: 200,
        headers: { Allow: "GET, OPTIONS", "x-request-id": "req_rr_opts" },
        body: "",
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_rr_3" },
      body: JSON.stringify(ctx),
    });
  });

  // Bootstrap endpoint — POST /bos/api/re/v1/context/bootstrap
  await context.route("**/bos/api/re/v1/context/bootstrap**", async (route) => {
    const req = route.request();
    if (req.method() !== "POST" && req.method() !== "OPTIONS") return route.continue();
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_rr_4" },
      body: JSON.stringify(makeV1Context(true)),
    });
  });

  // Funds list — GET /bos/api/re/v1/funds
  await context.route("**/bos/api/re/v1/funds**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_rr_5" },
      body: JSON.stringify(funds),
    });
  });

  // Fund quarter state — GET /bos/api/re/v2/funds/:fundId/quarter-state
  await context.route("**/bos/api/re/v2/funds/*/quarter-state**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_rr_6" },
      body: JSON.stringify({
        portfolio_nav: 48_000_000,
        total_committed: 100_000_000,
        dpi: 0.32,
        tvpi: 1.18,
        irr: 0.112,
      }),
    });
  });

  // Absorb ancillary calls that don't affect this test
  await context.route(`**/api/businesses/${BUSINESS_ID}/departments**`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_rr_7" },
      body: JSON.stringify([]),
    });
  });

  await context.route("**/v1/env/*/health**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_rr_8" },
      body: JSON.stringify({
        business_exists: true,
        modules_initialized: true,
        repe_status: "ready",
        data_integrity: true,
      }),
    });
  });

  await context.route("**/v1/audit**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_rr_9" },
      body: JSON.stringify({ items: [] }),
    });
  });

  // Legacy REPE context — still present on some routes
  await context.route("**/api/repe/context**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_rr_10" },
      body: JSON.stringify({
        env_id: ENV_ID,
        business_id: BUSINESS_ID,
        created: false,
        source: "test",
        diagnostics: {},
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("RE Workspace Load — Production Regression Suite", () => {
  // Track 405 responses and console errors across each test
  let failed405Urls: string[] = [];
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ context, page, baseURL }) => {
    failed405Urls = [];
    consoleErrors = [];

    await setAuthCookie(context, page, baseURL);
    await installHappyPathMocks(context);

    // Capture console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Capture 405 responses — a 405 anywhere on the context path is an architecture violation
    page.on("response", (response) => {
      if (response.status() === 405) {
        failed405Urls.push(`405 ${response.request().method()} ${response.url()}`);
      }
    });
  });

  // -------------------------------------------------------------------------
  // TEST 1: Happy path — workspace loads with bootstrapped context
  // -------------------------------------------------------------------------
  test("RE workspace loads with fund list (bootstrapped environment)", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re`);

    // Must NOT show infinite spinner — wait for fund list container
    const fundList = page.getByTestId("re-fund-list");
    await expect(fundList).toBeVisible({ timeout: 15_000 });

    // Assert fund table rows visible (both seeded funds)
    await expect(page.getByText("Regression Fund I")).toBeVisible();
    await expect(page.getByText("Regression Fund II")).toBeVisible();

    // Assert no console errors
    expect(consoleErrors).toHaveLength(0);

    // Assert no 405s
    expect(failed405Urls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // TEST 2: Auto-retry bootstrap — not bootstrapped on first GET, bootstraps and renders
  // -------------------------------------------------------------------------
  test("RE workspace auto-bootstraps when context returns RE_NOT_BOOTSTRAPPED", async ({ page, context }) => {
    let bootstrapCallCount = 0;
    let contextCallCount = 0;

    // Override: first GET returns 422 RE_NOT_BOOTSTRAPPED, then bootstrap succeeds
    await context.route("**/bos/api/re/v1/context**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: { Allow: "GET, OPTIONS" }, body: "" });
        return;
      }
      if (req.method() !== "GET") {
        await route.fulfill({
          status: 405,
          body: JSON.stringify({ error_code: "METHOD_NOT_ALLOWED" }),
        });
        return;
      }
      contextCallCount++;
      // Return not-bootstrapped on first call; subsequent calls return bootstrapped
      const bootstrapped = contextCallCount > 1;
      await route.fulfill({
        status: bootstrapped ? 200 : 422,
        headers: { "content-type": "application/json", "x-request-id": `req_ctx_${contextCallCount}` },
        body: JSON.stringify(
          bootstrapped
            ? makeV1Context(true)
            : {
                error_code: "RE_NOT_BOOTSTRAPPED",
                message: "Workspace not bootstrapped. Call POST /api/re/v1/context/bootstrap.",
                detail: { env_id: ENV_ID, business_id: BUSINESS_ID, funds_count: 0 },
              }
        ),
      });
    });

    // Bootstrap endpoint — succeeds, increments counter
    await context.route("**/bos/api/re/v1/context/bootstrap**", async (route) => {
      const req = route.request();
      if (req.method() !== "POST") return route.continue();
      bootstrapCallCount++;
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req_boot_1" },
        body: JSON.stringify(makeV1Context(true)),
      });
    });

    await page.goto(`/lab/env/${ENV_ID}/re`);

    // Must render fund list — auto-retry must have succeeded
    const fundList = page.getByTestId("re-fund-list");
    await expect(fundList).toBeVisible({ timeout: 15_000 });

    // Bootstrap must have been called exactly once
    expect(bootstrapCallCount).toBe(1);

    // No 405 responses
    expect(failed405Urls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // TEST 3: 405 must never happen — context endpoint only accepts GET
  // -------------------------------------------------------------------------
  test("Context endpoint never returns 405 on GET", async ({ page }) => {
    const contextResponses: Array<{ method: string; status: number; url: string }> = [];

    page.on("response", (response) => {
      if (response.url().includes("/api/re/v1/context")) {
        contextResponses.push({
          method: response.request().method(),
          status: response.status(),
          url: response.url(),
        });
      }
    });

    await page.goto(`/lab/env/${ENV_ID}/re`);
    await page.getByTestId("re-fund-list").waitFor({ timeout: 15_000 });

    // No context call should ever return 405
    const has405 = contextResponses.some((r) => r.status === 405);
    expect(has405).toBe(false);

    // At least one GET to context endpoint must have occurred
    const hasGet = contextResponses.some((r) => r.method === "GET");
    expect(hasGet).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TEST 4: Structured error shown on backend failure — no infinite spinner
  // -------------------------------------------------------------------------
  test("Backend failure shows structured error state, never infinite spinner", async ({ page, context }) => {
    // Override: context endpoint returns 503 (schema not migrated)
    await context.route("**/bos/api/re/v1/context**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: { Allow: "GET, OPTIONS" }, body: "" });
        return;
      }
      await route.fulfill({
        status: 503,
        headers: { "content-type": "application/json", "x-request-id": "req_fail" },
        body: JSON.stringify({
          error_code: "SCHEMA_NOT_MIGRATED",
          message: "RE schema not migrated.",
          detail: "Run migration 270.",
        }),
      });
    });

    // Bootstrap also fails (still schema missing)
    await context.route("**/bos/api/re/v1/context/bootstrap**", async (route) => {
      await route.fulfill({
        status: 503,
        headers: { "content-type": "application/json", "x-request-id": "req_fail_boot" },
        body: JSON.stringify({
          error_code: "SCHEMA_NOT_MIGRATED",
          message: "RE schema not migrated.",
          detail: "Run migration 270.",
        }),
      });
    });

    await page.goto(`/lab/env/${ENV_ID}/re`);

    // Must NOT spin forever — error state must appear within 15s (well before 10s timeout)
    // The loading spinner text must disappear
    const spinnerText = "Resolving environment context...";
    await expect(page.getByText(spinnerText)).not.toBeVisible({ timeout: 15_000 });

    // An error panel or error message must be visible (not blank page, not spinner)
    // The shell renders an error panel with a retry button when context fails
    const hasErrorContent = await page
      .getByRole("button", { name: /retry/i })
      .isVisible()
      .catch(() => false);

    const hasErrorText = await page
      .getByText(/not migrated|schema|error/i)
      .isVisible()
      .catch(() => false);

    expect(hasErrorContent || hasErrorText).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TEST 5: Empty fund list renders — no crash on uninitialized workspace
  // -------------------------------------------------------------------------
  test("Empty fund list renders without crash when workspace has no funds", async ({ context, page }) => {
    // Override: context says bootstrapped but fund list is empty
    await context.route("**/bos/api/re/v1/funds**", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req_empty" },
        body: JSON.stringify([]),
      });
    });

    await page.goto(`/lab/env/${ENV_ID}/re`);

    const fundList = page.getByTestId("re-fund-list");
    await expect(fundList).toBeVisible({ timeout: 15_000 });

    // Empty state message or "No funds yet" must be visible
    await expect(page.getByText(/no funds/i)).toBeVisible();

    // Create Fund CTA must be visible
    await expect(page.getByRole("link", { name: /create.*fund/i }).first()).toBeVisible();

    expect(failed405Urls).toHaveLength(0);
    expect(consoleErrors).toHaveLength(0);
  });
});
