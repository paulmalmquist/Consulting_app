import { getPool } from "@/lib/server/db";
import { computeFullValuation, type ValuationInputs } from "@/lib/re-valuation-math";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

/**
 * POST /api/re/v2/assets/[assetId]/valuation/compute
 *
 * Pure "what-if" compute — reads current quarter state for NOI/debt,
 * runs valuation math with user-supplied lever inputs, returns result.
 * Does NOT write to DB.
 */
export async function POST(
  request: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "DB_UNAVAILABLE", message: "Database not available" }, { status: 503 });
  }

  let body: ValuationInputs & { quarter?: string; scenario_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error_code: "INVALID_JSON", message: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!body.cap_rate || body.cap_rate <= 0) {
    return Response.json({ error_code: "INVALID_INPUT", message: "cap_rate is required and must be positive" }, { status: 400 });
  }

  const quarter = body.quarter ?? getCurrentQuarter();

  try {
    // Read current quarter state for NOI and debt
    const scenarioClause = body.scenario_id
      ? "AND scenario_id = $3::uuid"
      : "AND scenario_id IS NULL";
    const qsValues = body.scenario_id
      ? [params.assetId, quarter, body.scenario_id]
      : [params.assetId, quarter];

    const qsRes = await pool.query(
      `SELECT noi::float8, revenue::float8, opex::float8,
              debt_balance::float8, debt_service::float8, asset_value::float8
       FROM re_asset_quarter_state
       WHERE asset_id = $1::uuid AND quarter = $2 ${scenarioClause}
       ORDER BY created_at DESC LIMIT 1`,
      qsValues
    );

    const qs = qsRes.rows[0];
    const currentNoi = qs?.noi ?? 0;
    const debtBalance = qs?.debt_balance ?? 0;
    const debtService = qs?.debt_service ?? 0;

    const result = computeFullValuation(body, currentNoi, debtBalance, debtService);

    return Response.json({
      asset_id: params.assetId,
      quarter,
      scenario_id: body.scenario_id ?? null,
      inputs: body,
      result,
      current_state: qs ? {
        noi: qs.noi,
        debt_balance: qs.debt_balance,
        debt_service: qs.debt_service,
        asset_value: qs.asset_value,
      } : null,
    });
  } catch (err) {
    console.error("[re/v2/assets/valuation/compute] error", err);
    return Response.json(
      { error_code: "COMPUTE_ERROR", message: String(err) },
      { status: 500 }
    );
  }
}

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}Q${q}`;
}
