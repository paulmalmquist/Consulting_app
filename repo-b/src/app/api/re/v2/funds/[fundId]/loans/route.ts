import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/loans
 *
 * Returns all loans associated with a fund.
 */
export async function GET(
  _request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([]);

  try {
    const res = await pool.query(
      `SELECT
         id::text, fund_id::text, investment_id::text, asset_id::text,
         loan_name, upb::float8, rate_type, rate::float8,
         spread::float8, maturity::text, amort_type,
         created_at::text
       FROM re_loan
       WHERE fund_id = $1::uuid
       ORDER BY loan_name`,
      [params.fundId]
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/funds/[id]/loans] DB error", err);
    return Response.json([]);
  }
}
