import { expect, test, type Page, type Route } from "@playwright/test";

const ENV_ID = "f0790a88-5d05-4991-8d0e-243ab4f9af27";
const BUSINESS_ID = "58fcfb0d-827a-472e-98a5-46326b5d080d";
const FUND_ID = "a1b2c3d4-0003-0030-0001-000000000001";
const QUARTER = "2026Q1";

type InvestmentRow = {
  investment_id: string;
  fund_id: string;
  name: string;
  investment_type: string;
  stage: string;
  sponsor: string | null;
  target_close_date: string;
  committed_capital: number;
  invested_capital: number;
  realized_distributions: number;
  created_at: string;
};

type AssetRow = {
  asset_id: string;
  deal_id: string;
  jv_id: string | null;
  asset_type: string;
  name: string;
  property_type: string;
  quarter_state_id: string;
  run_id: string;
  noi: number;
  net_cash_flow: number;
  debt_balance: number;
  asset_value: number;
  nav: number;
  inputs_hash: string;
  created_at: string;
};

function makeInvestment(index: number): InvestmentRow {
  const suffix = (index + 1).toString(16).padStart(12, "0");
  return {
    investment_id: `44444444-4444-4444-8444-${suffix}`,
    fund_id: FUND_ID,
    name: `Institutional Investment ${index + 1}`,
    investment_type: index % 3 === 0 ? "debt" : "equity",
    stage: "operating",
    sponsor: "Meridian Sponsor",
    target_close_date: "2025-01-15",
    committed_capital: 10_000_000 + index * 500_000,
    invested_capital: 8_000_000 + index * 400_000,
    realized_distributions: 1_000_000 + index * 100_000,
    created_at: "2026-01-15T00:00:00Z",
  };
}

function makeAssets(investment: InvestmentRow, index: number): AssetRow[] {
  const baseAssetId = `55555555-5555-4555-8555-${(index + 1).toString(16).padStart(12, "0")}`;
  return [
    {
      asset_id: baseAssetId,
      deal_id: investment.investment_id,
      jv_id: index % 2 === 0 ? `66666666-6666-4666-8666-${(index + 1).toString(16).padStart(12, "0")}` : null,
      asset_type: investment.investment_type === "debt" ? "cmbs" : "property",
      name: `${investment.name} Asset A`,
      property_type: investment.investment_type === "debt" ? "loan_pool" : "multifamily",
      quarter_state_id: `77777777-7777-4777-8777-${(index + 1).toString(16).padStart(12, "0")}`,
      run_id: `88888888-8888-4888-8888-${(index + 1).toString(16).padStart(12, "0")}`,
      noi: 250_000 + index * 10_000,
      net_cash_flow: 180_000 + index * 8_000,
      debt_balance: 2_000_000 + index * 50_000,
      asset_value: 6_500_000 + index * 300_000,
      nav: 4_500_000 + index * 250_000,
      inputs_hash: `hash-${index + 1}-a`,
      created_at: "2026-01-15T00:00:00Z",
    },
  ];
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function installInvestmentIntegrityMocks(page: Page) {
  const investments = Array.from({ length: 12 }, (_, index) => makeInvestment(index));
  const assetsByInvestment = new Map(investments.map((investment, index) => [investment.investment_id, makeAssets(investment, index)]));

  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (!path.startsWith("/api/") && !path.startsWith("/v1/")) {
      return route.continue();
    }

    if (path === `/v1/environments/${ENV_ID}` && method === "GET") {
      return fulfill(route, {
        env_id: ENV_ID,
        client_name: "Institutional Demo",
        industry: "real_estate",
        industry_type: "real_estate",
        schema_name: "env_meridian_capital",
        business_id: BUSINESS_ID,
      });
    }

    if (path === "/api/re/v1/context" && method === "GET") {
      return fulfill(route, {
        env_id: ENV_ID,
        business_id: BUSINESS_ID,
        is_bootstrapped: true,
        funds_count: 1,
        scenarios_count: 2,
      });
    }

    if (path === `/api/repe/funds/${FUND_ID}` && method === "GET") {
      return fulfill(route, {
        fund: {
          fund_id: FUND_ID,
          business_id: BUSINESS_ID,
          name: "Institutional Growth Fund VII",
          vintage_year: 2026,
          fund_type: "closed_end",
          strategy: "equity",
          sub_strategy: "Core+",
          target_size: 500000000,
          term_years: 7,
          status: "investing",
          base_currency: "USD",
          inception_date: "2026-01-01",
          quarter_cadence: "quarterly",
          target_sectors_json: [],
          target_geographies_json: [],
          metadata_json: {},
          created_at: "2026-01-01T00:00:00Z",
        },
        terms: [
          {
            fund_term_id: "99999999-9999-4999-8999-000000000001",
            fund_id: FUND_ID,
            effective_from: "2026-01-01",
            preferred_return_rate: 0.08,
            carry_rate: 0.2,
            waterfall_style: "european",
            catch_up_style: "full",
          },
        ],
      });
    }

    if (path === `/api/repe/funds/${FUND_ID}/deals` && method === "GET") {
      return fulfill(
        route,
        investments.map((investment) => ({
          deal_id: investment.investment_id,
          fund_id: FUND_ID,
          name: investment.name,
          deal_type: investment.investment_type,
          stage: investment.stage,
          sponsor: investment.sponsor,
          target_close_date: investment.target_close_date,
          created_at: investment.created_at,
        })),
      );
    }

    if (path === `/api/re/v2/funds/${FUND_ID}/investments` && method === "GET") {
      return fulfill(route, investments);
    }

    if (path === `/api/re/v2/funds/${FUND_ID}/quarter-state/${QUARTER}` && method === "GET") {
      return fulfill(route, {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        fund_id: FUND_ID,
        quarter: QUARTER,
        scenario_id: null,
        run_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        portfolio_nav: 145000000,
        total_committed: 175000000,
        total_called: 125000000,
        total_distributed: 23000000,
        dpi: 0.184,
        rvpi: 1.16,
        tvpi: 1.344,
        gross_irr: 0.138,
        net_irr: 0.121,
        weighted_ltv: 0.54,
        weighted_dscr: 1.48,
        inputs_hash: "fund-hash",
        created_at: "2026-01-15T00:00:00Z",
      });
    }

    if (path === `/api/re/v2/funds/${FUND_ID}/metrics/${QUARTER}` && method === "GET") {
      return fulfill(route, {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        fund_id: FUND_ID,
        quarter: QUARTER,
        contributed_to_date: 125000000,
        distributed_to_date: 23000000,
        nav: 145000000,
        dpi: 0.184,
        tvpi: 1.344,
        irr: 0.121,
        created_at: "2026-01-15T00:00:00Z",
      });
    }

    if (path === `/api/re/v2/funds/${FUND_ID}/scenarios` && method === "GET") {
      return fulfill(route, [
        {
          scenario_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          fund_id: FUND_ID,
          name: "Base",
          scenario_type: "base",
          is_base: true,
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          scenario_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          fund_id: FUND_ID,
          name: "Downside",
          scenario_type: "downside",
          is_base: false,
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
        },
      ]);
    }

    if (path === `/api/re/v2/funds/${FUND_ID}/investment-rollup/${QUARTER}` && method === "GET") {
      return fulfill(
        route,
        investments.map((investment, index) => ({
          investment_id: investment.investment_id,
          name: investment.name,
          deal_type: investment.investment_type,
          stage: investment.stage,
          quarter_state_id: `rollup-${index}`,
          run_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          nav: 8500000 + index * 250000,
          gross_asset_value: 12000000 + index * 300000,
          debt_balance: 3500000 + index * 50000,
          cash_balance: 250000,
          effective_ownership_percent: 1,
          fund_nav_contribution: 8500000 + index * 250000,
          inputs_hash: `rollup-hash-${index}`,
          created_at: "2026-01-15T00:00:00Z",
        })),
      );
    }

    if (path === `/api/re/v2/funds/${FUND_ID}/lineage/${QUARTER}` && method === "GET") {
      return fulfill(route, {
        entity_type: "fund",
        entity_id: FUND_ID,
        quarter: QUARTER,
        scenario_id: null,
        generated_at: "2026-01-15T00:00:00Z",
        widgets: [],
        issues: [],
      });
    }

    if (path === `/api/re/v2/funds/${FUND_ID}/runs` && method === "GET") {
      return fulfill(route, []);
    }

    const investmentMatch = path.match(/^\/api\/re\/v2\/investments\/([^/]+)$/);
    if (investmentMatch && method === "GET") {
      const investment = investments.find((row) => row.investment_id === investmentMatch[1]);
      return fulfill(route, investment ?? { detail: "not found" }, investment ? 200 : 404);
    }

    const jvMatch = path.match(/^\/api\/re\/v2\/investments\/([^/]+)\/jvs$/);
    if (jvMatch && method === "GET") {
      const investment = investments.find((row) => row.investment_id === jvMatch[1]);
      if (!investment) return fulfill(route, { detail: "not found" }, 404);
      const index = investments.findIndex((row) => row.investment_id === jvMatch[1]);
      return fulfill(route, index % 2 === 0 ? [{
        jv_id: `66666666-6666-4666-8666-${(index + 1).toString(16).padStart(12, "0")}`,
        investment_id: investment.investment_id,
        legal_name: `${investment.name} JV`,
        ownership_percent: 1,
        gp_percent: 0.2,
        lp_percent: 0.8,
        status: "active",
        created_at: "2026-01-15T00:00:00Z",
      }] : []);
    }

    const stateMatch = path.match(/^\/api\/re\/v2\/investments\/([^/]+)\/quarter-state\/([^/]+)$/);
    if (stateMatch && method === "GET") {
      const investment = investments.find((row) => row.investment_id === stateMatch[1]);
      if (!investment) return fulfill(route, { detail: "not found" }, 404);
      const index = investments.findIndex((row) => row.investment_id === stateMatch[1]);
      return fulfill(route, {
        id: `state-${index}`,
        investment_id: investment.investment_id,
        quarter: QUARTER,
        scenario_id: null,
        run_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        nav: 8500000 + index * 250000,
        committed_capital: investment.committed_capital,
        invested_capital: investment.invested_capital,
        realized_distributions: investment.realized_distributions,
        unrealized_value: 6500000 + index * 200000,
        gross_asset_value: 12000000 + index * 300000,
        debt_balance: 3500000 + index * 50000,
        cash_balance: 250000,
        effective_ownership_percent: 1,
        fund_nav_contribution: 8500000 + index * 250000,
        gross_irr: 0.145,
        net_irr: 0.127,
        equity_multiple: 1.42,
        inputs_hash: `state-hash-${index}`,
        created_at: "2026-01-15T00:00:00Z",
      });
    }

    const assetsMatch = path.match(/^\/api\/re\/v2\/investments\/([^/]+)\/assets\/([^/]+)$/);
    if (assetsMatch && method === "GET") {
      return fulfill(route, assetsByInvestment.get(assetsMatch[1]) ?? [], assetsByInvestment.has(assetsMatch[1]) ? 200 : 404);
    }

    const lineageMatch = path.match(/^\/api\/re\/v2\/investments\/([^/]+)\/lineage\/([^/]+)$/);
    if (lineageMatch && method === "GET") {
      if (!assetsByInvestment.has(lineageMatch[1])) return fulfill(route, { detail: "not found" }, 404);
      return fulfill(route, {
        entity_type: "investment",
        entity_id: lineageMatch[1],
        quarter: QUARTER,
        scenario_id: null,
        generated_at: "2026-01-15T00:00:00Z",
        widgets: [],
        issues: [],
      });
    }

    return route.continue();
  });

  return { investments, assetsByInvestment };
}

test("all seeded investments load with deterministic asset detail and no client exceptions", async ({ page }) => {
  const { investments, assetsByInvestment } = await installInvestmentIntegrityMocks(page);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto(`/lab/env/${ENV_ID}/re/funds/${FUND_ID}`);
  await expect(page.getByTestId("re-fund-detail")).toBeVisible();

  for (const investment of investments) {
    const row = page.getByTestId(`investment-row-${investment.investment_id}`);
    await expect(row).toBeVisible();
    await row.click();

    const expectedAssets = assetsByInvestment.get(investment.investment_id) ?? [];
    if (expectedAssets.length > 0) {
      await expect(page.getByRole("link", { name: investment.name })).toBeVisible();
    }

    const detailLink = row.getByRole("link", { name: "Detail →" });
    const detailResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/re/v2/investments/${investment.investment_id}`) &&
        response.status() === 200,
    );
    await detailLink.click();
    await detailResponse;

    await expect(page.getByTestId("re-investment-homepage")).toBeVisible();
    await expect(page.getByRole("heading", { name: investment.name })).toBeVisible();
    await expect(page.locator('[data-testid^="investment-asset-row-"]')).toHaveCount(expectedAssets.length);

    await page.goto(`/lab/env/${ENV_ID}/re/funds/${FUND_ID}`);
    await expect(page.getByTestId("re-fund-detail")).toBeVisible();
  }

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
