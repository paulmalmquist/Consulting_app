import { test, expect } from "@playwright/test";

const ENV_ID = "11111111-1111-4111-8111-111111111111";

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

  await page.route("**/v1/environments/**", async (route) => {
    await route.fulfill({
      json: {
        env_id: ENV_ID,
        client_name: "Supply Chain Demo",
        industry: "supply_chain",
        industry_type: "supply_chain",
        schema_name: "env_supply_chain",
        is_active: true,
      },
    });
  });
});

test("Supply Chain shell renders Command Center and navigates the sidebar", async ({ page }) => {
  await page.goto(`/lab/env/${ENV_ID}/supply-chain`);

  await expect(
    page.getByRole("heading", { name: /Supply Chain Data Platform/i })
  ).toBeVisible();
  await expect(page.getByText("Platform Maturity")).toBeVisible();

  // Navigate every section in the sidebar.
  const sections = [
    { label: "Architecture", heading: /Lakehouse architecture/i },
    { label: "Source Systems", heading: /Connected source systems/i },
    { label: "Medallion Pipelines", heading: /Bronze . Silver . Gold inventory/i },
    { label: "Data Products", heading: /Certified supply chain data products/i },
    { label: "Governance", heading: /Unity Catalog governance/i },
    { label: "AI SDLC", heading: /AI-accelerated delivery/i },
    { label: "Forecasting / ML", heading: /Models in production and pilot/i },
    { label: "Genie / NL BI", heading: /Ask the lakehouse a question/i },
    { label: "Delivery Roadmap", heading: /90-day plan/i },
  ];

  for (const sec of sections) {
    await page.getByTestId("supply-chain-sidebar").getByRole("link", { name: sec.label }).click();
    await expect(page.getByRole("heading", { name: sec.heading })).toBeVisible();
  }
});
