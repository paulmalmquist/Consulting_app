import { expect, test, type Page, type Route } from "@playwright/test";

type Fund = {
  fund_id: string;
  business_id: string;
  name: string;
  vintage_year: number;
  fund_type: "closed_end" | "open_end" | "sma" | "co_invest";
  strategy: "equity" | "debt";
  sub_strategy: string | null;
  target_size: string | null;
  term_years: number | null;
  status: "fundraising" | "investing" | "harvesting" | "closed";
  base_currency: string;
  inception_date: string | null;
  quarter_cadence: "monthly" | "quarterly" | "semi_annual" | "annual";
  target_sectors_json: string[];
  target_geographies_json: string[];
  metadata_json: Record<string, unknown>;
  created_at: string;
};

type Deal = {
  deal_id: string;
  fund_id: string;
  name: string;
  deal_type: "equity" | "debt";
  stage: "sourcing" | "underwriting" | "ic" | "closing" | "operating" | "exited";
  sponsor: string | null;
  target_close_date: string | null;
  created_at: string;
};

type Asset = {
  asset_id: string;
  deal_id: string;
  asset_type: "property" | "cmbs";
  name: string;
  created_at: string;
};

type MockState = {
  envId: string;
  businessId: string;
  funds: Fund[];
  dealsByFund: Record<string, Deal[]>;
  assetsByDeal: Record<string, Asset[]>;
  docSeq: number;
  fundSeq: number;
  dealSeq: number;
  assetSeq: number;
};

function makeId(kind: string, seq: number): string {
  const tail = seq.toString(16).padStart(12, "0");
  if (kind === "fund") return `11111111-1111-4111-8111-${tail}`;
  if (kind === "deal") return `22222222-2222-4222-8222-${tail}`;
  return `33333333-3333-4333-8333-${tail}`;
}

function makeState(): MockState {
  return {
    envId: "f0790a88-5d05-4991-8d0e-243ab4f9af27",
    businessId: "58fcfb0d-827a-472e-98a5-46326b5d080d",
    funds: [],
    dealsByFund: {},
    assetsByDeal: {},
    docSeq: 1,
    fundSeq: 1,
    dealSeq: 1,
    assetSeq: 1,
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: {
      "content-type": "application/json",
      "x-request-id": `req_${Date.now()}`,
    },
    body: JSON.stringify(body),
  });
}

async function installWorkspaceMocks(page: Page, state: MockState) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (!path.startsWith("/api/") && !path.startsWith("/v1/") && !path.startsWith("/signed-upload/")) {
      return route.continue();
    }

    if (path === "/signed-upload/mock" && method === "PUT") {
      return route.fulfill({ status: 200, body: "ok" });
    }

    if (path === "/v1/environments" && method === "GET") {
      return fulfillJson(route, {
        environments: [
          {
            env_id: state.envId,
            client_name: "TestRepe",
            industry: "real_estate",
            industry_type: "real_estate",
            schema_name: "testrepe",
            is_active: true,
            business_id: state.businessId,
          },
        ],
      });
    }

    if (path === `/v1/environments/${state.envId}` && method === "GET") {
      return fulfillJson(route, {
        env_id: state.envId,
        client_name: "TestRepe",
        industry: "real_estate",
        industry_type: "real_estate",
        schema_name: "testrepe",
        business_id: state.businessId,
      });
    }

    if (path === `/v1/env/${state.envId}/health` && method === "GET") {
      return fulfillJson(route, {
        business_exists: true,
        modules_initialized: true,
        repe_status: "ready",
        data_integrity: true,
        content_count: 0,
        ranking_count: 0,
        analytics_count: 0,
        crm_count: 0,
      });
    }

    if (path.startsWith("/v1/audit") && method === "GET") {
      return fulfillJson(route, { items: [] });
    }

    if (path === `/api/businesses/${state.businessId}/departments` && method === "GET") {
      return fulfillJson(route, []);
    }

    if (path.startsWith("/api/repe/context") && method === "GET") {
      return fulfillJson(route, {
        env_id: state.envId,
        business_id: state.businessId,
        created: false,
        source: "test",
        diagnostics: { binding_found: true },
      });
    }

    if (path === "/api/repe/context/init" && method === "POST") {
      return fulfillJson(route, {
        env_id: state.envId,
        business_id: state.businessId,
        created: false,
        source: "test",
        diagnostics: { binding_found: true },
      });
    }

    if (path === "/api/re/v1/funds" && method === "GET") {
      return fulfillJson(route, state.funds);
    }

    if (path === "/api/re/v1/funds" && method === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      const fundId = makeId("fund", state.fundSeq++);
      const fund: Fund = {
        fund_id: fundId,
        business_id: state.businessId,
        name: String(body.name || "New Fund"),
        vintage_year: Number(body.vintage_year || 2026),
        fund_type: "closed_end",
        strategy: (body.strategy as "equity" | "debt") || "equity",
        sub_strategy: body.sub_strategy ? String(body.sub_strategy) : null,
        target_size: body.target_size ? String(body.target_size) : null,
        term_years: body.term_years ? Number(body.term_years) : null,
        status: "fundraising",
        base_currency: String(body.base_currency || "USD"),
        inception_date: body.inception_date ? String(body.inception_date) : null,
        quarter_cadence: "quarterly",
        target_sectors_json: Array.isArray(body.target_sectors) ? (body.target_sectors as string[]) : [],
        target_geographies_json: Array.isArray(body.target_geographies) ? (body.target_geographies as string[]) : [],
        metadata_json: {},
        created_at: "2026-01-01T00:00:00",
      };
      state.funds.unshift(fund);
      state.dealsByFund[fundId] = [];
      return fulfillJson(route, fund);
    }

    const fundDetailMatch = path.match(/^\/api\/repe\/funds\/([0-9a-fA-F-]+)$/);
    if (fundDetailMatch && method === "GET") {
      const fund = state.funds.find((row) => row.fund_id === fundDetailMatch[1]);
      if (!fund) return fulfillJson(route, { detail: "Fund not found" }, 404);
      return fulfillJson(route, {
        fund,
        terms: [
          {
            fund_term_id: "44444444-4444-4444-8444-000000000001",
            fund_id: fund.fund_id,
            effective_from: "2026-01-01",
            preferred_return_rate: "0.08",
            carry_rate: "0.20",
            waterfall_style: "european",
            created_at: "2026-01-01T00:00:00",
          },
        ],
      });
    }

    const summaryMatch = path.match(/^\/api\/re\/fund\/([0-9a-fA-F-]+)\/summary\/.+$/);
    if (summaryMatch && method === "GET") {
      const fundId = summaryMatch[1];
      const hasAssets = (state.dealsByFund[fundId] || []).some((deal) => (state.assetsByDeal[deal.deal_id] || []).length > 0);
      return fulfillJson(route, {
        id: `summary-${fundId}`,
        fin_fund_id: fundId,
        quarter: "2026Q1",
        portfolio_nav: hasAssets ? "1000000" : "0",
        dpi: hasAssets ? "0.10" : "0",
        tvpi: hasAssets ? "1.10" : "0",
        weighted_ltv: hasAssets ? "0.55" : "0",
        weighted_dscr: hasAssets ? "1.25" : "0",
      });
    }

    const fundDealsMatch = path.match(/^\/api\/repe\/funds\/([0-9a-fA-F-]+)\/deals$/);
    if (fundDealsMatch && method === "GET") {
      return fulfillJson(route, state.dealsByFund[fundDealsMatch[1]] || []);
    }
    if (fundDealsMatch && method === "POST") {
      const fundId = fundDealsMatch[1];
      const body = req.postDataJSON() as Record<string, unknown>;
      const dealId = makeId("deal", state.dealSeq++);
      const row: Deal = {
        deal_id: dealId,
        fund_id: fundId,
        name: String(body.name || "New Investment"),
        deal_type: (body.deal_type as "equity" | "debt") || "equity",
        stage: (body.stage as Deal["stage"]) || "sourcing",
        sponsor: body.sponsor ? String(body.sponsor) : null,
        target_close_date: null,
        created_at: "2026-01-01T00:00:00",
      };
      state.dealsByFund[fundId] = [...(state.dealsByFund[fundId] || []), row];
      state.assetsByDeal[dealId] = [];
      return fulfillJson(route, row);
    }

    const dealMatch = path.match(/^\/api\/repe\/deals\/([0-9a-fA-F-]+)$/);
    if (dealMatch && method === "GET") {
      const dealId = dealMatch[1];
      const deal = Object.values(state.dealsByFund).flat().find((row) => row.deal_id === dealId);
      if (!deal) return fulfillJson(route, { detail: "Deal not found" }, 404);
      return fulfillJson(route, deal);
    }

    const dealAssetsMatch = path.match(/^\/api\/repe\/deals\/([0-9a-fA-F-]+)\/assets$/);
    if (dealAssetsMatch && method === "GET") {
      return fulfillJson(route, state.assetsByDeal[dealAssetsMatch[1]] || []);
    }
    if (dealAssetsMatch && method === "POST") {
      const dealId = dealAssetsMatch[1];
      const body = req.postDataJSON() as Record<string, unknown>;
      const assetId = makeId("asset", state.assetSeq++);
      const row: Asset = {
        asset_id: assetId,
        deal_id: dealId,
        asset_type: (body.asset_type as "property" | "cmbs") || "property",
        name: String(body.name || "New Asset"),
        created_at: "2026-01-01T00:00:00",
      };
      state.assetsByDeal[dealId] = [...(state.assetsByDeal[dealId] || []), row];
      return fulfillJson(route, row);
    }

    const assetMatch = path.match(/^\/api\/repe\/assets\/([0-9a-fA-F-]+)$/);
    if (assetMatch && method === "GET") {
      const assetId = assetMatch[1];
      const asset = Object.values(state.assetsByDeal).flat().find((row) => row.asset_id === assetId);
      if (!asset) return fulfillJson(route, { detail: "Asset not found" }, 404);
      return fulfillJson(route, {
        asset,
        details: {
          property_type: "multifamily",
          market: "Austin",
          units: 120,
          occupancy: 0.94,
        },
      });
    }

    const assetOwnershipMatch = path.match(/^\/api\/repe\/assets\/([0-9a-fA-F-]+)\/ownership$/);
    if (assetOwnershipMatch && method === "GET") {
      return fulfillJson(route, {
        asset_id: assetOwnershipMatch[1],
        as_of_date: "2026-01-01",
        links: [],
        entity_edges: [],
      });
    }

    const assetQuarterMatch = path.match(/^\/api\/re\/asset\/([0-9a-fA-F-]+)\/quarter\/.+$/);
    if (assetQuarterMatch && method === "GET") {
      return fulfillJson(route, { detail: "Not found" }, 404);
    }

    if (path === "/api/re/waterfall/run-shadow" && method === "POST") {
      return fulfillJson(route, {
        run_id: "wf-run-1",
        status: "completed",
      });
    }

    if (path === "/api/documents" && method === "GET") {
      return fulfillJson(route, []);
    }

    if (path === "/api/documents/init-upload" && method === "POST") {
      return fulfillJson(route, {
        document_id: makeId("asset", state.docSeq),
        version_id: makeId("deal", state.docSeq++),
        storage_key: "mock",
        signed_upload_url: `${url.origin}/signed-upload/mock`,
      });
    }

    if (path === "/api/documents/complete-upload" && method === "POST") {
      return fulfillJson(route, { ok: true });
    }

    return route.continue();
  });
}

async function createFundFromWizard(page: Page, envId: string, fundName: string) {
  await page.goto(`/lab/env/${envId}`);
  await page.getByRole("link", { name: "Create Fund" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/lab/env/${envId}/re/funds/new$`));

  await page.getByLabel("Fund Name").fill(fundName);
  await page.getByLabel("Inception Date").fill("2026-01-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create Fund" }).click();

  await expect(page).toHaveURL(new RegExp(`/lab/env/${envId}/re/funds/[0-9a-fA-F-]+$`));
  await expect(page.getByTestId("re-fund-homepage")).toBeVisible();
}

test.describe("RE drill path", () => {
  test("Create Fund quick action routes to wizard and lands on Fund homepage", async ({ page }) => {
    const state = makeState();
    await installWorkspaceMocks(page, state);

    await createFundFromWizard(page, state.envId, "Test Fund Alpha");

    await expect(page.getByRole("heading", { name: "Test Fund Alpha" })).toBeVisible();
    await expect(page.getByTestId("repe-left-nav")).toBeVisible();
    await expect(page.locator('[data-testid="lab-nav-link-environments"]')).toHaveCount(0);
  });

  test("Fund to Investment to Asset drill path works", async ({ page }) => {
    const state = makeState();
    await installWorkspaceMocks(page, state);

    await createFundFromWizard(page, state.envId, "Drill Path Fund");

    await page.getByRole("link", { name: "+ New Investment" }).click();
    await expect(page).toHaveURL(new RegExp(`/lab/env/${state.envId}/re/deals`));

    await page.getByLabel("Investment Name").fill("Downtown JV");
    await page.getByRole("button", { name: "Create Investment" }).click();
    await page.getByRole("link", { name: "Open →" }).first().click();

    await expect(page).toHaveURL(new RegExp(`/lab/env/${state.envId}/re/deals/[0-9a-fA-F-]+$`));
    await expect(page.getByTestId("re-investment-homepage")).toBeVisible();

    await page.getByRole("link", { name: "Add Asset" }).click();
    await expect(page).toHaveURL(new RegExp(`/lab/env/${state.envId}/re/assets`));

    await page.getByLabel("Asset Name").fill("Maple Apartments");
    await page.getByRole("button", { name: "Create Asset" }).click();
    await page.getByRole("link", { name: "Open →" }).first().click();

    await expect(page).toHaveURL(new RegExp(`/lab/env/${state.envId}/re/assets/[0-9a-fA-F-]+$`));
    await expect(page.getByTestId("re-asset-homepage")).toBeVisible();
    await expect(page.locator('[data-testid="lab-nav-link-pipeline"]')).toHaveCount(0);
  });
});
