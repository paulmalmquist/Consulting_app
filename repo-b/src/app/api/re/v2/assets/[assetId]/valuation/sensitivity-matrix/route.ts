import { getPool } from "@/lib/server/db";
import {
  computeSensitivityMatrix,
  type SensitivityVariable,
  type ValuationInputs,
} from "@/lib/re-valuation-math";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

/**
 * POST /api/re/v2/assets/[assetId]/valuation/sensitivity-matrix
 *
 * Computes a 2D sensitivity matrix for an asset by varying two inputs.
 * Returns a grid of valuation results (value, equity, LTV, IRR estimate).
 *
 * Body: {
 *   quarter: string,
 *   row_variable: "cap_rate" | "exit_cap_rate" | "rent_growth" | "discount_rate" | "vacancy",
 *   col_variable: same,
 *   row_min: number, row_max: number, row_step: number,
 *   col_min: number, col_max: number, col_step: number,
 *   hold_years?: number,
 *   acquisition_cost?: number,
 * }
 */
export async function POST(
  request: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "DB not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const quarter = body.quarter || "2026Q1";
  const rowVariable = (body.row_variable || "exit_cap_rate") as SensitivityVariable;
  const colVariable = (body.col_variable || "rent_growth") as SensitivityVariable;
  const rowMin = body.row_min ?? 0.05;
  const rowMax = body.row_max ?? 0.075;
  const rowStep = body.row_step ?? 0.005;
  const colMin = body.col_min ?? -0.02;
  const colMax = body.col_max ?? 0.04;
  const colStep = body.col_step ?? 0.01;
  const holdYears = body.hold_years ?? 5;

  try {
    // Get current asset state
    const stateRes = await pool.query(
      `SELECT noi::float8, asset_value::float8, nav::float8,
              debt_balance::float8, debt_service::float8
       FROM re_asset_quarter_state
       WHERE asset_id = $1::uuid AND quarter = $2 AND scenario_id IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [params.assetId, quarter]
    );
    if (!stateRes.rows[0]) {
      return Response.json({ error: "No asset state found for this quarter" }, { status: 404 });
    }
    const s = stateRes.rows[0];
    const currentNoi = s.noi || 0;
    const assetValue = s.asset_value || 0;
    const debtBalance = s.debt_balance || 0;
    const debtService = s.debt_service || 0;

    // Get cost basis for IRR calc
    const costRes = await pool.query(
      `SELECT cost_basis::float8 FROM repe_property_asset WHERE asset_id = $1::uuid`,
      [params.assetId]
    );
    const acquisitionCost = body.acquisition_cost || costRes.rows[0]?.cost_basis || assetValue * 0.85;

    // Compute implied cap rate for base inputs
    const annualizedNoi = currentNoi * 4;
    const impliedCapRate = assetValue > 0 ? annualizedNoi / assetValue : 0.065;

    const baseInputs: ValuationInputs = {
      cap_rate: impliedCapRate,
      exit_cap_rate: impliedCapRate + 0.005,
      discount_rate: 0.09,
      rent_growth: 0.025,
      vacancy: 0.05,
    };

    // Generate value ranges
    const rowValues: number[] = [];
    for (let v = rowMin; v <= rowMax + rowStep * 0.001; v += rowStep) {
      rowValues.push(Math.round(v * 100000) / 100000);
    }
    const colValues: number[] = [];
    for (let v = colMin; v <= colMax + colStep * 0.001; v += colStep) {
      colValues.push(Math.round(v * 100000) / 100000);
    }

    const matrix = computeSensitivityMatrix(
      baseInputs, currentNoi, debtBalance, debtService,
      rowVariable, colVariable,
      rowValues, colValues,
      acquisitionCost, holdYears,
    );

    return Response.json({
      asset_id: params.assetId,
      quarter,
      base_inputs: baseInputs,
      acquisition_cost: acquisitionCost,
      hold_years: holdYears,
      matrix,
    });
  } catch (err) {
    console.error("[re/v2/assets/[id]/valuation/sensitivity-matrix] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
