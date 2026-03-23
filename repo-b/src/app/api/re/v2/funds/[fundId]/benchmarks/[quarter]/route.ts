import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/benchmarks/[quarter]
 *
 * Returns fund performance metrics alongside benchmark comparisons (NCREIF ODCE, etc.)
 * for a specific quarter.
 */
export async function GET(
  _request: Request,
  { params }: { params: { fundId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ quarter: params.quarter, fund_irr: null, fund_moic: null, benchmarks: [] });

  try {
    // Fund metrics for this quarter
    const metricsRes = await pool.query(
      `SELECT gross_irr::float8, net_irr::float8, gross_tvpi::float8, net_tvpi::float8,
              dpi::float8, rvpi::float8, cash_on_cash::float8
       FROM re_fund_metrics_qtr
       WHERE fund_id = $1::uuid AND quarter = $2
       ORDER BY created_at DESC LIMIT 1`,
      [params.fundId, params.quarter]
    );

    const fm = metricsRes.rows[0];

    // All benchmarks for this quarter
    const bmRes = await pool.query(
      `SELECT benchmark_name AS name, quarter,
              total_return::float8 AS irr,
              total_return::float8,
              income_return::float8,
              appreciation::float8
       FROM re_benchmark
       WHERE quarter = $1
       ORDER BY benchmark_name`,
      [params.quarter]
    );

    // Compute alpha for each benchmark
    const fundIrr = fm?.net_irr ?? null;
    const benchmarks = bmRes.rows.map((bm: Record<string, unknown>) => ({
      name: bm.name,
      irr: bm.irr,
      total_return: bm.total_return,
      income_return: bm.income_return,
      appreciation: bm.appreciation,
      alpha: fundIrr != null && bm.irr != null ? fundIrr - (bm.irr as number) : null,
    }));

    return Response.json({
      quarter: params.quarter,
      fund_irr: fundIrr,
      fund_moic: fm?.gross_tvpi ?? null,
      benchmarks,
    });
  } catch (err) {
    console.error("[re/v2/funds/[id]/benchmarks/[quarter]] DB error", err);
    return Response.json({ quarter: params.quarter, fund_irr: null, fund_moic: null, benchmarks: [] });
  }
}
