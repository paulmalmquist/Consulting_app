import { getPool } from "@/lib/server/db";
import { computeFullValuation, computeInputHash, type ValuationInputs } from "@/lib/re-valuation-math";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

/**
 * POST /api/re/v2/assets/[assetId]/valuation/save
 *
 * Same compute as /compute, but also inserts the result into re_asset_quarter_state.
 * Creates a new run_id and inputs_hash for audit trail.
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
              debt_balance::float8, debt_service::float8
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
    const inputsHash = await computeInputHash(body as unknown as Record<string, unknown>);

    // Build parameterized INSERT
    const insertValues: unknown[] = [
      params.assetId,          // $1
      quarter,                 // $2
      currentNoi,              // $3
      qs?.revenue ?? 0,        // $4
      qs?.opex ?? 0,           // $5
      debtBalance,             // $6
      debtService,             // $7
      result.value_blended,    // $8
      result.valuation_method, // $9
      inputsHash,              // $10
    ];

    let scenarioParam = "NULL";
    if (body.scenario_id) {
      insertValues.push(body.scenario_id);
      scenarioParam = `$${insertValues.length}::uuid`;
    }

    const insertRes = await pool.query(
      `INSERT INTO re_asset_quarter_state (
         asset_id, quarter, scenario_id,
         noi, revenue, opex, debt_balance, debt_service,
         asset_value, nav, valuation_method, inputs_hash,
         run_id, created_at
       ) VALUES (
         $1::uuid, $2, ${scenarioParam},
         $3, $4, $5, $6, $7,
         $8, $8 - COALESCE($6, 0), $9, $10,
         gen_random_uuid(), now()
       )
       RETURNING id::text, run_id::text, created_at::text`,
      insertValues
    );

    const saved = insertRes.rows[0];

    return Response.json({
      asset_id: params.assetId,
      quarter,
      scenario_id: body.scenario_id ?? null,
      saved: {
        id: saved.id,
        run_id: saved.run_id,
        created_at: saved.created_at,
      },
      result,
    });
  } catch (err) {
    console.error("[re/v2/assets/valuation/save] error", err);
    return Response.json(
      { error_code: "SAVE_ERROR", message: String(err) },
      { status: 500 }
    );
  }
}

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}Q${q}`;
}
