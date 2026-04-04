/**
 * Fund Data Pipeline Integrity Validation
 *
 * Verifies that every fund in the seeded test environment has:
 *   1. At least one linked asset (NO_ASSETS fails the pipeline)
 *   2. At least one quarter-close snapshot (NO_SNAPSHOT fails the pipeline)
 *
 * These tests call the pipeline-status endpoint directly (no UI interaction needed).
 * Run with: npx playwright test re-fund-pipeline-integrity
 *
 * Ground truth rules enforced:
 *   - Every fund MUST resolve to: fund_id + quarter
 *   - Every fund MUST have: assets > 0
 *   - Every fund MUST have: snapshot_exists = true
 *   - "No data" is NOT acceptable — must fail loudly with failure_reason
 */

import { expect, test } from "@playwright/test";

const ENV_ID = "f0790a88-5d05-4991-8d0e-243ab4f9af27";
const FUND_ID = "a1b2c3d4-0003-0030-0001-000000000001";
const QUARTER = "2026Q1";

type PipelineStatus = {
  fund_id: string;
  env_id: string;
  quarter: string;
  fund_exists: boolean;
  investment_count: number;
  asset_count: number;
  snapshot_exists: boolean;
  time_series_points: number;
  failure_reason: "NO_FUND" | "NO_ASSETS" | "NO_SNAPSHOT" | null;
  status: "PASS" | "FAIL";
};

test.describe("Fund Pipeline Integrity", () => {
  test("pipeline-status endpoint returns valid shape", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/pipeline-status?env_id=${ENV_ID}&quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);

    const body = await res.json() as PipelineStatus;
    expect(body).toHaveProperty("fund_id");
    expect(body).toHaveProperty("env_id");
    expect(body).toHaveProperty("quarter");
    expect(body).toHaveProperty("fund_exists");
    expect(body).toHaveProperty("investment_count");
    expect(body).toHaveProperty("asset_count");
    expect(body).toHaveProperty("snapshot_exists");
    expect(body).toHaveProperty("time_series_points");
    expect(body).toHaveProperty("failure_reason");
    expect(body).toHaveProperty("status");
  });

  test("seeded fund exists in database", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/pipeline-status?env_id=${ENV_ID}&quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);

    const body = await res.json() as PipelineStatus;
    expect(body.fund_exists).toBe(true);

    if (!body.fund_exists) {
      throw new Error(
        `PIPELINE FAIL [${FUND_ID}]: NO_FUND — fund row missing in repe_fund for env ${ENV_ID}`
      );
    }
  });

  test("seeded fund has linked assets", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/pipeline-status?env_id=${ENV_ID}&quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);

    const body = await res.json() as PipelineStatus;

    if (body.asset_count === 0) {
      throw new Error(
        `PIPELINE FAIL [${FUND_ID}]: NO_ASSETS — ` +
        `fund exists but no assets linked via repe_deal. ` +
        `investment_count=${body.investment_count}, env=${ENV_ID}`
      );
    }

    expect(body.asset_count).toBeGreaterThan(0);
  });

  test("seeded fund has a quarter-close snapshot", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/pipeline-status?env_id=${ENV_ID}&quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);

    const body = await res.json() as PipelineStatus;

    if (!body.snapshot_exists) {
      throw new Error(
        `PIPELINE FAIL [${FUND_ID}]: NO_SNAPSHOT — ` +
        `assets=${body.asset_count} but re_fund_quarter_state has no row for ${QUARTER}. ` +
        `Run quarter-close to populate NAV, IRR, and capital metrics. ` +
        `time_series_points=${body.time_series_points}, env=${ENV_ID}`
      );
    }

    expect(body.snapshot_exists).toBe(true);
  });

  test("seeded fund pipeline overall status is PASS", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/pipeline-status?env_id=${ENV_ID}&quarter=${QUARTER}`
    );
    expect(res.status()).toBe(200);

    const body = await res.json() as PipelineStatus;

    if (body.status === "FAIL") {
      throw new Error(
        `PIPELINE FAIL [${FUND_ID}]: failure_reason=${body.failure_reason} — ` +
        `fund_exists=${body.fund_exists}, investment_count=${body.investment_count}, ` +
        `asset_count=${body.asset_count}, snapshot_exists=${body.snapshot_exists}, ` +
        `time_series_points=${body.time_series_points}, env=${ENV_ID}, quarter=${QUARTER}`
      );
    }

    expect(body.status).toBe("PASS");
    expect(body.failure_reason).toBeNull();
  });

  test("pipeline-status requires quarter param", async ({ request }) => {
    const res = await request.get(
      `/api/re/v2/funds/${FUND_ID}/pipeline-status?env_id=${ENV_ID}`
    );
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error_code).toBe("MISSING_PARAM");
  });
});
