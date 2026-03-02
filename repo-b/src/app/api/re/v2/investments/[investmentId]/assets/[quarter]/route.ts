import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/investments/[investmentId]/assets/[quarter]
 *
 * Returns all assets under an investment with their quarter state metrics.
 * Includes both direct assets and JV-backed assets.
 */
export async function GET(
  request: Request,
  { params }: { params: { investmentId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenario_id");

  try {
    const scenarioClause = scenarioId
      ? "AND qs.scenario_id = $3::uuid"
      : "AND qs.scenario_id IS NULL";
    const values: string[] = [params.investmentId, params.quarter];
    if (scenarioId) values.push(scenarioId);

    const res = await pool.query(
      `SELECT
         a.asset_id::text,
         a.deal_id::text,
         a.jv_id::text,
         a.asset_type,
         a.name,
         pa.property_type,
         pa.units,
         pa.market,
         qs.id::text AS quarter_state_id,
         qs.run_id::text,
         qs.noi::float8,
         (COALESCE(qs.noi, 0) - COALESCE(qs.debt_service, 0))::float8 AS net_cash_flow,
         qs.debt_balance::float8,
         qs.asset_value::float8,
         qs.nav::float8,
         a.created_at::text
       FROM repe_asset a
       LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
       LEFT JOIN re_asset_quarter_state qs
         ON qs.asset_id = a.asset_id AND qs.quarter = $2 ${scenarioClause}
       WHERE a.deal_id = $1::uuid
       ORDER BY a.name`,
      values
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/investments/[id]/assets] DB error", err);
    return Response.json([], { status: 200 });
  }
}
