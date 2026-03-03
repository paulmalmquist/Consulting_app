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
 */
export async function GET(
  request: Request,
  { params }: { params: { investmentId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "DB_UNAVAILABLE" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenario_id");

  try {
    // Try direct investment quarter state first
    const conditions = [
      "investment_id = $1::uuid",
      "quarter = $2",
    ];
    const values: (string | null)[] = [params.investmentId, params.quarter];
    let idx = 3;

    if (scenarioId) {
      conditions.push(`scenario_id = $${idx}::uuid`);
      values.push(scenarioId);
      idx++;
    } else {
      conditions.push("scenario_id IS NULL");
    }

    const direct = await pool.query(
      `SELECT
         id::text, investment_id::text, quarter, scenario_id::text, run_id::text,
         nav::float8, committed_capital::float8, invested_capital::float8,
         realized_distributions::float8, unrealized_value::float8,
         gross_irr::float8, net_irr::float8, equity_multiple::float8,
         created_at::text
       FROM re_investment_quarter_state
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC LIMIT 1`,
      values
    );

    if (direct.rows[0]) {
      // Enrich with asset-level aggregates (gross_asset_value, debt, NOI)
      const enrichAgg = await pool.query(
        `SELECT
           SUM(qs.asset_value)::float8 AS gross_asset_value,
           SUM(qs.debt_balance)::float8 AS debt_balance,
           SUM(qs.noi)::float8 AS noi,
           SUM(qs.debt_service)::float8 AS debt_service,
           SUM(qs.cash_balance)::float8 AS cash_balance,
           SUM(qs.nav)::float8 AS fund_nav_contribution
         FROM repe_asset a
         JOIN re_asset_quarter_state qs
           ON qs.asset_id = a.asset_id AND qs.quarter = $2 AND qs.scenario_id IS NULL
         WHERE a.deal_id = $1::uuid`,
        [params.investmentId, params.quarter]
      );
      const enrich = enrichAgg.rows[0] || {};
      return Response.json({ ...direct.rows[0], ...enrich });
    }

    // Fallback: aggregate from asset quarter states
    const agg = await pool.query(
      `SELECT
         $1::text AS investment_id,
         $2 AS quarter,
         SUM(qs.noi)::float8 AS noi,
         SUM(qs.asset_value)::float8 AS gross_asset_value,
         SUM(qs.debt_balance)::float8 AS debt_balance,
         SUM(qs.cash_balance)::float8 AS cash_balance,
         SUM(qs.nav)::float8 AS nav,
         SUM(qs.nav)::float8 AS fund_nav_contribution
       FROM repe_asset a
       JOIN re_asset_quarter_state qs
         ON qs.asset_id = a.asset_id AND qs.quarter = $2 AND qs.scenario_id IS NULL
       WHERE a.deal_id = $1::uuid`,
      [params.investmentId, params.quarter]
    );

    if (agg.rows[0] && agg.rows[0].nav != null) {
      return Response.json(agg.rows[0]);
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
