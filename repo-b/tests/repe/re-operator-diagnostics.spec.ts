import { expect, test, type BrowserContext } from "@playwright/test";

const ENV_ID = "00000000-0000-0000-0000-000000000001";

const MOCK_DIAGNOSTICS = {
  summary: {
    env_id: ENV_ID,
    quarter: "2026Q2",
    asset_count: 4,
    released_count: 3,
    avg_noi_margin: "0.28",
    avg_occupancy: "0.935",
    avg_labor_intensity: "0.48",
    avg_peer_delta: "0.00",
    state_origin: "derived",
    null_reasons: {},
  },
  operators: [
    {
      operator_name: "Brookdale",
      asset_count: 2,
      avg_noi_margin: "0.25",
      avg_occupancy: "0.92",
      avg_labor_intensity: "0.50",
      peer_margin_delta: "-0.03",
      rank: 2,
      trust_status: "trusted",
      contains_seed_sources: true,
    },
    {
      operator_name: "Atria",
      asset_count: 2,
      avg_noi_margin: "0.31",
      avg_occupancy: "0.95",
      avg_labor_intensity: "0.42",
      peer_margin_delta: "0.03",
      rank: 1,
      trust_status: "trusted",
      contains_seed_sources: true,
    },
  ],
  assets: [
    {
      asset_id: "aaaa0000-0000-0000-0000-000000000001",
      name: "Oakwood Grove",
      operator_name: "Brookdale",
      acuity_type: "AL",
      size_band: "mid",
      market: "Dallas",
      units: 110,
      noi: "280000",
      occupancy: "0.92",
      revenue: "1100000",
      labor_cost: "550000",
      noi_margin: "0.255",
      labor_intensity: "0.50",
      occupancy_trend_qoq: "-0.005",
      peer_margin_delta: "-0.03",
      state_origin: "authoritative",
      snapshot_version: "v1",
      period_exact: true,
      null_reasons: {},
      sources: {
        operator_name_source: "seed",
        acuity_type_source: "seed",
        labor_cost_source: "seed",
        revenue_source: "seed",
      },
      peer_set: { acuity_type: "AL", region: "Dallas", size_band: "mid", peer_count: 3 },
    },
    {
      asset_id: "aaaa0000-0000-0000-0000-000000000002",
      name: "Cedar Pines",
      operator_name: "Atria",
      acuity_type: "AL",
      size_band: "mid",
      market: "Dallas",
      units: 95,
      noi: "360000",
      occupancy: "0.95",
      revenue: "1200000",
      labor_cost: "504000",
      noi_margin: "0.30",
      labor_intensity: "0.42",
      occupancy_trend_qoq: "0.01",
      peer_margin_delta: "0.03",
      state_origin: "authoritative",
      snapshot_version: "v1",
      period_exact: true,
      null_reasons: {},
      sources: {
        operator_name_source: "seed",
        acuity_type_source: "seed",
        labor_cost_source: "seed",
        revenue_source: "seed",
      },
      peer_set: { acuity_type: "AL", region: "Dallas", size_band: "mid", peer_count: 3 },
    },
    {
      asset_id: "aaaa0000-0000-0000-0000-000000000003",
      name: "Maple Terrace",
      operator_name: "Brookdale",
      acuity_type: "AL",
      size_band: "mid",
      market: "Dallas",
      units: 100,
      noi: null,
      occupancy: null,
      revenue: null,
      labor_cost: null,
      noi_margin: null,
      labor_intensity: null,
      occupancy_trend_qoq: null,
      peer_margin_delta: null,
      state_origin: "fallback",
      snapshot_version: null,
      period_exact: false,
      null_reasons: {
        noi: "authoritative_state_not_released",
        occupancy: "authoritative_state_not_released",
        noi_margin: "authoritative_state_not_released",
        peer_margin_delta: "asset_not_released_or_margin_missing",
      },
      sources: {
        operator_name_source: "seed",
        acuity_type_source: "seed",
        labor_cost_source: null,
        revenue_source: null,
      },
      peer_set: { acuity_type: "AL", region: "Dallas", size_band: "mid", peer_count: 3 },
    },
  ],
  audit: {
    snapshot_versions: ["v1"],
    released_count: 3,
    missing_count: 1,
    peer_set_definition: {
      cohort_keys: ["acuity_type", "region", "size_band"],
      min_sample: 3,
      aggregation: "mean",
      exclude_self: true,
    },
    peer_count_histogram: { "0-2": 0, "3-5": 4, "6-10": 0, "11+": 0 },
    metric_suppression_reasons: {
      noi: { authoritative_state_not_released: 1 },
    },
    source_provenance_counts: {
      operator_name_source: { seed: 4 },
      labor_cost_source: { seed: 3 },
    },
    demo_seed_present: true,
    quarter: "2026Q2",
    requested_quarter: "2026Q2",
    generated_at: "2026-04-21T00:00:00Z",
  },
};

async function installMocks(context: BrowserContext) {
  await context.route("**/api/re/v2/operator-diagnostics*", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(MOCK_DIAGNOSTICS),
    });
  });
  // Permissive catch-all so other page requests don't 404 the test.
  await context.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/re/v2/operator-diagnostics")) {
      return; // already handled above
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
  });
}

test.describe("Operator Diagnostics", () => {
  test.beforeEach(async ({ context }) => {
    await installMocks(context);
  });

  test("renders summary, operator ranking, scatter, and drilldown", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/operator-diagnostics?quarter=2026Q2`);

    await expect(page.getByRole("heading", { name: "Operator Diagnostics" })).toBeVisible();
    await expect(page.getByTestId("summary-strip")).toBeVisible();
    await expect(page.getByTestId("operator-ranking")).toBeVisible();
    await expect(page.getByTestId("operator-scatter")).toBeVisible();
    await expect(page.getByTestId("asset-drilldown")).toBeVisible();

    // Seed banner visible when audit.demo_seed_present=true
    await expect(page.getByTestId("seed-banner")).toBeVisible();
  });

  test("unreleased row renders null reason text verbatim", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/operator-diagnostics?quarter=2026Q2`);
    const drilldown = page.getByTestId("asset-drilldown");
    await expect(drilldown).toContainText("Maple Terrace");
    await expect(drilldown).toContainText("authoritative_state_not_released");
  });

  test("clicking an operator filters the displayed data", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/operator-diagnostics?quarter=2026Q2`);

    await page.getByTestId("operator-ranking").getByText("Atria").first().click();

    // URL reflects filter
    await expect(page).toHaveURL(/operator=Atria/);
  });

  test("audit_mode=1 renders the audit drawer with peer set definition", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/operator-diagnostics?quarter=2026Q2&audit_mode=1`);
    const drawer = page.getByTestId("audit-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("peer_set_definition");
    await expect(drawer).toContainText("demo_seed_present");
  });

  test("Explain underperformance button dispatches companion open event", async ({ page }) => {
    await page.goto(`/lab/env/${ENV_ID}/re/operator-diagnostics?quarter=2026Q2`);
    await page.addInitScript(() => {
      (window as any).__COMPANION_EVENTS__ = [];
      window.addEventListener("bm:winston-companion-open", (ev: Event) => {
        (window as any).__COMPANION_EVENTS__.push((ev as CustomEvent).detail);
      });
    });
    // Re-navigate so init script runs before page scripts
    await page.goto(`/lab/env/${ENV_ID}/re/operator-diagnostics?quarter=2026Q2`);
    await page.getByTestId("explain-button").click();
    const events = await page.evaluate(() => (window as any).__COMPANION_EVENTS__);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]).toMatchObject({ source: "operator-diagnostics" });
  });
});
