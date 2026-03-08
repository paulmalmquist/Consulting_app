import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/investments/[investmentId]/history
 *
 * Returns quarterly operating and return history for an investment.
 * When version_id is supplied, prefers exact version rows and gracefully
 * falls back to null-version rows if version-specific quarter states do not exist.
 */
export async function GET(
  request: Request,
  { params }: { params: { investmentId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json(
      {
        investment_id: params.investmentId,
        fund_id: null,
        as_of_quarter: null,
        scenario_id: null,
        version_id: null,
        operating_history: [],
        returns_history: [],
      },
      { status: 200 }
    );
  }

  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenario_id");
  const versionId = searchParams.get("version_id");
  const quarterFrom = searchParams.get("quarter_from");
  const quarterTo = searchParams.get("quarter_to");

  try {
    const invRes = await pool.query(
      `SELECT deal_id::text AS investment_id, fund_id::text
       FROM repe_deal
       WHERE deal_id = $1::uuid`,
      [params.investmentId]
    );
    const investment = invRes.rows[0];
    if (!investment) {
      return Response.json(
        { error_code: "NOT_FOUND", message: "Investment not found" },
        { status: 404 }
      );
    }

    const operatingRes = await pool.query(
      `WITH asset_states AS (
         SELECT
           qs.asset_id,
           qs.quarter,
           qs.noi::float8 AS noi,
           qs.revenue::float8 AS revenue,
           qs.opex::float8 AS opex,
           qs.occupancy::float8 AS occupancy,
           qs.asset_value::float8 AS asset_value,
           qs.debt_balance::float8 AS debt_balance,
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
           AND (
             ($3::uuid IS NULL AND qs.scenario_id IS NULL)
             OR qs.scenario_id = $3::uuid
           )
           AND (
             $4::uuid IS NULL
             OR qs.version_id = $4::uuid
             OR qs.version_id IS NULL
           )
           AND ($5::text IS NULL OR qs.quarter >= $5::text)
           AND ($6::text IS NULL OR qs.quarter <= $6::text)
       )
       SELECT
         quarter,
         SUM(noi)::float8 AS noi,
         SUM(revenue)::float8 AS revenue,
         SUM(opex)::float8 AS opex,
         AVG(occupancy)::float8 AS occupancy,
         SUM(asset_value)::float8 AS asset_value,
         SUM(debt_balance)::float8 AS debt_balance
       FROM asset_states
       WHERE version_rank = 1
       GROUP BY quarter
       ORDER BY quarter ASC`,
      [params.investmentId, investment.fund_id, scenarioId, versionId, quarterFrom, quarterTo]
    );

    const returnsRes = await pool.query(
      `WITH asset_nav AS (
         SELECT
           qs.quarter,
           SUM(qs.nav)::float8 AS nav
         FROM repe_asset a
         JOIN (
           SELECT
             asset_id,
             quarter,
             nav,
             created_at,
             ROW_NUMBER() OVER (
               PARTITION BY asset_id, quarter
               ORDER BY
                 CASE
                   WHEN $4::uuid IS NOT NULL AND version_id = $4::uuid THEN 0
                   WHEN version_id IS NULL THEN 1
                   ELSE 2
                 END,
                 created_at DESC
             ) AS version_rank
           FROM re_asset_quarter_state
           WHERE (
             ($3::uuid IS NULL AND scenario_id IS NULL)
             OR scenario_id = $3::uuid
           )
             AND (
               $4::uuid IS NULL
               OR version_id = $4::uuid
               OR version_id IS NULL
             )
             AND ($5::text IS NULL OR quarter >= $5::text)
             AND ($6::text IS NULL OR quarter <= $6::text)
         ) qs ON qs.asset_id = a.asset_id AND qs.version_rank = 1
         WHERE a.deal_id = $1::uuid
         GROUP BY qs.quarter
       ),
       investment_state AS (
         SELECT
           s.quarter,
           s.nav::float8 AS nav,
           s.gross_irr::float8 AS gross_irr,
           s.net_irr::float8 AS net_irr,
           s.equity_multiple::float8 AS equity_multiple,
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
           AND (
             ($3::uuid IS NULL AND s.scenario_id IS NULL)
             OR s.scenario_id = $3::uuid
           )
           AND (
             $4::uuid IS NULL
             OR s.version_id = $4::uuid
             OR s.version_id IS NULL
           )
           AND ($5::text IS NULL OR s.quarter >= $5::text)
           AND ($6::text IS NULL OR s.quarter <= $6::text)
       )
       SELECT
         COALESCE(i.quarter, a.quarter) AS quarter,
         COALESCE(i.nav, a.nav)::float8 AS nav,
         i.gross_irr::float8 AS gross_irr,
         i.net_irr::float8 AS net_irr,
         i.equity_multiple::float8 AS equity_multiple,
         COALESCE(i.nav, a.nav)::float8 AS fund_nav_contribution
       FROM asset_nav a
       FULL OUTER JOIN (
         SELECT quarter, nav, gross_irr, net_irr, equity_multiple
         FROM investment_state
         WHERE version_rank = 1
       ) i
         ON i.quarter = a.quarter
       ORDER BY COALESCE(i.quarter, a.quarter) ASC`,
      [params.investmentId, investment.fund_id, scenarioId, versionId, quarterFrom, quarterTo]
    );

    const asOfQuarter =
      quarterTo ||
      returnsRes.rows.at(-1)?.quarter ||
      operatingRes.rows.at(-1)?.quarter ||
      null;

    return Response.json({
      investment_id: params.investmentId,
      fund_id: investment.fund_id,
      as_of_quarter: asOfQuarter,
      scenario_id: scenarioId,
      version_id: versionId,
      operating_history: operatingRes.rows,
      returns_history: returnsRes.rows,
    });
  } catch (err) {
    console.error("[re/v2/investments/[investmentId]/history] DB error", err);
    return Response.json(
      {
        investment_id: params.investmentId,
        fund_id: null,
        as_of_quarter: null,
        scenario_id: scenarioId,
        version_id: versionId,
        operating_history: [],
        returns_history: [],
      },
      { status: 200 }
    );
  }
}
