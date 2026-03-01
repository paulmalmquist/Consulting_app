import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/investment-rollup/[quarter]
 *
 * Returns per-investment rollup for a fund in a given quarter.
 * Each row shows investment-level NAV, asset value, debt, and cash.
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenario_id");

  try {
    const scenarioClause = scenarioId
      ? "AND qs.scenario_id = $3::uuid"
      : "AND qs.scenario_id IS NULL";
    const values: string[] = [params.fundId, params.quarter];
    if (scenarioId) values.push(scenarioId);

    // Try direct investment quarter state first
    const directRes = await pool.query(
      `SELECT
         d.deal_id::text AS investment_id,
         d.name,
         d.deal_type,
         d.stage,
         iqs.id::text AS quarter_state_id,
         iqs.run_id::text,
         iqs.nav::float8,
         iqs.unrealized_value::float8 AS gross_asset_value,
         iqs.committed_capital::float8,
         iqs.invested_capital::float8,
         iqs.gross_irr::float8,
         iqs.net_irr::float8,
         iqs.equity_multiple::float8,
         iqs.created_at::text
       FROM repe_deal d
       LEFT JOIN re_investment_quarter_state iqs
         ON iqs.investment_id = d.deal_id AND iqs.quarter = $2
         ${scenarioId ? "AND iqs.scenario_id = $3::uuid" : "AND iqs.scenario_id IS NULL"}
       WHERE d.fund_id = $1::uuid
       ORDER BY d.name`,
      values
    );

    // If we have investment quarter states with data, return them
    if (directRes.rows.some((r: Record<string, unknown>) => r.quarter_state_id)) {
      return Response.json(directRes.rows);
    }

    // Fallback: aggregate from asset quarter states
    const aggRes = await pool.query(
      `SELECT
         d.deal_id::text AS investment_id,
         d.name,
         d.deal_type,
         d.stage,
         NULL::text AS quarter_state_id,
         NULL::text AS run_id,
         SUM(qs.nav)::float8 AS nav,
         SUM(qs.asset_value)::float8 AS gross_asset_value,
         SUM(qs.debt_balance)::float8 AS debt_balance,
         SUM(qs.cash_balance)::float8 AS cash_balance,
         NULL::float8 AS effective_ownership_percent,
         SUM(qs.nav)::float8 AS fund_nav_contribution,
         NULL::text AS inputs_hash,
         d.created_at::text
       FROM repe_deal d
       LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
       LEFT JOIN re_asset_quarter_state qs
         ON qs.asset_id = a.asset_id AND qs.quarter = $2 ${scenarioClause}
       WHERE d.fund_id = $1::uuid
       GROUP BY d.deal_id, d.name, d.deal_type, d.stage, d.created_at
       ORDER BY d.name`,
      values
    );

    return Response.json(aggRes.rows);
  } catch (err) {
    console.error("[re/v2/funds/[id]/investment-rollup] DB error", err);
    return Response.json([], { status: 200 });
  }
}
