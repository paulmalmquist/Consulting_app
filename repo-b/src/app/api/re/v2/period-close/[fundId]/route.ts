import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/period-close/[fundId]?quarter=2026Q1
 *
 * Returns a specific fund's close history, current quarter state, and
 * asset-level quarter states.
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter");

  try {
    // ── Fund info ───────────────────────────────────────────────────────
    const fundRes = await pool.query(
      `SELECT fund_id::text, name, strategy, vintage_year, business_id::text
       FROM repe_fund
       WHERE fund_id = $1::uuid`,
      [params.fundId]
    );
    if (fundRes.rows.length === 0) {
      return Response.json({ error: "Fund not found" }, { status: 404 });
    }
    const fund = fundRes.rows[0];

    // ── Close runs ──────────────────────────────────────────────────────
    const runsRes = await pool.query(
      `SELECT
         id::text AS run_id,
         fund_id::text,
         metadata_json->>'quarter' AS quarter,
         status,
         triggered_by,
         started_at::text,
         completed_at::text,
         error_message
       FROM re_run_provenance
       WHERE fund_id = $1::uuid AND run_type = 'QUARTER_CLOSE'
       ORDER BY started_at DESC`,
      [params.fundId]
    );

    // ── Current / latest quarter state ──────────────────────────────────
    const stateParams: string[] = [params.fundId];
    let stateWhere = "fund_id = $1::uuid AND scenario_id IS NULL";
    if (quarter) {
      stateWhere += " AND quarter = $2";
      stateParams.push(quarter);
    }

    const stateRes = await pool.query(
      `SELECT
         id::text,
         fund_id::text,
         quarter,
         portfolio_nav::text,
         total_committed::text,
         total_called::text,
         total_distributed::text,
         dpi::text,
         rvpi::text,
         tvpi::text,
         gross_irr::text,
         net_irr::text,
         weighted_ltv::text,
         weighted_dscr::text,
         created_at::text
       FROM re_fund_quarter_state
       WHERE ${stateWhere}
       ORDER BY quarter DESC
       LIMIT 10`,
      stateParams
    );

    // ── Asset-level quarter states ──────────────────────────────────────
    // Use the latest quarter from fund state, or the requested quarter
    const targetQuarter = quarter || (stateRes.rows.length > 0 ? stateRes.rows[0].quarter : null);

    let assetStates: Record<string, unknown>[] = [];
    if (targetQuarter) {
      const assetRes = await pool.query(
        `SELECT
           aqs.id::text,
           aqs.asset_id::text,
           a.name AS asset_name,
           aqs.quarter,
           aqs.noi::text,
           aqs.revenue::text,
           aqs.opex::text,
           aqs.capex::text,
           aqs.debt_service::text,
           aqs.occupancy::text,
           aqs.debt_balance::text,
           aqs.cash_balance::text,
           aqs.asset_value::text,
           aqs.nav::text,
           aqs.valuation_method,
           aqs.created_at::text
         FROM re_asset_quarter_state aqs
         LEFT JOIN repe_asset a ON a.asset_id = aqs.asset_id
         WHERE aqs.run_id IN (
           SELECT rp.id FROM re_run_provenance rp
           WHERE rp.fund_id = $1::uuid AND rp.run_type = 'QUARTER_CLOSE'
         )
         AND aqs.quarter = $2
         AND aqs.scenario_id IS NULL
         ORDER BY a.name`,
        [params.fundId, targetQuarter]
      );
      assetStates = assetRes.rows;
    }

    return Response.json({
      fund,
      runs: runsRes.rows,
      quarter_states: stateRes.rows,
      asset_states: assetStates,
    });
  } catch (err) {
    console.error("[re/v2/period-close/[fundId]] DB error", err);
    return Response.json(
      { error: (err instanceof Error ? err.message : String(err)) || "Internal error" },
      { status: 500 }
    );
  }
}
