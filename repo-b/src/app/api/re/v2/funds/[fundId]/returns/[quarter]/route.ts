import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/returns/[quarter]
 *
 * Returns fund performance metrics and gross-net bridge for a specific quarter.
 * Reads from re_fund_metrics_qtr and re_gross_net_bridge_qtr (written by Quarter Close).
 */
export async function GET(
  _request: Request,
  { params }: { params: { fundId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ metrics: null, bridge: null, benchmark: null });

  try {
    const metricsRes = await pool.query(
      `SELECT
         id::text, run_id::text, fund_id::text, quarter,
         gross_irr::float8, net_irr::float8,
         gross_tvpi::float8, net_tvpi::float8,
         dpi::float8, rvpi::float8,
         cash_on_cash::float8, gross_net_spread::float8
       FROM re_fund_metrics_qtr
       WHERE fund_id = $1::uuid AND quarter = $2
       ORDER BY created_at DESC LIMIT 1`,
      [params.fundId, params.quarter]
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
      [params.fundId, params.quarter]
    );

    // Include benchmark comparison
    let benchmark = null;
    try {
      const bmRes = await pool.query(
        `SELECT benchmark_name, quarter, total_return::float8, income_return::float8, appreciation::float8
         FROM re_benchmark
         WHERE benchmark_name = 'NCREIF_ODCE' AND quarter = $1`,
        [params.quarter]
      );
      if (bmRes.rows[0]) {
        const bm = bmRes.rows[0];
        const fundNetReturn = metricsRes.rows[0]?.net_irr ?? null;
        benchmark = {
          ...bm,
          fund_net_return: fundNetReturn,
          alpha: fundNetReturn != null && bm.total_return != null
            ? fundNetReturn - bm.total_return
            : null,
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
    console.error("[re/v2/funds/[id]/returns/[quarter]] DB error", err);
    return Response.json({ metrics: null, bridge: null, benchmark: null });
  }
}
