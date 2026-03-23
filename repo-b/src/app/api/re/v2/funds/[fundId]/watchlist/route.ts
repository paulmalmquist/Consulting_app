import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/watchlist
 *
 * Returns watchlist events for a fund's loans.
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([]);

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter");

  try {
    const conditions = ["fund_id = $1::uuid"];
    const values: string[] = [params.fundId];

    if (quarter) {
      conditions.push("quarter = $2");
      values.push(quarter);
    }

    const res = await pool.query(
      `SELECT
         id::text, fund_id::text, loan_id::text, quarter,
         severity, reason, created_at::text
       FROM re_loan_watchlist_event
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC`,
      values
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/funds/[id]/watchlist] DB error", err);
    return Response.json([]);
  }
}
