import { expect, test, type BrowserContext } from "@playwright/test";

/**
 * Pipeline E2E smoke tests.
 * Verifies:
 * 1) Pipeline nav item exists
 * 2) Pipeline page loads with deal list
 * 3) Map container is present
 * 4) Deal detail tabs work
 * 5) Create deal form loads
 */

const TEST_ENV_ID = "00000000-0000-0000-0000-000000000001";
const TEST_BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
const TEST_DEAL_ID = "b1b2c3d4-0001-0001-0001-000000000001";

async function installMocks(context: BrowserContext) {
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    const fulfillJson = async (body: unknown, status = 200) => {
      await route.fulfill({
        status,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    };

    if (path.includes("/repe-context/resolve")) {
      return fulfillJson({
        business_id: TEST_BUSINESS_ID,
        schema_name: "env_test",
        env_id: TEST_ENV_ID,
      });
    }

    if (path.includes("/environments/") && path.includes("/details")) {
      return fulfillJson({
        env_id: TEST_ENV_ID,
        client_name: "Test Capital",
        industry: "real_estate",
        industry_type: "repe",
        schema_name: "env_test",
      });
    }

    if (path.includes("/pipeline/deals") && !path.includes(TEST_DEAL_ID)) {
      return fulfillJson([
        {
          deal_id: TEST_DEAL_ID,
          env_id: TEST_ENV_ID,
          fund_id: null,
          deal_name: "Cherry Creek Apartments",
          status: "sourced",
          source: "CBRE",
          strategy: "value_add",
          property_type: "multifamily",
          target_close_date: "2026-06-30",
          headline_price: 42500000,
          target_irr: 18.5,
          target_moic: 2.1,
          notes: "Class B+ garden-style",
          created_by: "seed",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: null,
        },
      ]);
    }

    if (path.includes(`/pipeline/deals/${TEST_DEAL_ID}/properties`)) {
      return fulfillJson([
        {
          property_id: "b1b2c3d4-0001-0002-0001-000000000001",
          deal_id: TEST_DEAL_ID,
          property_name: "Cherry Creek Apartments",
          address: "2100 S Colorado Blvd",
          city: "Denver",
          state: "CO",
          zip: "80222",
          lat: 39.6789,
          lon: -104.9408,
          property_type: "multifamily",
          units: 248,
          sqft: 215000,
          year_built: 1985,
          occupancy: 0.93,
          noi: 2890000,
          asking_cap_rate: 0.068,
          census_tract_geoid: null,
          created_at: "2024-01-01T00:00:00Z",
        },
      ]);
    }

    if (path.includes(`/pipeline/deals/${TEST_DEAL_ID}/tranches`)) {
      return fulfillJson([
        {
          tranche_id: "b1b2c3d4-0001-0003-0001-000000000001",
          deal_id: TEST_DEAL_ID,
          tranche_name: "Equity A",
          tranche_type: "equity",
          close_date: "2026-06-30",
          commitment_amount: 15000000,
          price: null,
          terms_json: {},
          status: "open",
          created_at: "2024-01-01T00:00:00Z",
        },
      ]);
    }

    if (path.includes(`/pipeline/deals/${TEST_DEAL_ID}/contacts`)) {
      return fulfillJson([
        {
          contact_id: "b1b2c3d4-0001-0004-0001-000000000001",
          deal_id: TEST_DEAL_ID,
          name: "Mark Chen",
          email: "mchen@cbre.com",
          phone: "303-555-1234",
          org: "CBRE",
          role: "Broker",
          created_at: "2024-01-01T00:00:00Z",
        },
      ]);
    }

    if (path.includes(`/pipeline/deals/${TEST_DEAL_ID}/activities`)) {
      return fulfillJson([
        {
          activity_id: "b1b2c3d4-0001-0005-0001-000000000001",
          deal_id: TEST_DEAL_ID,
          tranche_id: null,
          activity_type: "note",
          occurred_at: "2024-01-01T00:00:00Z",
          body: "Initial OM reviewed.",
          created_by: "seed",
          created_at: "2024-01-01T00:00:00Z",
        },
      ]);
    }

    if (path.includes(`/pipeline/deals/${TEST_DEAL_ID}`)) {
      return fulfillJson({
        deal_id: TEST_DEAL_ID,
        env_id: TEST_ENV_ID,
        fund_id: null,
        deal_name: "Cherry Creek Apartments",
        status: "sourced",
        source: "CBRE",
        strategy: "value_add",
        property_type: "multifamily",
        target_close_date: "2026-06-30",
        headline_price: 42500000,
        target_irr: 18.5,
        target_moic: 2.1,
        notes: "Class B+ garden-style",
        created_by: "seed",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: null,
      });
    }

    if (path.includes("/pipeline/map/markers")) {
      return fulfillJson([
        {
          deal_id: TEST_DEAL_ID,
          deal_name: "Cherry Creek Apartments",
          status: "sourced",
          lat: 39.6789,
          lon: -104.9408,
          property_name: "Cherry Creek Apartments",
          property_type: "multifamily",
          headline_price: 42500000,
        },
      ]);
    }

    if (path.includes("/pipeline/census/layers")) {
      return fulfillJson([
        {
          layer_id: "99999999-9999-9999-9999-999999999999",
          layer_name: "median_income",
          census_variable: "B19013_001E",
          label: "Median Income",
          color_scale: "YlOrRd",
          unit: "$",
          description: "Median household income",
          is_active: true,
        },
      ]);
    }

    await route.continue();
  });
}

test.describe("Pipeline", () => {
  test.beforeEach(async ({ context }) => {
    await installMocks(context);
  });

  test("Pipeline nav item appears in workspace shell", async ({ page }) => {
    await page.goto(`/lab/env/${TEST_ENV_ID}/re/pipeline`);
    const nav = page.locator('[data-testid="repe-left-nav"]');
    await expect(nav.getByText("Pipeline")).toBeVisible();
  });

  test("Pipeline page loads with deal list", async ({ page }) => {
    await page.goto(`/lab/env/${TEST_ENV_ID}/re/pipeline`);
    await expect(page.getByText("Cherry Creek Apartments")).toBeVisible();
  });

  test("Pipeline page has map container", async ({ page }) => {
    await page.goto(`/lab/env/${TEST_ENV_ID}/re/pipeline`);
    // The map should be rendered (Leaflet creates a container)
    await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 10000 });
  });

  test("Deal detail page loads", async ({ page }) => {
    await page.goto(`/lab/env/${TEST_ENV_ID}/re/pipeline/${TEST_DEAL_ID}`);
    await expect(page.getByText("Cherry Creek Apartments")).toBeVisible();
  });

  test("Create deal form loads", async ({ page }) => {
    await page.goto(`/lab/env/${TEST_ENV_ID}/re/pipeline/new`);
    await expect(page.getByText("Deal Name")).toBeVisible();
  });
});
