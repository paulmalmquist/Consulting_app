import { expect, test } from "@playwright/test";

test("REPE end-to-end journey", async ({ context, page, baseURL }) => {
  test.setTimeout(180_000);
  if (!baseURL) throw new Error("baseURL missing");
  const url = new URL(baseURL);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const criticalResponses: string[] = [];

  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("response", (resp) => {
    if ([500, 502, 503].includes(resp.status())) {
      criticalResponses.push(`${resp.status()} ${resp.url()}`);
    }
  });

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

  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.goto("/onboarding");
  await page.getByPlaceholder("Acme Corp").fill("GreenRock RE Partners (Test)");
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-path-template").click();
  await expect(page.getByRole("heading", { name: "Select a Template" })).toBeVisible();
  await page.locator("[data-testid^='template-card-']").first().click();
  await page.getByTestId("onboarding-provision").click();

  await expect(page).toHaveURL(/\/app/);
  const businessId = await page.evaluate(() => window.localStorage.getItem("bos_business_id"));
  expect(businessId).toBeTruthy();

  await page.goto("/app/finance/repe");
  await expect(page.getByRole("heading", { name: "Private Equity Waterfall Operations" })).toBeVisible();
  await expect(page.getByTestId("repe-partition-select").locator("option")).toHaveCount(1);

  await page.getByTestId("fund-name").fill("Value-Add Multifamily Fund I (Test)");
  await page.getByTestId("fund-code").fill(`VAMF1_${Date.now().toString().slice(-5)}`);
  await page.getByTestId("fund-strategy").fill("Value-Add");
  await page.getByTestId("fund-vintage").fill("2025-01-15");
  await page.getByTestId("fund-pref").fill("0.08");
  await page.getByTestId("fund-carry").fill("0.2");
  await page.getByTestId("fund-style").selectOption("american");
  await page.getByTestId("create-fund").click();
  await expect(page.getByTestId(/fund-row-/).first()).toContainText("Value-Add Multifamily Fund I (Test)");

  await page.reload();
  await expect(page.getByTestId(/fund-row-/).first()).toContainText("Value-Add Multifamily Fund I (Test)");

  await page.getByTestId("participant-name").fill("Sunshine Pension LP (Test)");
  await page.getByTestId("participant-type").selectOption("lp");
  await page.getByTestId("create-participant").click();
  await page.getByTestId("participant-name").fill("GreenRock GP LLC (Test)");
  await page.getByTestId("participant-type").selectOption("gp");
  await page.getByTestId("create-participant").click();

  await page.getByTestId("commitment-participant").selectOption({ label: "Sunshine Pension LP (Test)" });
  await page.getByTestId("commitment-role").selectOption("lp");
  await page.getByTestId("commitment-date").fill("2025-01-15");
  await page.getByTestId("commitment-amount").fill("50000000");
  await page.getByTestId("create-commitment").click();

  await page.getByTestId("commitment-participant").selectOption({ label: "GreenRock GP LLC (Test)" });
  await page.getByTestId("commitment-role").selectOption("gp");
  await page.getByTestId("commitment-date").fill("2025-01-15");
  await page.getByTestId("commitment-amount").fill("1000000");
  await page.getByTestId("create-commitment").click();
  await expect(page.getByTestId("commitment-row").first()).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("commitment-row").first()).toContainText("Sunshine Pension LP (Test)");
  await expect(page.getByTestId("commitment-row").nth(1)).toContainText("GreenRock GP LLC (Test)");

  await page.getByTestId("capital-call-date").fill("2025-02-01");
  await page.getByTestId("capital-call-amount").fill("10000000");
  await page.getByTestId("create-capital-call").click();
  await expect(page.getByTestId("capital-call-row").first()).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("capital-call-row").first()).toContainText("2025-02-01");

  await page.getByTestId("asset-name").fill("Palm Ridge Apartments (Test)");
  await page.getByTestId("asset-date").fill("2025-02-15");
  await page.getByTestId("asset-cost").fill("8000000");
  await page.getByTestId("create-asset").click();
  await expect(page.getByTestId("asset-row").first()).toContainText("Palm Ridge Apartments (Test)");

  await page.reload();
  await expect(page.getByTestId("asset-row").first()).toContainText("Palm Ridge Apartments (Test)");

  await page.getByTestId("distribution-date").fill("2026-01-20");
  await page.getByTestId("distribution-amount").fill("12000000");
  await page.getByTestId("distribution-asset").selectOption({ label: "Palm Ridge Apartments (Test)" });
  await page.getByTestId("create-distribution").click();
  await expect(page.getByTestId("distribution-row").first()).toBeVisible();

  const runButton = page.getByTestId(/^run-waterfall-/).first();
  await runButton.click();
  await expect(page.getByTestId("ledger-row").first()).toBeVisible();

  const totalsText = await page.getByTestId("ledger-total").innerText();
  const matches = totalsText.match(/Ledger total:\s*([0-9.,-]+)\s*· Distribution:\s*([0-9.,-]+)/);
  expect(matches).toBeTruthy();
  const ledgerTotal = Number((matches?.[1] || "0").replace(/,/g, ""));
  const distributionTotal = Number((matches?.[2] || "0").replace(/,/g, ""));
  expect(Math.abs(ledgerTotal - distributionTotal)).toBeLessThanOrEqual(0.01);

  await page.getByTestId("run-determinism-check").click();
  await expect(page.getByTestId("run-id")).not.toHaveText("");
  await expect(page.getByTestId("repeat-run-id")).not.toHaveText("");
  const runId = await page.getByTestId("run-id").innerText();
  const repeatRunId = await page.getByTestId("repeat-run-id").innerText();
  expect(runId).toBeTruthy();
  expect(repeatRunId).toBeTruthy();
  expect(runId).toBe(repeatRunId);

  await page.reload();
  await expect(page.getByTestId("ledger-row").first()).toBeVisible();
  await expect(page.getByTestId("ledger-total")).toContainText("Distribution:");

  expect(pageErrors).toEqual([]);
  expect(criticalResponses).toEqual([]);
  const criticalConsole = consoleErrors.filter(
    (msg) =>
      /uncaught|hydration|auth loop|failed to load resource: the server responded with a status of 50/i.test(msg)
  );
  expect(criticalConsole).toEqual([]);
});
