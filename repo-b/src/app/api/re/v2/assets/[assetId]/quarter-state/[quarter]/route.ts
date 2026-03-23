import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/assets/[assetId]/quarter-state/[quarter]
 *
 * Returns the asset quarter state for a given asset and quarter.
 * Optional query param: scenario_id (UUID)
 */
export async function GET(
  request: Request,
  { params }: { params: { assetId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "DB_UNAVAILABLE", message: "Database not available" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenario_id");

  try {
    const scenarioClause = scenarioId
      ? `AND qs.scenario_id = $3::uuid`
      : `AND qs.scenario_id IS NULL`;
    const values: string[] = scenarioId
      ? [params.assetId, params.quarter, scenarioId]
      : [params.assetId, params.quarter];

    const res = await pool.query(
      `SELECT
         qs.id::text,
         qs.asset_id::text,
         qs.quarter,
         qs.scenario_id::text,
         qs.run_id::text,
         qs.accounting_basis,
         qs.noi::float8,
         qs.revenue::float8,
         qs.opex::float8,
         qs.capex::float8,
         qs.debt_service::float8,
         qs.occupancy::float8,
         qs.debt_balance::float8,
         qs.cash_balance::float8,
         qs.asset_value::float8,
         qs.nav::float8,
         qs.valuation_method,
         qs.inputs_hash,
         qs.created_at::text,
         CASE
           WHEN qs.asset_value > 0 AND qs.noi IS NOT NULL
           THEN ((qs.noi * 4) / qs.asset_value)::float8
           ELSE NULL
         END AS cap_rate,
         CASE
           WHEN qs.asset_value > 0 AND qs.debt_balance IS NOT NULL
           THEN (qs.debt_balance / qs.asset_value)::float8
           ELSE NULL
         END AS ltv,
         CASE
           WHEN qs.debt_service > 0 AND qs.noi IS NOT NULL
           THEN ((qs.noi * 4) / qs.debt_service)::float8
           ELSE NULL
         END AS dscr
       FROM re_asset_quarter_state qs
       WHERE qs.asset_id = $1::uuid
         AND qs.quarter = $2
         ${scenarioClause}
       ORDER BY qs.created_at DESC
       LIMIT 1`,
      values
    );

    if (res.rows.length === 0) {
      return Response.json(
        { error_code: "NOT_FOUND", message: `No quarter state for asset ${params.assetId} in ${params.quarter}` },
        { status: 404 }
      );
    }

    return Response.json(res.rows[0]);
  } catch (err) {
    console.error("[re/v2/assets/[assetId]/quarter-state] DB error", err);
    return Response.json(
      { error_code: "DB_ERROR", message: String(err) },
      { status: 500 }
    );
  }
}
