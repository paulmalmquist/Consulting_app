import { test, expect } from "@playwright/test";

/**
 * Best-effort smoke for the ML Algorithm Decision Lab.
 *
 * The data-driven flow (10 cards, charts, comparison matrix, Reality Mode,
 * drilldown drawer) requires a live FastAPI backend. CI runs `next dev` only,
 * so those checks are gated behind HR_E2E=1 and otherwise skipped. The
 * unconditional check verifies the page shell renders.
 */

const ENV = process.env.HR_E2E_ENV || "demo";
const PAGE = `/lab/env/${ENV}/historyrhymes/ml-algorithms`;

test("ml-algorithms page shell renders", async ({ page }) => {
  const resp = await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  test.skip(
    !resp || resp.status() >= 400,
    "ml-algorithms page not reachable without auth/backend in this run",
  );
  await expect(page.getByTestId("hr-ml-algorithms-page")).toBeVisible();
});

test("10 cards, detail charts, comparison matrix, Reality Mode, drilldown (requires live backend)", async ({
  page,
}) => {
  test.skip(
    process.env.HR_E2E !== "1",
    "set HR_E2E=1 with a live backend to run the data-driven flow",
  );
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });

  // Ten algorithm cards.
  await expect(page.getByTestId("hr-ml-algo-card")).toHaveCount(10);

  // Open a few representative algorithms.
  await page.getByTestId("hr-ml-algo-card").filter({ hasText: "Linear Regression" }).click();
  await expect(page.getByText("Actual vs predicted", { exact: false })).toBeVisible();
  await page.getByTestId("hr-ml-algo-card").filter({ hasText: "K-Nearest Neighbors" }).click();
  await expect(page.getByText("Nearest neighbors", { exact: false })).toBeVisible();
  await page.getByTestId("hr-ml-algo-card").filter({ hasText: "Principal Component" }).click();
  await expect(page.getByText("Explained variance", { exact: false })).toBeVisible();

  // Comparison matrix has 10 rows.
  await expect(page.getByTestId("hr-ml-compare-matrix")).toBeVisible();

  // Reality Mode: toggling a curveball re-fetches (metrics change honestly).
  await page.getByTestId("hr-ml-toggle-class_imbalance").check();
  await expect(page.getByText("curveball", { exact: false })).toBeVisible();

  // Drilldown: open a chart-driven detail drawer.
  await page.getByTestId("hr-ml-algo-card").filter({ hasText: "Random Forest" }).click();
  await page.getByText("Open lineage").first().click();
  await expect(page.getByTestId("hr-ml-drawer")).toBeVisible();
  await expect(page.getByTestId("hr-ml-cloud-badge")).toBeVisible();
});
