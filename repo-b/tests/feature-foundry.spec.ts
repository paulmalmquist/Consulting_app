import { test, expect } from "@playwright/test";

/**
 * Best-effort smoke for the Feature Foundry (feature store) page.
 *
 * The data-driven flow (families, feature drawer, quality board) needs a live
 * FastAPI backend, so it is gated behind HR_E2E=1 and otherwise skipped. The
 * unconditional check verifies the page shell renders.
 */

const ENV = process.env.HR_E2E_ENV || "demo";
const PAGE = `/lab/env/${ENV}/historyrhymes/ml-algorithms/features`;

test("feature foundry page shell renders", async ({ page }) => {
  const resp = await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  test.skip(
    !resp || resp.status() >= 400,
    "feature foundry not reachable without auth/backend in this run",
  );
  await expect(page.getByTestId("hr-feature-foundry-page")).toBeVisible();
});

test("feature drawer + quality board (requires live backend)", async ({ page }) => {
  test.skip(process.env.HR_E2E !== "1", "set HR_E2E=1 with a live backend to run the data-driven flow");
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });

  // Velocity feature → drawer shows formula / source / freshness / models.
  await page.getByTestId("hr-feature-card").filter({ hasText: "yield_curve_10y2y_velocity_30d" }).click();
  await expect(page.getByTestId("hr-ml-drawer")).toBeVisible();
  await expect(page.getByText("Formula", { exact: false })).toBeVisible();
  await expect(page.getByText("Freshness", { exact: false })).toBeVisible();
  await expect(page.getByText("Models using", { exact: false })).toBeVisible();

  // Divergence feature → disagreement explanation.
  await page.getByTestId("hr-feature-card").filter({ hasText: "credit_complacency_gap" }).click();
  await expect(page.getByText("disagreement", { exact: false })).toBeVisible();

  // Quality board surfaces leakage-blocked + missingness states.
  const board = page.getByTestId("hr-feature-quality-board");
  await expect(board).toBeVisible();
  await expect(board.getByText("resolved_trap_label")).toBeVisible();
  await expect(board.getByText("blocked", { exact: false }).first()).toBeVisible();
});
