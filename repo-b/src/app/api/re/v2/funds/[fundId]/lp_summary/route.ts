import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/lp_summary
 *
 * Returns LP summary for a fund: partner commitments, capital activity,
 * and waterfall allocations for a given quarter.
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({
      fund_id: params.fundId,
      quarter: null,
      partners: [],
      totals: null,
      waterfall: null,
    });
  }

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter") || "2026Q1";

  try {
    // Partner commitments and capital activity
    const partnersRes = await pool.query(
      `SELECT
         p.partner_id::text,
         p.name,
         p.partner_type,
         c.committed_amount::float8 AS commitment_amount,
         (c.committed_amount / NULLIF(SUM(c.committed_amount) OVER (), 0))::float8 AS ownership_pct,
         pm.contributed_to_date::float8,
         pm.distributed_to_date::float8,
         pm.nav::float8,
         pm.dpi::float8,
         pm.tvpi::float8,
         pm.irr::float8
       FROM re_partner p
       JOIN re_partner_commitment c ON c.partner_id = p.partner_id AND c.fund_id = $1::uuid
       LEFT JOIN re_partner_quarter_metrics pm
         ON pm.partner_id = p.partner_id
         AND pm.fund_id = $1::uuid
         AND pm.quarter = $2
         AND pm.scenario_id IS NULL
       WHERE p.business_id = (SELECT business_id FROM repe_fund WHERE fund_id = $1::uuid)
       ORDER BY p.name`,
      [params.fundId, quarter]
    );

    // Fund-level totals
    const totalsRes = await pool.query(
      `SELECT
         portfolio_nav::float8,
         total_committed::float8,
         total_called::float8,
         total_distributed::float8,
         dpi::float8, tvpi::float8,
         gross_irr::float8, net_irr::float8
       FROM re_fund_quarter_state
       WHERE fund_id = $1::uuid AND quarter = $2 AND scenario_id IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [params.fundId, quarter]
    );

    // Waterfall results if available
    const waterfallRes = await pool.query(
      `SELECT
         wr.tier_label, wr.tier_order,
         wr.lp_amount::float8, wr.gp_amount::float8,
         wr.total_amount::float8
       FROM re_waterfall_result wr
       JOIN re_waterfall_run wrun ON wrun.run_id = wr.run_id
       WHERE wrun.fund_id = $1::uuid
         AND wrun.quarter = $2
         AND wrun.scenario_id IS NULL
       ORDER BY wr.tier_order`,
      [params.fundId, quarter]
    );

    return Response.json({
      fund_id: params.fundId,
      quarter,
      partners: partnersRes.rows,
      totals: totalsRes.rows[0] || null,
      waterfall: waterfallRes.rows.length > 0 ? waterfallRes.rows : null,
    });
  } catch (err) {
    console.error("[re/v2/funds/[id]/lp_summary] DB error", err);
    return Response.json({
      fund_id: params.fundId,
      quarter,
      partners: [],
      totals: null,
      waterfall: null,
    });
  }
}
