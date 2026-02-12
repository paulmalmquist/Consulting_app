import { expect, test } from "@playwright/test";

const BIZ_ID = "biz_finance_e2e";

const departments = [
  {
    department_id: "dept_finance",
    key: "finance",
    label: "Finance",
    icon: "dollar-sign",
    sort_order: 15,
    enabled: true,
  },
];

const capabilities = [
  {
    capability_id: "cap_finance_jv",
    department_id: "dept_finance",
    department_key: "finance",
    key: "jv-waterfall-model",
    label: "JV Waterfall Model",
    kind: "dashboard",
    sort_order: 10,
    metadata_json: {},
    enabled: true,
  },
];

test.beforeEach(async ({ context, page, baseURL }) => {
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

  await page.addInitScript(([bizId]) => {
    localStorage.setItem("bos_business_id", bizId);
  }, [BIZ_ID]);

  const dealId = "deal_sunset_1";
  const scenarioId = "scenario_base_1";
  const waterfallId = "wf_1";
  const runId = "run_1";

  await page.route("**/api/departments", async (route) => {
    await route.fulfill({ json: departments });
  });

  await page.route("**/api/templates", async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route(`**/api/businesses/${BIZ_ID}/departments`, async (route) => {
    await route.fulfill({ json: departments });
  });

  await page.route(`**/api/businesses/${BIZ_ID}/departments/**/capabilities`, async (route) => {
    await route.fulfill({ json: capabilities });
  });

  await page.route("**/api/finance/**", async (route) => {
    const req = route.request();
    const reqUrl = new URL(req.url());
    const path = reqUrl.pathname;
    const method = req.method();

    if (method === "GET" && path.endsWith("/api/finance/deals")) {
      await route.fulfill({ json: [{ id: dealId, name: "Sunset Commons JV", fund_name: "Sunset Growth Fund I", strategy: "Value-Add" }] });
      return;
    }

    if (method === "POST" && path.endsWith("/api/finance/deals")) {
      await route.fulfill({
        json: {
          deal_id: dealId,
          fund_id: "fund_1",
          waterfall_id: waterfallId,
          default_scenario_id: scenarioId,
        },
      });
      return;
    }

    if (method === "GET" && path.endsWith(`/api/finance/deals/${dealId}`)) {
      await route.fulfill({
        json: {
          deal: {
            id: dealId,
            name: "Sunset Commons JV",
            strategy: "Value-Add Multifamily",
            start_date: "2024-01-15",
            default_scenario_id: scenarioId,
            fund_id: "fund_1",
            fund_name: "Sunset Growth Fund I",
            currency: "USD",
          },
          partners: [
            {
              id: "partner_lp",
              name: "Blue Oak Capital",
              role: "LP",
              commitment_amount: 9000000,
              ownership_pct: 0.9,
              has_promote: false,
            },
            {
              id: "partner_gp",
              name: "Winston Sponsor",
              role: "GP",
              commitment_amount: 1000000,
              ownership_pct: 0.1,
              has_promote: true,
            },
          ],
          properties: [],
          waterfalls: [
            {
              id: waterfallId,
              deal_id: dealId,
              name: "Sunset Standard Waterfall",
              distribution_frequency: "monthly",
              promote_structure_type: "american",
              tiers: [
                { id: "t1", tier_order: 1, tier_type: "return_of_capital", split_lp: 0.9, split_gp: 0.1, notes: "ROC" },
                { id: "t2", tier_order: 2, tier_type: "preferred_return", pref_rate: 0.08, split_lp: 1, split_gp: 0, notes: "Pref" },
                { id: "t3", tier_order: 3, tier_type: "catch_up", catch_up_pct: 0.5, split_lp: 0.5, split_gp: 0.5, notes: "Catch-up" },
                { id: "t4", tier_order: 4, tier_type: "split", hurdle_irr: 0.14, split_lp: 0.8, split_gp: 0.2, notes: "Split" },
              ],
            },
          ],
          scenarios: [
            {
              id: scenarioId,
              deal_id: dealId,
              name: "Base",
              as_of_date: "2024-01-15",
              assumptions: [
                { key: "exit_date", value_text: "2028-12-31" },
                { key: "sale_price", value_num: 18000000 },
                { key: "exit_cap_rate", value_num: 0.0525 },
                { key: "noi_growth", value_num: 0.025 },
              ],
            },
          ],
        },
      });
      return;
    }

    if (method === "PUT" && path.endsWith(`/api/finance/scenarios/${scenarioId}`)) {
      await route.fulfill({
        json: {
          id: scenarioId,
          deal_id: dealId,
          name: "Base",
          as_of_date: "2024-01-15",
        },
      });
      return;
    }

    if (method === "POST" && path.endsWith(`/api/finance/deals/${dealId}/runs`)) {
      await route.fulfill({
        json: {
          model_run_id: runId,
          status: "completed",
          reused_existing: false,
          run_hash: "abc123",
          engine_version: "wf_engine_v1.0.0",
        },
      });
      return;
    }

    if (method === "GET" && path.endsWith(`/api/finance/runs/${runId}/summary`)) {
      await route.fulfill({
        json: {
          model_run_id: runId,
          deal_id: dealId,
          scenario_id: scenarioId,
          waterfall_id: waterfallId,
          run_hash: "abc123",
          engine_version: "wf_engine_v1.0.0",
          status: "completed",
          started_at: "2026-02-11T00:00:00Z",
          completed_at: "2026-02-11T00:00:01Z",
          metrics: {
            lp_irr: 0.1612,
            gp_irr: 0.224,
            lp_em: 1.78,
            gp_em: 2.95,
            total_promote: 1250000,
            moic: 1.95,
            dpi: 1.65,
            tvpi: 1.65,
          },
          meta: {},
        },
      });
      return;
    }

    if (method === "GET" && path.endsWith(`/api/finance/runs/${runId}/distributions`)) {
      const groupBy = reqUrl.searchParams.get("group_by") || "partner";

      const details = [
        {
          date: "2025-01-01",
          tier_id: "t1",
          partner_id: "partner_lp",
          partner_name: "Blue Oak Capital",
          tier_order: 1,
          tier_type: "return_of_capital",
          distribution_amount: 900000,
          distribution_type: "roc",
          lineage_json: { available_before: "1000000", available_after: "100000" },
        },
        {
          date: "2025-01-01",
          tier_id: "t1",
          partner_id: "partner_gp",
          partner_name: "Winston Sponsor",
          tier_order: 1,
          tier_type: "return_of_capital",
          distribution_amount: 100000,
          distribution_type: "roc",
          lineage_json: { available_before: "1000000", available_after: "0" },
        },
        {
          date: "2025-01-01",
          tier_id: "t2",
          partner_id: "partner_lp",
          partner_name: "Blue Oak Capital",
          tier_order: 2,
          tier_type: "preferred_return",
          distribution_amount: 250000,
          distribution_type: "pref",
          lineage_json: { available_before: "250000", available_after: "0" },
        },
      ];

      if (groupBy === "date") {
        await route.fulfill({
          json: {
            model_run_id: runId,
            group_by: "date",
            grouped: [{ group_key: "2025-01-01", amount: 1250000 }],
            details,
          },
        });
        return;
      }

      if (groupBy === "tier") {
        await route.fulfill({
          json: {
            model_run_id: runId,
            group_by: "tier",
            grouped: [
              { group_key: "Tier 1 - return_of_capital", amount: 1000000 },
              { group_key: "Tier 2 - preferred_return", amount: 250000 },
            ],
            details,
          },
        });
        return;
      }

      await route.fulfill({
        json: {
          model_run_id: runId,
          group_by: "partner",
          grouped: [
            { group_key: "Blue Oak Capital", amount: 1150000 },
            { group_key: "Winston Sponsor", amount: 100000 },
          ],
          details,
        },
      });
      return;
    }

    if (method === "GET" && path.endsWith(`/api/finance/runs/${runId}/explain`)) {
      await route.fulfill({
        json: {
          model_run_id: runId,
          partner_id: reqUrl.searchParams.get("partner_id") || "partner_lp",
          date: reqUrl.searchParams.get("date") || "2025-01-01",
          rows: [
            {
              date: "2025-01-01",
              tier_id: "t1",
              tier_order: 1,
              tier_type: "return_of_capital",
              distribution_amount: 900000,
              distribution_type: "roc",
              lineage_json: { available_before: "1000000", available_after: "100000" },
            },
            {
              date: "2025-01-01",
              tier_id: "t2",
              tier_order: 2,
              tier_type: "preferred_return",
              distribution_amount: 250000,
              distribution_type: "pref",
              lineage_json: { available_before: "250000", available_after: "0" },
            },
          ],
        },
      });
      return;
    }

    await route.fallback();
  });
});

test("create deal, edit scenario, run model, and inspect explain panel", async ({ page }) => {
  await page.goto("/app/finance/deals");

  await expect(page.getByTestId("deal-create")).toBeVisible();
  await page.getByTestId("deal-create").click();

  await expect(page).toHaveURL(/\/app\/finance\/deals\/deal_sunset_1/);
  await expect(page.getByTestId("waterfall-tier-table")).toBeVisible();

  await page.getByRole("link", { name: /Base/i }).click();
  await expect(page).toHaveURL(/\/app\/finance\/deals\/deal_sunset_1\/scenario\/scenario_base_1/);

  await page.getByTestId("scenario-input-sale-price").fill("19500000");
  await page.getByTestId("run-model").click();

  await expect(page).toHaveURL(/\/app\/finance\/runs\/run_1/);

  const lpIrrText = await page.getByTestId("run-summary-lp-irr").textContent();
  expect(lpIrrText || "").not.toContain("NaN");

  await expect(page.getByTestId("chart-cashflow")).toBeVisible();
  await expect(page.getByTestId("chart-distributions")).toBeVisible();

  await expect(page.getByTestId("explain-panel")).toBeVisible();
  await expect(page.getByTestId("explain-panel").locator("tbody tr")).toHaveCount(2);
});
