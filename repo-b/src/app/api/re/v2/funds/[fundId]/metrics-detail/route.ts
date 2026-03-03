import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/metrics-detail
 *
 * Returns FI fund metrics (gross/net IRR, TVPI, DPI, RVPI, cash-on-cash)
 * plus gross-net bridge for a quarter.
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ metrics: null, bridge: null });

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter") || "2026Q1";

  try {
    const metricsRes = await pool.query(
      `SELECT
         id::text, run_id::text, fund_id::text, quarter,
         gross_irr::float8, net_irr::float8,
         gross_tvpi::float8, net_tvpi::float8,
         dpi::float8, rvpi::float8,
         cash_on_cash::float8, gross_net_spread::float8,
         inputs_missing
       FROM re_fund_metrics_qtr
       WHERE fund_id = $1::uuid AND quarter = $2
       ORDER BY created_at DESC LIMIT 1`,
      [params.fundId, quarter]
    );

    const bridgeRes = await pool.query(
      `SELECT
         id::text, run_id::text, fund_id::text, quarter,
         gross_return::float8, mgmt_fees::float8,
         fund_expenses::float8, carry_shadow::float8,
         net_return::float8
       FROM re_gross_net_bridge_qtr
       WHERE fund_id = $1::uuid AND quarter = $2
       ORDER BY created_at DESC LIMIT 1`,
      [params.fundId, quarter]
    );

    // Benchmark comparison (NCREIF ODCE for this quarter)
    let benchmark = null;
    try {
      const bmRes = await pool.query(
        `SELECT benchmark_name, quarter, total_return::float8, income_return::float8, appreciation::float8
         FROM re_benchmark
         WHERE benchmark_name = 'NCREIF_ODCE' AND quarter = $1`,
        [quarter]
      );
      if (bmRes.rows[0]) {
        const bm = bmRes.rows[0];
        const m = metricsRes.rows[0];
        const fundNetReturn = m?.net_irr ?? null;
        const alpha = fundNetReturn != null && bm.total_return != null
          ? fundNetReturn - bm.total_return
          : null;
        benchmark = {
          ...bm,
          fund_net_return: fundNetReturn,
          alpha,
        };
      }
    } catch {
      // Benchmark table may not exist yet
    }

    return Response.json({
      metrics: metricsRes.rows[0] || null,
      bridge: bridgeRes.rows[0] || null,
      benchmark,
    });
  } catch (err) {
    console.error("[re/v2/funds/[id]/metrics-detail] DB error", err);
    return Response.json({ metrics: null, bridge: null, benchmark: null });
  }
}
