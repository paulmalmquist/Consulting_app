import { expect, test } from "@playwright/test";

test("real estate special servicing wedge flow", async ({ context, page, baseURL }) => {
  test.setTimeout(180_000);
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

  await page.goto("/onboarding");
  await page.getByPlaceholder("Acme Corp").fill(`RE Wedge ${Date.now().toString().slice(-6)}`);
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-path-template").click();
  await page.locator("[data-testid^='template-card-']").first().click();
  await page.getByTestId("onboarding-provision").click();
  await expect(page).toHaveURL(/\/app\//);

  await page.goto("/app/real-estate");
  await expect(page.getByTestId("re-page")).toBeVisible();
  await page.getByTestId("re-trust-name").fill(`Trust ${Date.now().toString().slice(-4)}`);
  await page.getByTestId("re-create-trust").click();
  const trustCard = page.locator("[data-testid^='re-trust-']").first();
  await expect(trustCard).toBeVisible();
  await trustCard.click();

  await expect(page).toHaveURL(/\/app\/real-estate\/trust\//);
  await page.getByTestId("re-loan-identifier").fill(`LN-${Date.now().toString().slice(-5)}`);
  await page.getByTestId("re-loan-balance").fill("2300000000");
  await page.getByTestId("re-loan-rate").fill("0.0675");
  await page.getByTestId("re-loan-maturity").fill("2028-12-31");
  await page.getByTestId("re-create-loan").click();
  const loanCard = page.locator("[data-testid^='re-loan-']").first();
  await expect(loanCard).toBeVisible();
  await loanCard.click();

  await expect(page).toHaveURL(/\/app\/real-estate\/loan\//);
  await expect(page.getByTestId("re-loan-header")).toBeVisible();

  await page.getByTestId("re-surveillance-period").fill("2025-01-31");
  await page.getByTestId("re-surveillance-noi").fill("190000000");
  await page.getByTestId("re-surveillance-occupancy").fill("0.84");
  await page.getByTestId("re-surveillance-dscr").fill("1.10");
  await page.getByTestId("re-add-surveillance").click();

  await page.getByTestId("re-underwrite-cap-rate").fill("0.0625");
  await page.getByTestId("re-underwrite-submit").click();
  await expect(page.locator("[data-testid^='re-underwrite-run-']").first()).toContainText("Version 1");

  await page.getByTestId("re-underwrite-cap-rate").fill("0.07");
  await page.getByTestId("re-underwrite-submit").click();
  await expect(page.locator("[data-testid^='re-underwrite-run-']").first()).toContainText("Version 2");
  await expect(page.getByTestId("re-underwrite-diff")).toBeVisible();

  await page.getByRole("button", { name: "Create Case + Action" }).click();
  await expect(page.getByText(/Actions:\s*1/).first()).toBeVisible();

  await page.getByRole("button", { name: "Create Event" }).click();
  await expect(page.getByText(/Attachments:\s*1/).first()).toBeVisible();
});

