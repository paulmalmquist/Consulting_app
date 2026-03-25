import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/debt-covenants
 *
 * Returns per-loan covenant test results for all loans in a fund,
 * including loan metadata, breach/watch status, and a summary.
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ covenants: [], summary: null });

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter") || "2026Q1";

  try {
    // Join covenant results with loan details and asset/investment context
    const res = await pool.query(
      `SELECT
         cr.id::text,
         cr.loan_id::text,
         cr.quarter,
         cr.dscr::float8,
         cr.ltv::float8,
         cr.debt_yield::float8,
         cr.pass,
         cr.headroom::float8,
         cr.breached,
         cr.created_at::text,
         ld.loan_name AS investment_name,
         ld.lender,
         ld.current_balance::float8 AS loan_balance,
         ld.ltv_covenant::float8,
         ld.dscr_covenant::float8,
         ld.maturity_date::text,
         CASE
           WHEN cr.breached THEN 'breach'
           WHEN cr.headroom IS NOT NULL AND cr.headroom < 0.10 THEN 'watch'
           ELSE 'compliant'
         END AS status
       FROM re_loan_covenant_result_qtr cr
       LEFT JOIN re_loan_detail ld ON ld.loan_id = cr.loan_id
       WHERE cr.fund_id = $1::uuid AND cr.quarter = $2
       ORDER BY cr.breached DESC, cr.headroom ASC`,
      [params.fundId, quarter]
    );

    const covenants = res.rows;
    const total = covenants.length;
    const breached = covenants.filter((r: Record<string, unknown>) => r.breached).length;
    const watch = covenants.filter((r: Record<string, unknown>) => r.status === "watch").length;
    const avgHeadroom = total > 0
      ? covenants.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.headroom) || 0), 0) / total
      : null;

    return Response.json({
      covenants,
      summary: {
        total,
        breached,
        watch,
        compliant: total - breached - watch,
        avg_headroom: avgHeadroom,
      },
    });
  } catch (err) {
    console.error("[re/v2/funds/[id]/debt-covenants] DB error", err);
    return Response.json({ covenants: [], summary: null });
  }
}
