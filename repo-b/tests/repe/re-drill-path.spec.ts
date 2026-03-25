import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type Env = {
  env_id: string;
  client_name: string;
  industry: string;
  industry_type: string;
  schema_name: string;
  is_active: boolean;
  status: string;
  business_id: string;
};

type Fund = {
  fund_id: string;
  business_id: string;
  name: string;
  vintage_year: number;
  fund_type: "closed_end";
  strategy: "equity" | "debt";
  sub_strategy: string | null;
  target_size: string | null;
  term_years: number | null;
  status: "fundraising" | "investing" | "harvesting" | "closed";
  base_currency: string;
  inception_date: string;
  quarter_cadence: "quarterly";
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
  env: Env;
  funds: Fund[];
  deals: Deal[];
  assets: Asset[];
};

function makeState(): MockState {
  return {
    env: {
      env_id: "11111111-1111-4111-8111-111111111111",
      client_name: "RE Test Environment",
      industry: "real_estate",
      industry_type: "real_estate",
      schema_name: "env_re_test",
      is_active: true,
      status: "active",
      business_id: "22222222-2222-4222-8222-222222222222",
    },
    funds: [],
    deals: [],
    assets: [],
  };
}

function nowIso(): string {
  return "2026-02-24T00:00:00";
}

async function installReMocks(context: BrowserContext, state: MockState) {
  await context.route("**/v1/environments", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify({ environments: [state.env] }),
    });
  });

  await context.route("**/v1/environments/*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify(state.env),
    });
  });

  await context.route("**/v1/env/*/health", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify({
        business_exists: true,
        modules_initialized: true,
        repe_status: "ready",
        data_integrity: true,
        content_count: 0,
        ranking_count: 0,
        analytics_count: 0,
        crm_count: 0,
      }),
    });
  });

  await context.route("**/v1/audit**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify({ items: [] }),
    });
  });

  await context.route(`**/api/businesses/${state.env.business_id}/departments**`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify([]),
    });
  });

  await context.route("**/api/repe/context**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify({
        env_id: state.env.env_id,
        business_id: state.env.business_id,
        created: false,
        source: "test",
        diagnostics: {},
      }),
    });
  });

  await context.route("**/api/repe/context/init**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify({
        env_id: state.env.env_id,
        business_id: state.env.business_id,
        created: false,
        source: "test",
        diagnostics: {},
      }),
    });
  });

  await context.route("**/api/re/v1/funds**", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req_test" },
        body: JSON.stringify(state.funds),
      });
      return;
    }

    if (req.method() === "POST") {
      const payload = req.postDataJSON() as Record<string, unknown>;
      const fundId = `00000000-0000-4000-8000-${String(state.funds.length + 1).padStart(12, "0")}`;
      const fund: Fund = {
        fund_id: fundId,
        business_id: state.env.business_id,
        name: String(payload.name || "New Fund"),
        vintage_year: Number(payload.vintage_year || 2026),
        fund_type: "closed_end",
        strategy: (payload.strategy as "equity" | "debt") || "equity",
        sub_strategy: (payload.sub_strategy as string) || null,
        target_size: (payload.target_size as string) || null,
        term_years: payload.term_years ? Number(payload.term_years) : null,
        status: "investing",
        base_currency: String(payload.base_currency || "USD"),
        inception_date: String(payload.inception_date || "2026-01-01"),
        quarter_cadence: "quarterly",
        target_sectors_json: Array.isArray(payload.target_sectors) ? (payload.target_sectors as string[]) : [],
        target_geographies_json: Array.isArray(payload.target_geographies) ? (payload.target_geographies as string[]) : [],
        metadata_json: {},
        created_at: nowIso(),
      };
      state.funds.unshift(fund);
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req_test" },
        body: JSON.stringify(fund),
      });
      return;
    }

    await route.continue();
  });

  await context.route("**/api/re/v1/funds/*", async (route) => {
    const fundId = route.request().url().split("/").pop() || "";
    const fund = state.funds.find((row) => row.fund_id === fundId);
    if (!fund) {
      await route.fulfill({
        status: 404,
        headers: { "content-type": "application/json", "x-request-id": "req_test" },
        body: JSON.stringify({ detail: "Fund not found" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify({
        fund,
        terms: [
          {
            fund_term_id: "44444444-4444-4444-8444-444444444444",
            fund_id: fund.fund_id,
            effective_from: "2026-01-01",
            preferred_return_rate: "0.08",
            carry_rate: "0.20",
            waterfall_style: "european",
            created_at: nowIso(),
          },
        ],
      }),
    });
  });

  await context.route(`**/api/repe/businesses/${state.env.business_id}/funds`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify(state.funds),
    });
  });

  await context.route("**/api/repe/funds/*/deals", async (route) => {
    const req = route.request();
    const segments = new URL(req.url()).pathname.split("/");
    const fundId = segments[4];

    if (req.method() === "GET") {
      const rows = state.deals.filter((deal) => deal.fund_id === fundId);
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req_test" },
        body: JSON.stringify(rows),
      });
      return;
    }

    if (req.method() === "POST") {
      const payload = req.postDataJSON() as Record<string, unknown>;
      const deal: Deal = {
        deal_id: `10000000-0000-4000-8000-${String(state.deals.length + 1).padStart(12, "0")}`,
        fund_id: fundId,
        name: String(payload.name || "New Investment"),
        deal_type: (payload.deal_type as "equity" | "debt") || "equity",
        stage: (payload.stage as Deal["stage"]) || "sourcing",
        sponsor: (payload.sponsor as string) || null,
        target_close_date: (payload.target_close_date as string) || null,
        created_at: nowIso(),
      };
      state.deals.unshift(deal);
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req_test" },
        body: JSON.stringify(deal),
      });
      return;
    }

    await route.continue();
  });

  await context.route("**/api/repe/funds/*", async (route) => {
    const fundId = route.request().url().split("/").pop() || "";
    const fund = state.funds.find((row) => row.fund_id === fundId);
    if (!fund) {
      await route.fulfill({
        status: 404,
        headers: { "content-type": "application/json", "x-request-id": "req_test" },
        body: JSON.stringify({ detail: "Fund not found" }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify({
        fund,
        terms: [
          {
            fund_term_id: "44444444-4444-4444-8444-444444444444",
            fund_id: fund.fund_id,
            effective_from: "2026-01-01",
            preferred_return_rate: "0.08",
            carry_rate: "0.20",
            waterfall_style: "european",
            created_at: nowIso(),
          },
        ],
      }),
    });
  });

  await context.route("**/api/repe/deals/*/assets", async (route) => {
    const req = route.request();
    const segments = new URL(req.url()).pathname.split("/");
    const dealId = segments[4];

    if (req.method() === "GET") {
      const rows = state.assets.filter((asset) => asset.deal_id === dealId);
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req_test" },
        body: JSON.stringify(rows),
      });
      return;
    }

    if (req.method() === "POST") {
      const payload = req.postDataJSON() as Record<string, unknown>;
      const asset: Asset = {
        asset_id: `20000000-0000-4000-8000-${String(state.assets.length + 1).padStart(12, "0")}`,
        deal_id: dealId,
        asset_type: (payload.asset_type as "property" | "cmbs") || "property",
        name: String(payload.name || "New Asset"),
        created_at: nowIso(),
      };
      state.assets.unshift(asset);
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req_test" },
        body: JSON.stringify(asset),
      });
      return;
    }

    await route.continue();
  });

  await context.route("**/api/repe/deals/*", async (route) => {
    const dealId = route.request().url().split("/").pop() || "";
    const deal = state.deals.find((row) => row.deal_id === dealId);
    if (!deal) {
      await route.fulfill({
        status: 404,
        headers: { "content-type": "application/json", "x-request-id": "req_test" },
        body: JSON.stringify({ detail: "Deal not found" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify(deal),
    });
  });

  await context.route("**/api/repe/assets/*/ownership", async (route) => {
    const assetId = new URL(route.request().url()).pathname.split("/")[4];
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify({ asset_id: assetId, as_of_date: "2026-03-31", links: [], entity_edges: [] }),
    });
  });

  await context.route("**/api/repe/assets/*", async (route) => {
    const assetId = route.request().url().split("/").pop() || "";
    const asset = state.assets.find((row) => row.asset_id === assetId);
    if (!asset) {
      await route.fulfill({
        status: 404,
        headers: { "content-type": "application/json", "x-request-id": "req_test" },
        body: JSON.stringify({ detail: "Asset not found" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify({
        asset,
        details: {
          property_type: "multifamily",
          market: "Austin",
          units: 210,
          occupancy: "0.95",
        },
      }),
    });
  });

  await context.route("**/api/re/asset/*/quarter/*", async (route) => {
    const segments = new URL(route.request().url()).pathname.split("/");
    const assetId = segments[4];
    const quarter = segments[6];
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fin_asset_investment_id: assetId,
        quarter,
        valuation_snapshot_id: "66666666-6666-4666-8666-666666666666",
        net_operating_income: "150000",
        implied_gross_value: "4500000",
        implied_equity_value: "2200000",
        nav_equity: "2200000",
        dscr: "1.42",
        ltv: "0.58",
      }),
    });
  });

  await context.route("**/api/re/fund/*/summary/*", async (route) => {
    const segments = new URL(route.request().url()).pathname.split("/");
    const fundId = segments[4];
    const quarter = segments[6];
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify({
        id: "77777777-7777-4777-8777-777777777777",
        fin_fund_id: fundId,
        quarter,
        portfolio_nav: "0",
        dpi: "0",
        tvpi: "0",
        weighted_ltv: "0",
        weighted_dscr: "0",
      }),
    });
  });

  await context.route("**/api/re/waterfall/run-shadow", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_test" },
      body: JSON.stringify({ run_id: "wf-1", status: "completed" }),
    });
  });

  await context.route("**/api/documents**", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      const fundId = state.funds[0]?.fund_id || "00000000-0000-4000-8000-000000000000";
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req_test" },
        body: JSON.stringify([
          {
            document_id: "88888888-8888-4888-8888-888888888888",
            business_id: state.env.business_id,
            department_id: null,
            title: "Fund Deck",
            virtual_path: `re/env/${state.env.env_id}/fund/${fundId}/fund-deck.pdf`,
            status: "available",
            created_at: nowIso(),
            latest_content_type: "application/pdf",
          },
          {
            document_id: "99999999-9999-4999-8999-999999999999",
            business_id: state.env.business_id,
            department_id: null,
            title: "Other Asset Doc",
            virtual_path: `re/env/${state.env.env_id}/asset/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/lease.pdf`,
            status: "available",
            created_at: nowIso(),
            latest_content_type: "application/pdf",
          },
        ]),
      });
      return;
    }

    if (req.method() === "POST") {
      const path = new URL(req.url()).pathname;
      if (path.endsWith("/init-upload")) {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json", "x-request-id": "req_test" },
          body: JSON.stringify({
            document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            version_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            storage_key: "k",
            signed_upload_url: "https://upload.test/signed",
          }),
        });
        return;
      }
      if (path.endsWith("/complete-upload")) {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json", "x-request-id": "req_test" },
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
    }

    await route.continue();
  });

  await context.route("https://upload.test/**", async (route) => {
    await route.fulfill({ status: 200, body: "" });
  });
}

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
  }, "11111111-1111-4111-8111-111111111111");
}

test.beforeEach(async ({ context, page, baseURL }) => {
  const state = makeState();
  await setAuthCookie(context, page, baseURL);
  await installReMocks(context, state);
});

test("Create Fund quick action opens wizard and lands on fund homepage", async ({ page }) => {
  const envId = "11111111-1111-4111-8111-111111111111";

  await page.goto(`/lab/env/${envId}`);
  await page.getByRole("link", { name: "Create Fund" }).first().click();

  await expect(page).toHaveURL(new RegExp(`/lab/env/${envId}/re/funds/new$`));
  await expect(page.getByTestId("re-fund-create-wizard")).toBeVisible();

  await page.getByLabel("Fund Name").fill("Test Fund Alpha");
  await page.getByLabel("Inception Date").fill("2026-01-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create Fund" }).click();

  await expect(page).toHaveURL(new RegExp(`/lab/env/${envId}/re/funds/`));
  await expect(page.getByRole("heading", { name: "Test Fund Alpha" })).toBeVisible();

  const fundSelector = page.locator('label:has-text("Fund") select').first();
  await expect(fundSelector).toContainText("Test Fund Alpha");

  await page.getByRole("button", { name: "Audit" }).click();
  await expect(page.getByText("fund.created")).toBeVisible();
});

test("Drill path works Fund -> Investment -> Asset", async ({ page }) => {
  const envId = "11111111-1111-4111-8111-111111111111";

  await page.goto(`/lab/env/${envId}/re/funds/new`);
  await page.getByLabel("Fund Name").fill("Drill Fund");
  await page.getByLabel("Inception Date").fill("2026-01-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create Fund" }).click();

  await page.goto(`/lab/env/${envId}/re/deals`);
  await page.getByLabel("Investment Name").fill("Deal One");
  await page.getByRole("button", { name: "Create Investment" }).click();
  await expect(page.getByText("Deal One")).toBeVisible();

  await page.getByRole("link", { name: "Open →" }).first().click();
  await expect(page.getByTestId("re-investment-homepage")).toBeVisible();

  await page.getByRole("link", { name: "Add Asset" }).click();
  await expect(page).toHaveURL(new RegExp(`/lab/env/${envId}/re/assets`));

  await page.getByLabel("Asset Name").fill("Asset One");
  await page.getByRole("button", { name: "Create Asset" }).click();
  await expect(page.getByText("Asset One")).toBeVisible();

  await page.getByRole("link", { name: "Open →" }).first().click();
  await expect(page.getByTestId("re-asset-homepage")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Asset One" })).toBeVisible();
});

test("RE shell hides global nav and keeps legacy redirects", async ({ page }) => {
  const envId = "11111111-1111-4111-8111-111111111111";

  await page.goto(`/lab/env/${envId}/re`);
  await expect(page.getByTestId("repe-left-nav")).toBeVisible();
  await expect(page.getByTestId("lab-nav-link-environments")).toHaveCount(0);

  await page.goto(`/lab/env/${envId}/re/portfolio`);
  await expect(page).toHaveURL(new RegExp(`/lab/env/${envId}/re$`));

  await page.goto("/app/repe/funds");
  await expect(page).toHaveURL(new RegExp(`/lab/env/${envId}/re/funds$`));
});
