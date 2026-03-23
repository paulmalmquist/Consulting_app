import { expect, test } from "@playwright/test";

test("winston institutional demo walkthrough is reachable and governed", async ({ page, request, baseURL }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("response", (response) => {
    if (!baseURL) return;
    if (!response.url().startsWith(baseURL)) return;
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  const createResponse = await request.post("/api/winston-demo/create_env_meridian");
  expect(createResponse.ok()).toBeTruthy();
  const created = (await createResponse.json()) as {
    env: { env_id: string };
  };
  const envId = created.env.env_id;

  await page.goto(`/lab/env/${envId}/documents`);
  await expect(page.getByText("Documents Hub")).toBeVisible();
  await page.getByRole("button", { name: "Run Hybrid Search" }).click();
  await expect(page.getByText("14 Metric Definitions")).toBeVisible();

  await page.goto(`/lab/env/${envId}/demo`);
  await expect(page.getByText("Live Demo Checklist")).toBeVisible();
  await page.getByRole("button", { name: "Ask Winston" }).click();
  await expect(page.getByText("Audit Trace ID:")).toBeVisible();
  await expect(page.locator('a[href*="/lab/env/"][href*="/documents?documentId="]').first()).toBeVisible();

  await page.getByRole("button", { name: "Query" }).click();
  await page.getByRole("button", { name: "Generate Query Plan" }).click();
  await expect(page.getByText("Query Plan")).toBeVisible();
  await page.getByRole("button", { name: "Run Query" }).click();
  await expect(page.getByText("Aurora Residences")).toBeVisible();
  await expect(page.getByText("Foundry Logistics Center")).toBeVisible();

  await page.getByRole("button", { name: "Scenario" }).click();
  await page.getByRole("button", { name: "Generate Scenario Plan" }).click();
  await expect(page.getByText("Scenario Plan")).toBeVisible();
  await page.getByRole("button", { name: "Apply Scenario" }).click();
  await expect(page.getByText("Scenario Delta vs Base")).toBeVisible();

  await page.getByRole("link", { name: "Open Definitions" }).click();
  await expect(page.getByText("Definitions Registry")).toBeVisible();
  await expect(page.getByText("Propose Change")).toBeVisible();
  const primaryDefinitionTextarea = page.locator("textarea").first();
  await primaryDefinitionTextarea.fill(
    "Net Operating Income represents recurring property-level operating income after vacancy, operating expenses, and normalized ancillary revenue, before debt service, capital expenditures, and fund-level fees."
  );
  await page.getByRole("button", { name: "Propose Change" }).click();
  await expect(page.getByRole("button", { name: "Approve Change" })).toBeVisible();
  await page.getByRole("button", { name: "Approve Change" }).click();
  await expect(page.getByText("Definition Updated - Recompute Recommended")).toBeVisible();

  await page.getByRole("button", { name: /Open Audit Trail|Audit Trail/ }).first().click();
  await expect(page.getByText("Audit Trail")).toBeVisible();
  await expect(page.getByText(/assistant_ask|query|scenario_update|definition_change/).first()).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});
