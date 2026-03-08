import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/investments/[investmentId]/quarter-state/[quarter]
 *
 * Returns the investment-level quarter state (NAV, IRR, MOIC, etc.).
 * Falls back to computing from asset quarter states if no direct row exists.
 * When version_id is supplied, prefers exact version rows and gracefully
 * falls back to null-version rows if version-specific quarter states do not exist.
 */
export async function GET(
  request: Request,
  { params }: { params: { investmentId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "DB_UNAVAILABLE" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenario_id");
  const versionId = searchParams.get("version_id");

  try {
    const direct = await pool.query(
      `WITH ranked_state AS (
         SELECT
           s.id::text,
           s.investment_id::text,
           s.quarter,
           s.scenario_id::text,
           s.version_id::text,
           s.run_id::text,
           s.nav::float8,
           s.committed_capital::float8,
           s.invested_capital::float8,
           s.realized_distributions::float8,
           s.unrealized_value::float8,
           s.gross_irr::float8,
           s.net_irr::float8,
           s.equity_multiple::float8,
           s.inputs_hash,
           s.created_at::text,
           ROW_NUMBER() OVER (
             PARTITION BY s.investment_id, s.quarter
             ORDER BY
               CASE
                 WHEN $4::uuid IS NOT NULL AND s.version_id = $4::uuid THEN 0
                 WHEN s.version_id IS NULL THEN 1
                 ELSE 2
               END,
               s.created_at DESC
           ) AS version_rank
         FROM re_investment_quarter_state s
         WHERE s.investment_id = $1::uuid
           AND s.quarter = $2
           AND (
             ($3::uuid IS NULL AND s.scenario_id IS NULL)
             OR s.scenario_id = $3::uuid
           )
           AND (
             $4::uuid IS NULL
             OR s.version_id = $4::uuid
             OR s.version_id IS NULL
           )
       )
       SELECT *
       FROM ranked_state
       WHERE version_rank = 1
       ORDER BY created_at DESC
       LIMIT 1`,
      [params.investmentId, params.quarter, scenarioId, versionId]
    );

    const enrichAgg = await pool.query(
      `WITH asset_states AS (
         SELECT
           qs.*,
           ROW_NUMBER() OVER (
             PARTITION BY qs.asset_id, qs.quarter
             ORDER BY
               CASE
                 WHEN $4::uuid IS NOT NULL AND qs.version_id = $4::uuid THEN 0
                 WHEN qs.version_id IS NULL THEN 1
                 ELSE 2
               END,
               qs.created_at DESC
           ) AS version_rank
         FROM repe_asset a
         JOIN re_asset_quarter_state qs
           ON qs.asset_id = a.asset_id
         WHERE a.deal_id = $1::uuid
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
       )
       SELECT
         SUM(asset_value)::float8 AS gross_asset_value,
         SUM(debt_balance)::float8 AS debt_balance,
         SUM(noi)::float8 AS noi,
         SUM(revenue)::float8 AS revenue,
         SUM(opex)::float8 AS opex,
         AVG(occupancy)::float8 AS occupancy,
         SUM(debt_service)::float8 AS debt_service,
         SUM(cash_balance)::float8 AS cash_balance,
         SUM(nav)::float8 AS fund_nav_contribution
       FROM asset_states
       WHERE version_rank = 1`,
      [params.investmentId, params.quarter, scenarioId, versionId]
    );

    const enrich = enrichAgg.rows[0] || {};

    if (direct.rows[0]) {
      return Response.json({ ...direct.rows[0], ...enrich });
    }

    if (enrich.fund_nav_contribution != null) {
      return Response.json({
        investment_id: params.investmentId,
        quarter: params.quarter,
        scenario_id: scenarioId,
        version_id: versionId,
        nav: enrich.fund_nav_contribution,
        gross_asset_value: enrich.gross_asset_value,
        debt_balance: enrich.debt_balance,
        noi: enrich.noi,
        revenue: enrich.revenue,
        opex: enrich.opex,
        occupancy: enrich.occupancy,
        debt_service: enrich.debt_service,
        cash_balance: enrich.cash_balance,
        fund_nav_contribution: enrich.fund_nav_contribution,
      });
    }

    return Response.json(
      { error_code: "NOT_FOUND", message: "No quarter state found" },
      { status: 404 }
    );
  } catch (err) {
    console.error("[re/v2/investments/[id]/quarter-state] DB error", err);
    return Response.json({ error: "DB_ERROR" }, { status: 500 });
  }
}
