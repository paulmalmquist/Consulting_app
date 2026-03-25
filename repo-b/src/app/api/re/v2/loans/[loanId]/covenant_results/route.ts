import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/loans/[loanId]/covenant_results
 *
 * Returns covenant test results for a specific loan.
 */
export async function GET(
  request: Request,
  { params }: { params: { loanId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([]);

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter");

  try {
    const conditions = ["loan_id = $1::uuid"];
    const values: string[] = [params.loanId];

    if (quarter) {
      conditions.push("quarter = $2");
      values.push(quarter);
    }

    const res = await pool.query(
      `SELECT
         id::text, run_id::text, fund_id::text, loan_id::text,
         quarter,
         dscr::float8, ltv::float8, debt_yield::float8,
         pass, headroom::float8, breached,
         created_at::text
       FROM re_loan_covenant_result_qtr
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC`,
      values
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/loans/[id]/covenant_results] DB error", err);
    return Response.json([]);
  }
}
