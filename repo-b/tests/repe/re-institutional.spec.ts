/**
 * RE Institutional Workspace - Playwright E2E Tests
 *
 * Tests cover the ownership-first fund manager flow:
 * 1. Provision RE env → /re → fund list renders
 * 2. Create Fund wizard → submit → lands on fund homepage
 * 3. Drill path: fund → investment → JV → asset
 * 4. Scenario: create → add override → run quarter-close
 * 5. No console errors or failed requests (strict mode)
 */
import { expect, test, type Page, type Route } from "@playwright/test";

type Fund = {
  fund_id: string;
  business_id: string;
  name: string;
  vintage_year: number;
  fund_type: string;
  strategy: "equity" | "debt";
  sub_strategy: string | null;
  target_size: string | null;
  status: string;
  base_currency: string;
  inception_date: string | null;
  quarter_cadence: string;
  created_at: string;
};

type Investment = {
  investment_id: string;
  fund_id: string;
  name: string;
  investment_type: string;
  stage: string;
  sponsor?: string;
  committed_capital?: number;
  invested_capital?: number;
  created_at: string;
};

type JV = {
  jv_id: string;
  investment_id: string;
  legal_name: string;
  ownership_percent: number;
  gp_percent?: number;
  lp_percent?: number;
  status: string;
  created_at: string;
};

type Asset = {
  asset_id: string;
  deal_id: string;
  asset_type: "property" | "cmbs";
  name: string;
  created_at: string;
};

type Scenario = {
  scenario_id: string;
  fund_id: string;
  name: string;
  scenario_type: string;
  is_base: boolean;
  status: string;
  created_at: string;
};

type MockState = {
  envId: string;
  businessId: string;
  funds: Fund[];
  investmentsByFund: Record<string, Investment[]>;
  jvsByInvestment: Record<string, JV[]>;
  assetsByDeal: Record<string, Asset[]>;
  assetsByJv: Record<string, Asset[]>;
  scenariosByFund: Record<string, Scenario[]>;
  seq: number;
  consoleErrors: string[];
};

function makeId(seq: number): string {
  return `00000000-0000-4000-a000-${seq.toString(16).padStart(12, "0")}`;
}

function makeState(): MockState {
  return {
    envId: "f0790a88-5d05-4991-8d0e-243ab4f9af27",
    businessId: "58fcfb0d-827a-472e-98a5-46326b5d080d",
    funds: [],
    investmentsByFund: {},
    jvsByInvestment: {},
    assetsByDeal: {},
    assetsByJv: {},
    scenariosByFund: {},
    seq: 1,
    consoleErrors: [],
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: { "content-type": "application/json", "x-request-id": `req_${Date.now()}` },
    body: JSON.stringify(body),
  });
}

async function installMocks(page: Page, state: MockState) {
  page.on("console", (msg) => {
    if (msg.type() === "error") state.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => state.consoleErrors.push(err.message));

  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    // Let non-API requests through
    if (!path.startsWith("/api/") && !path.startsWith("/v1/") && !path.startsWith("/bos/")) {
      return route.continue();
    }

    // Strip /bos prefix for proxy simulation
    const apiPath = path.startsWith("/bos/") ? path.slice(4) : path;

    // v1 environment
    if (apiPath === `/v1/environments/${state.envId}` && method === "GET") {
      return fulfillJson(route, {
        env_id: state.envId,
        client_name: "TestRE",
        industry: "real_estate",
        industry_type: "real_estate",
        schema_name: "testre",
        business_id: state.businessId,
      });
    }

    // RE v1 context
    if (apiPath === "/api/re/v1/context" && method === "GET") {
      return fulfillJson(route, {
        env_id: state.envId,
        business_id: state.businessId,
        industry: "real_estate",
        is_bootstrapped: state.funds.length > 0,
        funds_count: state.funds.length,
        scenarios_count: Object.values(state.scenariosByFund).flat().length,
      });
    }

    // RE v1 context bootstrap
    if (apiPath === "/api/re/v1/context/bootstrap" && method === "POST") {
      return fulfillJson(route, {
        env_id: state.envId,
        business_id: state.businessId,
        industry: "real_estate",
        is_bootstrapped: true,
        funds_count: state.funds.length,
        scenarios_count: 0,
      });
    }

    // Legacy REPE context (fallback)
    if (apiPath.startsWith("/api/repe/context") && method === "GET") {
      return fulfillJson(route, {
        env_id: state.envId,
        business_id: state.businessId,
        created: false,
        source: "test",
        diagnostics: { binding_found: true },
      });
    }
    if (apiPath === "/api/repe/context/init" && method === "POST") {
      return fulfillJson(route, {
        env_id: state.envId,
        business_id: state.businessId,
        created: false,
        source: "test",
        diagnostics: { binding_found: true },
      });
    }

    // RE v1 funds
    if (apiPath === "/api/re/v1/funds" && method === "GET") {
      return fulfillJson(route, state.funds);
    }
    if (apiPath === "/api/re/v1/funds" && method === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      const id = makeId(state.seq++);
      const fund: Fund = {
        fund_id: id,
        business_id: state.businessId,
        name: String(body.name || "New Fund"),
        vintage_year: Number(body.vintage_year || 2026),
        fund_type: "closed_end",
        strategy: (body.strategy as "equity" | "debt") || "equity",
        sub_strategy: body.sub_strategy ? String(body.sub_strategy) : null,
        target_size: body.target_size ? String(body.target_size) : null,
        status: "fundraising",
        base_currency: String(body.base_currency || "USD"),
        inception_date: body.inception_date ? String(body.inception_date) : null,
        quarter_cadence: "quarterly",
        created_at: "2026-01-01T00:00:00",
      };
      state.funds.unshift(fund);
      state.investmentsByFund[id] = [];
      state.scenariosByFund[id] = [{
        scenario_id: makeId(state.seq++),
        fund_id: id,
        name: "Base",
        scenario_type: "base",
        is_base: true,
        status: "active",
        created_at: "2026-01-01T00:00:00",
      }];
      return fulfillJson(route, fund);
    }

    // Fund detail (REPE legacy)
    const fundDetailMatch = apiPath.match(/^\/api\/repe\/funds\/([0-9a-fA-F-]+)$/);
    if (fundDetailMatch && method === "GET") {
      const fund = state.funds.find((f) => f.fund_id === fundDetailMatch[1]);
      if (!fund) return fulfillJson(route, { error_code: "NOT_FOUND", message: "Fund not found", detail: "Fund not found" }, 404);
      return fulfillJson(route, {
        fund,
        terms: [{
          fund_term_id: makeId(state.seq++),
          fund_id: fund.fund_id,
          effective_from: "2026-01-01",
          preferred_return_rate: "0.08",
          carry_rate: "0.20",
          waterfall_style: "european",
          created_at: "2026-01-01T00:00:00",
        }],
      });
    }

    // Investments (deals)
    const fundDealsMatch = apiPath.match(/^\/api\/repe\/funds\/([0-9a-fA-F-]+)\/deals$/);
    if (fundDealsMatch && method === "GET") {
      return fulfillJson(route, state.investmentsByFund[fundDealsMatch[1]] || []);
    }

    // RE v2 investments
    const v2InvestmentsMatch = apiPath.match(/^\/api\/re\/v2\/funds\/([0-9a-fA-F-]+)\/investments$/);
    if (v2InvestmentsMatch && method === "GET") {
      return fulfillJson(route, state.investmentsByFund[v2InvestmentsMatch[1]] || []);
    }
    if (v2InvestmentsMatch && method === "POST") {
      const fundId = v2InvestmentsMatch[1];
      const body = req.postDataJSON() as Record<string, unknown>;
      const id = makeId(state.seq++);
      const inv: Investment = {
        investment_id: id,
        fund_id: fundId,
        name: String(body.name || "New Investment"),
        investment_type: String(body.investment_type || "equity"),
        stage: String(body.stage || "sourcing"),
        committed_capital: Number(body.committed_capital || 0),
        invested_capital: Number(body.invested_capital || 0),
        created_at: "2026-01-01T00:00:00",
      };
      state.investmentsByFund[fundId] = [...(state.investmentsByFund[fundId] || []), inv];
      state.jvsByInvestment[id] = [];
      return fulfillJson(route, inv, 201);
    }

    // Single investment
    const invDetailMatch = apiPath.match(/^\/api\/re\/v2\/investments\/([0-9a-fA-F-]+)$/);
    if (invDetailMatch && method === "GET") {
      const inv = Object.values(state.investmentsByFund).flat().find((i) => i.investment_id === invDetailMatch[1]);
      if (!inv) return fulfillJson(route, { error_code: "NOT_FOUND", message: "Not found", detail: "Not found" }, 404);
      return fulfillJson(route, inv);
    }

    // JVs
    const jvsMatch = apiPath.match(/^\/api\/re\/v2\/investments\/([0-9a-fA-F-]+)\/jvs$/);
    if (jvsMatch && method === "GET") {
      return fulfillJson(route, state.jvsByInvestment[jvsMatch[1]] || []);
    }
    if (jvsMatch && method === "POST") {
      const invId = jvsMatch[1];
      const body = req.postDataJSON() as Record<string, unknown>;
      const id = makeId(state.seq++);
      const jv: JV = {
        jv_id: id,
        investment_id: invId,
        legal_name: String(body.legal_name || "New JV"),
        ownership_percent: Number(body.ownership_percent || 1),
        gp_percent: Number(body.gp_percent || 0.2),
        lp_percent: Number(body.lp_percent || 0.8),
        status: "active",
        created_at: "2026-01-01T00:00:00",
      };
      state.jvsByInvestment[invId] = [...(state.jvsByInvestment[invId] || []), jv];
      state.assetsByJv[id] = [];
      return fulfillJson(route, jv, 201);
    }

    // Single JV
    const jvDetailMatch = apiPath.match(/^\/api\/re\/v2\/jvs\/([0-9a-fA-F-]+)$/);
    if (jvDetailMatch && method === "GET") {
      const jv = Object.values(state.jvsByInvestment).flat().find((j) => j.jv_id === jvDetailMatch[1]);
      if (!jv) return fulfillJson(route, { error_code: "NOT_FOUND", message: "Not found", detail: "Not found" }, 404);
      return fulfillJson(route, jv);
    }

    // JV assets
    const jvAssetsMatch = apiPath.match(/^\/api\/re\/v2\/jvs\/([0-9a-fA-F-]+)\/assets$/);
    if (jvAssetsMatch && method === "GET") {
      return fulfillJson(route, state.assetsByJv[jvAssetsMatch[1]] || []);
    }

    // Deal assets (legacy)
    const dealAssetsMatch = apiPath.match(/^\/api\/repe\/deals\/([0-9a-fA-F-]+)\/assets$/);
    if (dealAssetsMatch && method === "GET") {
      return fulfillJson(route, state.assetsByDeal[dealAssetsMatch[1]] || []);
    }

    // Single asset
    const assetMatch = apiPath.match(/^\/api\/repe\/assets\/([0-9a-fA-F-]+)$/);
    if (assetMatch && method === "GET") {
      const asset = [...Object.values(state.assetsByDeal).flat(), ...Object.values(state.assetsByJv).flat()]
        .find((a) => a.asset_id === assetMatch[1]);
      if (!asset) return fulfillJson(route, { error_code: "NOT_FOUND", message: "Not found", detail: "Not found" }, 404);
      return fulfillJson(route, {
        asset,
        details: { property_type: "multifamily", market: "Austin", units: 120, occupancy: 0.94 },
      });
    }

    // Asset ownership
    const assetOwnershipMatch = apiPath.match(/^\/api\/repe\/assets\/([0-9a-fA-F-]+)\/ownership$/);
    if (assetOwnershipMatch) {
      return fulfillJson(route, { asset_id: assetOwnershipMatch[1], as_of_date: "2026-01-01", links: [], entity_edges: [] });
    }

    // Quarter state (fund/investment/jv)
    const fundQsMatch = apiPath.match(/^\/api\/re\/v2\/funds\/([0-9a-fA-F-]+)\/quarter-state\/.+$/);
    if (fundQsMatch && method === "GET") {
      return fulfillJson(route, { error_code: "NOT_FOUND", message: "No state yet", detail: "Run quarter-close first" }, 404);
    }
    const invQsMatch = apiPath.match(/^\/api\/re\/v2\/investments\/([0-9a-fA-F-]+)\/quarter-state\/.+$/);
    if (invQsMatch && method === "GET") {
      return fulfillJson(route, { error_code: "NOT_FOUND", message: "No state", detail: "No state" }, 404);
    }
    const jvQsMatch = apiPath.match(/^\/api\/re\/v2\/jvs\/([0-9a-fA-F-]+)\/quarter-state\/.+$/);
    if (jvQsMatch && method === "GET") {
      return fulfillJson(route, { error_code: "NOT_FOUND", message: "No state", detail: "No state" }, 404);
    }

    // Fund metrics
    const fundMetricsMatch = apiPath.match(/^\/api\/re\/v2\/funds\/([0-9a-fA-F-]+)\/metrics\/.+$/);
    if (fundMetricsMatch && method === "GET") {
      return fulfillJson(route, { error_code: "NOT_FOUND", message: "No metrics", detail: "No metrics" }, 404);
    }

    // Scenarios
    const scenariosMatch = apiPath.match(/^\/api\/re\/v2\/funds\/([0-9a-fA-F-]+)\/scenarios$/);
    if (scenariosMatch && method === "GET") {
      return fulfillJson(route, state.scenariosByFund[scenariosMatch[1]] || []);
    }
    if (scenariosMatch && method === "POST") {
      const fundId = scenariosMatch[1];
      const body = req.postDataJSON() as Record<string, unknown>;
      const id = makeId(state.seq++);
      const scenario: Scenario = {
        scenario_id: id,
        fund_id: fundId,
        name: String(body.name || "New Scenario"),
        scenario_type: String(body.scenario_type || "custom"),
        is_base: false,
        status: "active",
        created_at: "2026-01-01T00:00:00",
      };
      state.scenariosByFund[fundId] = [...(state.scenariosByFund[fundId] || []), scenario];
      return fulfillJson(route, scenario, 201);
    }

    // Overrides
    const overridesMatch = apiPath.match(/^\/api\/re\/v2\/scenarios\/([0-9a-fA-F-]+)\/overrides$/);
    if (overridesMatch && method === "GET") {
      return fulfillJson(route, []);
    }
    if (overridesMatch && method === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      return fulfillJson(route, {
        id: makeId(state.seq++),
        scenario_id: overridesMatch[1],
        scope_node_type: body.scope_node_type,
        scope_node_id: body.scope_node_id,
        key: body.key,
        value_type: body.value_type,
        value_decimal: body.value_decimal,
        reason: body.reason,
        is_active: true,
        created_at: "2026-01-01T00:00:00",
      }, 201);
    }

    // Quarter close
    const quarterCloseMatch = apiPath.match(/^\/api\/re\/v2\/funds\/([0-9a-fA-F-]+)\/quarter-close$/);
    if (quarterCloseMatch && method === "POST") {
      return fulfillJson(route, {
        run_id: makeId(state.seq++),
        fund_id: quarterCloseMatch[1],
        quarter: "2026Q1",
        fund_state: {
          id: makeId(state.seq++),
          fund_id: quarterCloseMatch[1],
          quarter: "2026Q1",
          run_id: makeId(state.seq - 2),
          portfolio_nav: 1000000,
          total_committed: 5000000,
          total_called: 2000000,
          total_distributed: 500000,
          dpi: 0.25,
          tvpi: 1.25,
          inputs_hash: "abc",
          created_at: "2026-01-01T00:00:00",
        },
        fund_metrics: {
          id: makeId(state.seq++),
          fund_id: quarterCloseMatch[1],
          quarter: "2026Q1",
          contributed_to_date: 2000000,
          distributed_to_date: 500000,
          nav: 1000000,
          dpi: 0.25,
          tvpi: 1.25,
          irr: 0.12,
          created_at: "2026-01-01T00:00:00",
        },
        assets_processed: 1,
        jvs_processed: 1,
        investments_processed: 1,
        status: "success",
      });
    }

    // Runs (provenance)
    const runsMatch = apiPath.match(/^\/api\/re\/v2\/funds\/([0-9a-fA-F-]+)\/runs$/);
    if (runsMatch && method === "GET") {
      return fulfillJson(route, []);
    }

    // Department/business catchall
    if (apiPath.includes("/departments")) return fulfillJson(route, []);
    if (apiPath.includes("/capabilities")) return fulfillJson(route, []);
    if (apiPath === "/api/businesses") return fulfillJson(route, []);

    // Asset quarter state (re engine)
    if (apiPath.match(/^\/api\/re\/asset\//)) return fulfillJson(route, {}, 404);

    // Documents catchall
    if (apiPath === "/api/documents") return fulfillJson(route, []);

    // Partner metrics
    if (apiPath.match(/partner-metrics/)) return fulfillJson(route, []);

    // Default: continue for non-API
    return route.continue();
  });
}

function filterConsoleErrors(errors: string[]): string[] {
  return errors.filter(
    (line) => !/Failed to fetch RSC payload|hot-reloader-client|favicon|NEXT_REDIRECT|NEXT_NOT_FOUND|hydration/i.test(line)
  );
}

test.describe("RE Institutional Workspace", () => {
  test("1. Navigate to /re → fund list renders", async ({ page }) => {
    const state = makeState();
    await installMocks(page, state);

    await page.goto(`/lab/env/${state.envId}/re`);
    await expect(page).toHaveURL(new RegExp(`/lab/env/${state.envId}/re`));
    // Shell should render
    await expect(page.getByTestId("repe-left-nav")).toBeVisible();

    const critErrors = filterConsoleErrors(state.consoleErrors);
    expect(critErrors).toEqual([]);
  });

  test("2. Create Fund wizard → submit → fund homepage", async ({ page }) => {
    const state = makeState();
    await installMocks(page, state);

    await page.goto(`/lab/env/${state.envId}/re`);
    await page.getByRole("link", { name: "Create Fund" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/re/funds/new`));

    // Step 1
    await page.getByLabel("Fund Name").fill("Test Equity Fund I");
    await page.getByLabel("Inception Date").fill("2026-01-15");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3
    await page.getByRole("button", { name: "Create Fund" }).click();
    await expect(page).toHaveURL(new RegExp(`/re/funds/[0-9a-fA-F-]+`));
    await expect(page.getByTestId("re-fund-homepage")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Test Equity Fund I" })).toBeVisible();

    const critErrors = filterConsoleErrors(state.consoleErrors);
    expect(critErrors).toEqual([]);
  });

  test("3. Scenarios page: create scenario → add override", async ({ page }) => {
    const state = makeState();
    // Pre-populate a fund
    const fundId = makeId(99);
    state.funds.push({
      fund_id: fundId,
      business_id: state.businessId,
      name: "Scenario Test Fund",
      vintage_year: 2026,
      fund_type: "closed_end",
      strategy: "equity",
      sub_strategy: null,
      target_size: null,
      status: "investing",
      base_currency: "USD",
      inception_date: "2026-01-01",
      quarter_cadence: "quarterly",
      created_at: "2026-01-01T00:00:00",
    });
    state.scenariosByFund[fundId] = [{
      scenario_id: makeId(100),
      fund_id: fundId,
      name: "Base",
      scenario_type: "base",
      is_base: true,
      status: "active",
      created_at: "2026-01-01T00:00:00",
    }];
    await installMocks(page, state);

    await page.goto(`/lab/env/${state.envId}/re/scenarios`);
    await expect(page.getByTestId("re-scenarios-page")).toBeVisible();

    // Create scenario
    await page.getByTestId("scenario-name-input").fill("Stress Test");
    await page.getByTestId("scenario-type-select").selectOption("stress");
    await page.getByTestId("create-scenario-btn").click();

    // Scenario should appear in the list
    expect(state.scenariosByFund[fundId].length).toBeGreaterThanOrEqual(2);

    // Add override
    await page.getByTestId("override-key-input").fill("cap_rate");
    await page.getByTestId("override-value-input").fill("0.065");
    await page.getByTestId("add-override-btn").click();

    const critErrors = filterConsoleErrors(state.consoleErrors);
    expect(critErrors).toEqual([]);
  });

  test("4. Legacy quarter-close route redirects to waterfalls", async ({ page }) => {
    const state = makeState();
    const fundId = makeId(199);
    state.funds.push({
      fund_id: fundId,
      business_id: state.businessId,
      name: "Close Test Fund",
      vintage_year: 2026,
      fund_type: "closed_end",
      strategy: "equity",
      sub_strategy: null,
      target_size: null,
      status: "investing",
      base_currency: "USD",
      inception_date: "2026-01-01",
      quarter_cadence: "quarterly",
      created_at: "2026-01-01T00:00:00",
    });
    state.scenariosByFund[fundId] = [{
      scenario_id: makeId(200),
      fund_id: fundId,
      name: "Base",
      scenario_type: "base",
      is_base: true,
      status: "active",
      created_at: "2026-01-01T00:00:00",
    }];
    await installMocks(page, state);

    await page.goto(`/lab/env/${state.envId}/re/runs/quarter-close`);
    await expect(page).toHaveURL(new RegExp(`/lab/env/${state.envId}/re/waterfalls`));
    await expect(page.getByTestId("re-waterfall-runner")).toBeVisible();

    const critErrors = filterConsoleErrors(state.consoleErrors);
    expect(critErrors).toEqual([]);
  });

  test("5. No 405/500 errors on fund list load", async ({ page }) => {
    const state = makeState();
    const failedRequests: string[] = [];

    await installMocks(page, state);
    page.on("response", (resp) => {
      const status = resp.status();
      if (status === 405 || status >= 500) {
        failedRequests.push(`${resp.request().method()} ${resp.url()} → ${status}`);
      }
    });

    await page.goto(`/lab/env/${state.envId}/re`);
    await page.waitForLoadState("networkidle");

    expect(failedRequests).toEqual([]);
    const critErrors = filterConsoleErrors(state.consoleErrors);
    expect(critErrors).toEqual([]);
  });

  test("6. Nav guard: Pipeline/Uploads not visible inside /re/*", async ({ page }) => {
    const state = makeState();
    await installMocks(page, state);

    await page.goto(`/lab/env/${state.envId}/re`);
    await expect(page.locator('[data-testid="lab-nav-link-pipeline"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="lab-nav-link-uploads"]')).toHaveCount(0);
  });
});
