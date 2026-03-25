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
      `WITH quarter_activity AS (
         SELECT
           quarter,
           COALESCE(SUM(CASE WHEN entry_type = 'contribution' THEN amount_base ELSE 0 END), 0) AS quarter_called,
           COALESCE(SUM(CASE WHEN entry_type IN ('distribution', 'recallable_dist') THEN amount_base ELSE 0 END), 0) AS quarter_distributed
         FROM re_capital_ledger_entry
         WHERE fund_id = $1::uuid
         GROUP BY quarter
       ),
       cumulative AS (
         SELECT
           quarter,
           SUM(quarter_called) OVER (ORDER BY quarter) AS total_called,
           SUM(quarter_distributed) OVER (ORDER BY quarter) AS total_distributed
         FROM quarter_activity
       )
       SELECT
         quarter,
         total_called::text,
         total_distributed::text
       FROM cumulative
       ORDER BY quarter`,
      [params.fundId]
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/capital-timeline] error", err);
    return Response.json([], { status: 200 });
  }
}
