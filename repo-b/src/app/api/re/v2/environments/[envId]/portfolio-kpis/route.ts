import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/environments/[envId]/portfolio-kpis
 *
 * Returns high-level portfolio KPIs for the environment:
 * fund count, total commitments, portfolio NAV, active assets.
 */
export async function GET(
  request: Request,
  { params }: { params: { envId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({
      env_id: params.envId,
      business_id: null,
      quarter: null,
      fund_count: 0,
      total_commitments: "0",
      portfolio_nav: null,
      active_assets: 0,
      warnings: ["Database not available"],
    });
  }

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter") || "2026Q1";

  try {
    // Resolve business_id
    const ebRes = await pool.query(
      `SELECT business_id::text FROM app.env_business_bindings WHERE env_id = $1::uuid LIMIT 1`,
      [params.envId]
    );
    const businessId = ebRes.rows[0]?.business_id;
    if (!businessId) {
      return Response.json({
        env_id: params.envId,
        business_id: null,
        quarter,
        fund_count: 0,
        total_commitments: "0",
        portfolio_nav: null,
        active_assets: 0,
        warnings: ["No business binding found for environment"],
      });
    }

    // Fund count + total commitments
    const fundsRes = await pool.query(
      `SELECT
         COUNT(*)::int AS fund_count,
         COALESCE(SUM(target_size), 0)::text AS total_commitments
       FROM repe_fund
       WHERE business_id = $1::uuid`,
      [businessId]
    );

    // Portfolio NAV from fund quarter states
    const navRes = await pool.query(
      `SELECT COALESCE(SUM(portfolio_nav), 0)::text AS portfolio_nav
       FROM re_fund_quarter_state
       WHERE fund_id IN (SELECT fund_id FROM repe_fund WHERE business_id = $1::uuid)
         AND quarter = $2
         AND scenario_id IS NULL`,
      [businessId, quarter]
    );

    // Active assets count
    const assetsRes = await pool.query(
      `SELECT COUNT(*)::int AS active_assets
       FROM repe_asset a
       JOIN repe_deal d ON d.deal_id = a.deal_id
       JOIN repe_fund f ON f.fund_id = d.fund_id
       WHERE f.business_id = $1::uuid
         AND COALESCE(a.asset_status, 'active') = 'active'`,
      [businessId]
    );

    const warnings: string[] = [];
    const portfolioNav = navRes.rows[0]?.portfolio_nav;
    if (!portfolioNav || portfolioNav === "0") {
      warnings.push(`No portfolio NAV found for ${quarter}. Run a quarter close to compute.`);
    }

    return Response.json({
      env_id: params.envId,
      business_id: businessId,
      quarter,
      fund_count: fundsRes.rows[0]?.fund_count || 0,
      total_commitments: fundsRes.rows[0]?.total_commitments || "0",
      portfolio_nav: portfolioNav !== "0" ? portfolioNav : null,
      active_assets: assetsRes.rows[0]?.active_assets || 0,
      warnings,
    });
  } catch (err) {
    console.error("[re/v2/environments/[envId]/portfolio-kpis] DB error", err);
    return Response.json({
      env_id: params.envId,
      business_id: null,
      quarter,
      fund_count: 0,
      total_commitments: "0",
      portfolio_nav: null,
      active_assets: 0,
      warnings: [String(err)],
    });
  }
}
