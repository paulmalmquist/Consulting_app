import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

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

  try {
    const res = await pool.query(
      `WITH ranked_state AS (
         SELECT
           iqs.investment_id,
           d.name AS investment_name,
           iqs.gross_irr,
           iqs.equity_multiple,
           COALESCE(iqs.fund_nav_contribution, iqs.nav) AS fund_nav_contribution,
           iqs.quarter,
           iqs.created_at,
           ROW_NUMBER() OVER (
             PARTITION BY iqs.investment_id
             ORDER BY
               CASE WHEN $2::text IS NOT NULL AND iqs.quarter = $2::text THEN 0 ELSE 1 END,
               iqs.quarter DESC,
               iqs.created_at DESC
           ) AS row_rank
         FROM re_investment_quarter_state iqs
         JOIN repe_deal d ON d.deal_id = iqs.investment_id
         WHERE d.fund_id = $1::uuid
           AND ($2::text IS NULL OR iqs.quarter = $2::text OR iqs.quarter <= $2::text)
       )
       SELECT
         investment_id::text,
         investment_name,
         gross_irr::text AS investment_irr,
         equity_multiple::text AS investment_tvpi,
         fund_nav_contribution::text,
         fund_nav_contribution::text AS irr_contribution
       FROM ranked_state
       WHERE row_rank = 1
       ORDER BY gross_irr DESC NULLS LAST, fund_nav_contribution DESC NULLS LAST, investment_name`,
      [params.fundId, quarter]
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/irr-contribution] error", err);
    return Response.json([], { status: 200 });
  }
}
