import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/valuation/rollup?quarter=2026Q1&scenario_id=...
 *
 * Aggregate all asset quarter states for a fund + quarter + optional scenario.
 * Returns: total portfolio value, total equity, weighted avg cap rate, weighted avg LTV.
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "DB_UNAVAILABLE", message: "Database not available" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter");
  const scenarioId = searchParams.get("scenario_id");

  if (!quarter) {
    return Response.json({ error_code: "MISSING_PARAM", message: "quarter is required" }, { status: 400 });
  }

  try {
    const scenarioClause = scenarioId
      ? "AND qs.scenario_id = $3::uuid"
      : "AND qs.scenario_id IS NULL";
    const values = scenarioId
      ? [params.fundId, quarter, scenarioId]
      : [params.fundId, quarter];

    // Aggregate latest quarter state per asset
    const res = await pool.query(
      `WITH latest_qs AS (
         SELECT DISTINCT ON (qs.asset_id)
           qs.asset_id,
           qs.noi::float8,
           qs.asset_value::float8,
           qs.nav::float8,
           qs.debt_balance::float8,
           qs.debt_service::float8,
           qs.occupancy::float8,
           qs.valuation_method,
           a.name AS asset_name,
           pa.property_type
         FROM re_asset_quarter_state qs
         JOIN repe_asset a ON a.asset_id = qs.asset_id
         JOIN repe_deal d ON d.deal_id = a.deal_id
         LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
         WHERE d.fund_id = $1::uuid
           AND qs.quarter = $2
           ${scenarioClause}
         ORDER BY qs.asset_id, qs.created_at DESC
       )
       SELECT
         COUNT(*)::int AS asset_count,
         COALESCE(SUM(asset_value), 0)::float8 AS total_portfolio_value,
         COALESCE(SUM(nav), 0)::float8 AS total_equity,
         COALESCE(SUM(debt_balance), 0)::float8 AS total_debt,
         COALESCE(SUM(noi), 0)::float8 AS total_noi,
         CASE
           WHEN SUM(asset_value) > 0 THEN (SUM(noi) * 4 / SUM(asset_value))::float8
           ELSE NULL
         END AS weighted_avg_cap_rate,
         CASE
           WHEN SUM(asset_value) > 0 THEN (SUM(debt_balance) / SUM(asset_value))::float8
           ELSE NULL
         END AS weighted_avg_ltv,
         CASE
           WHEN SUM(asset_value) > 0
           THEN (SUM(occupancy * asset_value) / NULLIF(SUM(asset_value), 0))::float8
           ELSE NULL
         END AS weighted_avg_occupancy
       FROM latest_qs`,
      values
    );

    // Also get per-asset breakdown
    const breakdownRes = await pool.query(
      `WITH latest_qs AS (
         SELECT DISTINCT ON (qs.asset_id)
           qs.asset_id::text,
           a.name AS asset_name,
           pa.property_type,
           qs.noi::float8,
           qs.asset_value::float8,
           qs.nav::float8,
           qs.debt_balance::float8,
           qs.occupancy::float8,
           qs.valuation_method
         FROM re_asset_quarter_state qs
         JOIN repe_asset a ON a.asset_id = qs.asset_id
         JOIN repe_deal d ON d.deal_id = a.deal_id
         LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
         WHERE d.fund_id = $1::uuid
           AND qs.quarter = $2
           ${scenarioClause}
         ORDER BY qs.asset_id, qs.created_at DESC
       )
       SELECT * FROM latest_qs ORDER BY asset_value DESC NULLS LAST`,
      values
    );

    const summary = res.rows[0];

    return Response.json({
      fund_id: params.fundId,
      quarter,
      scenario_id: scenarioId ?? null,
      summary: {
        asset_count: summary.asset_count,
        total_portfolio_value: summary.total_portfolio_value,
        total_equity: summary.total_equity,
        total_debt: summary.total_debt,
        total_noi: summary.total_noi,
        weighted_avg_cap_rate: summary.weighted_avg_cap_rate,
        weighted_avg_ltv: summary.weighted_avg_ltv,
        weighted_avg_occupancy: summary.weighted_avg_occupancy,
      },
      assets: breakdownRes.rows,
    });
  } catch (err) {
    console.error("[re/v2/funds/valuation/rollup] error", err);
    return Response.json(
      { error_code: "DB_ERROR", message: String(err) },
      { status: 500 }
    );
  }
}
