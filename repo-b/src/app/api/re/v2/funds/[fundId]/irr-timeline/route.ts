import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(
  _request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "DB_UNAVAILABLE", message: "Database not available" }, { status: 503 });
  }

  try {
    const res = await pool.query(
      `WITH ranked_state AS (
         SELECT
           quarter,
           portfolio_nav,
           gross_irr,
           net_irr,
           dpi,
           tvpi,
           ROW_NUMBER() OVER (
             PARTITION BY quarter
             ORDER BY
               CASE WHEN scenario_id IS NULL THEN 0 ELSE 1 END,
               created_at DESC
           ) AS row_rank
         FROM re_fund_quarter_state
         WHERE fund_id = $1::uuid
       )
       SELECT
         quarter,
         portfolio_nav::text,
         gross_irr::text,
         net_irr::text,
         dpi::text,
         tvpi::text
       FROM ranked_state
       WHERE row_rank = 1
       ORDER BY quarter`,
      [params.fundId]
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/irr-timeline] error", err);
    return Response.json([], { status: 200 });
  }
}
