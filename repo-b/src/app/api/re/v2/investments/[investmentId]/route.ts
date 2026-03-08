import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/investments/[investmentId]
 *
 * Returns a single investment (repe_deal) with fund context.
 */
export async function GET(
  _request: Request,
  { params }: { params: { investmentId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "DB_UNAVAILABLE" }, { status: 503 });

  try {
    const res = await pool.query(
       `SELECT
         d.deal_id::text AS investment_id,
         d.fund_id::text,
         d.name,
         d.deal_type AS investment_type,
         d.stage,
         d.sponsor,
         d.target_close_date::text AS target_close_date,
         CASE WHEN d.target_close_date IS NOT NULL
           THEN ROUND(EXTRACT(EPOCH FROM (NOW() - d.target_close_date)) / (365.25 * 86400), 1)
           ELSE NULL END AS hold_period_years,
         iqs.quarter AS as_of_quarter,
         iqs.committed_capital::float8,
         iqs.invested_capital::float8,
         iqs.realized_distributions::float8,
         iqs.nav::float8,
         iqs.unrealized_value::float8,
         iqs.gross_irr::float8,
         iqs.net_irr::float8,
         iqs.equity_multiple::float8,
         agg.total_noi::float8,
         agg.total_asset_value::float8 AS gross_asset_value,
         agg.total_debt::float8 AS debt_balance,
         CASE WHEN agg.total_asset_value > 0
           THEN (agg.total_debt / agg.total_asset_value)::float8
           ELSE NULL END AS ltv,
         CASE WHEN agg.total_asset_value > 0
           THEN ((agg.total_noi * 4) / agg.total_asset_value)::float8
           ELSE NULL END AS cap_rate,
         CASE WHEN agg.total_debt_service > 0
           THEN (agg.total_noi / agg.total_debt_service)::float8
           ELSE NULL END AS dscr,
         d.created_at::text
       FROM repe_deal d
       LEFT JOIN LATERAL (
         SELECT quarter, committed_capital, invested_capital, realized_distributions,
                nav, unrealized_value, gross_irr, net_irr, equity_multiple
         FROM re_investment_quarter_state
         WHERE investment_id = d.deal_id AND scenario_id IS NULL
         ORDER BY quarter DESC LIMIT 1
       ) iqs ON true
       LEFT JOIN LATERAL (
         SELECT
           SUM(qs.noi)::float8 AS total_noi,
           SUM(qs.asset_value)::float8 AS total_asset_value,
           SUM(COALESCE(qs.debt_balance, 0))::float8 AS total_debt,
           SUM(COALESCE(qs.debt_service, 0))::float8 AS total_debt_service
         FROM repe_asset a
         JOIN re_asset_quarter_state qs ON qs.asset_id = a.asset_id
           AND qs.scenario_id IS NULL
           AND qs.quarter = (
             SELECT MAX(q2.quarter) FROM re_asset_quarter_state q2
             WHERE q2.asset_id = a.asset_id AND q2.scenario_id IS NULL
           )
         WHERE a.deal_id = d.deal_id
       ) agg ON true
       WHERE d.deal_id = $1::uuid`,
      [params.investmentId]
    );

    if (!res.rows[0]) {
      return Response.json(
        { error_code: "NOT_FOUND", message: "Investment not found" },
        { status: 404 }
      );
    }

    return Response.json(res.rows[0]);
  } catch (err) {
    console.error("[re/v2/investments/[id]] DB error", err);
    return Response.json({ error: "DB_ERROR" }, { status: 500 });
  }
}
