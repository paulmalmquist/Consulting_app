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
 * When version_id is supplied, prefers exact version rows and gracefully
 * falls back to null-version rows if version-specific quarter states do not exist.
 */
export async function GET(
  request: Request,
  { params }: { params: { investmentId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenario_id");
  const versionId = searchParams.get("version_id");

  try {
    const res = await pool.query(
      `WITH asset_states AS (
         SELECT
           a.asset_id::text,
           a.deal_id::text,
           a.jv_id::text,
           a.asset_type,
           a.name,
           a.cost_basis::float8,
           pa.property_type,
           COALESCE(pa.units, pa.gross_sf::int, pa.square_feet::int) AS units,
           pa.market,
           pa.city,
           pa.state,
           pa.msa,
           qs.id::text AS quarter_state_id,
           qs.run_id::text,
           qs.noi::float8,
           qs.occupancy::float8,
           (COALESCE(qs.noi, 0) - COALESCE(qs.debt_service, 0))::float8 AS net_cash_flow,
           qs.debt_balance::float8,
           qs.asset_value::float8,
           qs.nav::float8,
           a.created_at::text,
           ROW_NUMBER() OVER (
             PARTITION BY a.asset_id, qs.quarter
             ORDER BY
               CASE
                 WHEN $4::uuid IS NOT NULL AND qs.version_id = $4::uuid THEN 0
                 WHEN qs.version_id IS NULL THEN 1
                 ELSE 2
               END,
               qs.created_at DESC
           ) AS version_rank
         FROM repe_asset a
         LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
         LEFT JOIN re_asset_quarter_state qs
           ON qs.asset_id = a.asset_id
           AND qs.quarter = $2
           AND (
             ($3::uuid IS NULL AND qs.scenario_id IS NULL)
             OR qs.scenario_id = $3::uuid
           )
           AND (
             $4::uuid IS NULL
             OR qs.version_id = $4::uuid
             OR qs.version_id IS NULL
           )
         WHERE a.deal_id = $1::uuid
       )
       SELECT
         asset_id,
         deal_id,
         jv_id,
         asset_type,
         name,
         cost_basis,
         property_type,
         units,
         market,
         city,
         state,
         msa,
         quarter_state_id,
         run_id,
         noi,
         occupancy,
         net_cash_flow,
         debt_balance,
         asset_value,
         nav,
         created_at
       FROM asset_states
       WHERE quarter_state_id IS NULL OR version_rank = 1
       ORDER BY name`,
      [params.investmentId, params.quarter, scenarioId, versionId]
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/investments/[id]/assets] DB error", err);
    return Response.json([], { status: 200 });
  }
}
