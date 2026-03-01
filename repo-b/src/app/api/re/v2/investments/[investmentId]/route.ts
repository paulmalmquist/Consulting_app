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
         d.target_close_date::text,
         iqs.committed_capital::float8 AS committed_capital,
         iqs.invested_capital::float8 AS invested_capital,
         iqs.realized_distributions::float8 AS realized_distributions,
         d.created_at::text
       FROM repe_deal d
       LEFT JOIN LATERAL (
         SELECT committed_capital, invested_capital, realized_distributions
         FROM re_investment_quarter_state
         WHERE investment_id = d.deal_id AND scenario_id IS NULL
         ORDER BY quarter DESC LIMIT 1
       ) iqs ON true
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
