import { getPool } from "@/lib/server/db";
import { computeFundBaseScenario } from "@/lib/server/reBaseScenario";

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
    const baseScenario = await computeFundBaseScenario({
      pool,
      fundId: params.fundId,
      quarter,
      liquidationMode: "current_state",
    });

    const paidInCapital = baseScenario.summary.paid_in_capital;
    const cashOnCash =
      paidInCapital > 0
        ? baseScenario.summary.distributed_capital / paidInCapital
        : null;
    const grossNetSpread =
      baseScenario.summary.gross_irr != null && baseScenario.summary.net_irr != null
        ? baseScenario.summary.gross_irr - baseScenario.summary.net_irr
        : null;

    const metrics = {
      id: `base-scenario-${params.fundId}-${quarter}`,
      run_id: `base-scenario-${quarter}`,
      fund_id: params.fundId,
      quarter,
      gross_irr: baseScenario.summary.gross_irr,
      net_irr: baseScenario.summary.net_irr,
      gross_tvpi: baseScenario.summary.tvpi,
      net_tvpi: baseScenario.summary.net_tvpi,
      dpi: baseScenario.summary.dpi,
      rvpi: baseScenario.summary.rvpi,
      cash_on_cash: cashOnCash,
      gross_net_spread: grossNetSpread,
      inputs_missing: null,
    };

    const bridge = {
      id: `base-scenario-bridge-${params.fundId}-${quarter}`,
      run_id: `base-scenario-${quarter}`,
      fund_id: params.fundId,
      quarter,
      gross_return: baseScenario.summary.gross_irr ?? 0,
      mgmt_fees: baseScenario.summary.management_fees,
      fund_expenses: baseScenario.summary.fund_expenses,
      carry_shadow: baseScenario.summary.carry_shadow,
      net_return: baseScenario.summary.net_irr ?? 0,
    };

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
        const fundNetReturn = metrics.net_irr ?? null;
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
      metrics,
      bridge,
      benchmark,
    });
  } catch (err) {
    console.error("[re/v2/funds/[id]/metrics-detail] DB error", err);
    return Response.json({ metrics: null, bridge: null, benchmark: null });
  }
}
