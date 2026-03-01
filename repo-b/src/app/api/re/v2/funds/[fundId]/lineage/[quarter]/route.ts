import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/lineage/[quarter]
 *
 * Returns computation lineage for a fund:
 * - Investment → Asset hierarchy
 * - Data completeness warnings
 * - NAV roll-up summary
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({
      entity_type: "fund",
      entity_id: params.fundId,
      quarter: params.quarter,
      generated_at: new Date().toISOString(),
      widgets: [],
      issues: [{ severity: "warning", message: "Database not available" }],
    });
  }

  try {
    // Fund info
    const fundRes = await pool.query(
      `SELECT fund_id::text, name, strategy FROM repe_fund WHERE fund_id = $1::uuid`,
      [params.fundId]
    );
    const fund = fundRes.rows[0];
    if (!fund) {
      return Response.json(
        { error_code: "NOT_FOUND", message: "Fund not found" },
        { status: 404 }
      );
    }

    // Investment-level breakdown
    const invRes = await pool.query(
      `SELECT
         d.deal_id::text AS investment_id,
         d.name,
         d.stage,
         COUNT(a.asset_id)::int AS asset_count,
         COUNT(qs.id)::int AS assets_with_state,
         COALESCE(SUM(qs.noi), 0)::float8 AS total_noi,
         COALESCE(SUM(qs.asset_value), 0)::float8 AS total_value,
         COALESCE(SUM(qs.nav), 0)::float8 AS total_nav
       FROM repe_deal d
       LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
       LEFT JOIN re_asset_quarter_state qs
         ON qs.asset_id = a.asset_id AND qs.quarter = $2 AND qs.scenario_id IS NULL
       WHERE d.fund_id = $1::uuid
       GROUP BY d.deal_id, d.name, d.stage
       ORDER BY d.name`,
      [params.fundId, params.quarter]
    );

    // Fund quarter state
    const fqsRes = await pool.query(
      `SELECT portfolio_nav::float8, total_committed::float8, dpi::float8, tvpi::float8,
              gross_irr::float8, net_irr::float8
       FROM re_fund_quarter_state
       WHERE fund_id = $1::uuid AND quarter = $2 AND scenario_id IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [params.fundId, params.quarter]
    );

    const issues: Array<{ severity: string; message: string }> = [];
    const widgets: Array<Record<string, unknown>> = [];

    // Check for missing data
    const totalAssets = invRes.rows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.asset_count) || 0), 0);
    const assetsWithState = invRes.rows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.assets_with_state) || 0), 0);
    if (totalAssets > assetsWithState) {
      issues.push({
        severity: "warning",
        message: `${totalAssets - assetsWithState} of ${totalAssets} assets missing quarter state for ${params.quarter}`,
      });
    }

    if (!fqsRes.rows[0]) {
      issues.push({
        severity: "info",
        message: `No fund quarter state for ${params.quarter}. Run a quarter close to compute portfolio metrics.`,
      });
    }

    // Summary widget
    const totalNav = invRes.rows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.total_nav) || 0), 0);
    widgets.push({
      type: "summary",
      title: "Fund NAV Lineage",
      data: {
        fund_name: fund.name,
        strategy: fund.strategy,
        quarter: params.quarter,
        total_investments: invRes.rows.length,
        total_assets: totalAssets,
        assets_with_state: assetsWithState,
        bottom_up_nav: totalNav,
        fund_quarter_state_nav: fqsRes.rows[0]?.portfolio_nav || null,
      },
    });

    // Investment breakdown widget
    widgets.push({
      type: "table",
      title: "Investment Contributions",
      columns: ["Investment", "Stage", "Assets", "NOI", "Value", "NAV"],
      rows: invRes.rows.map((r: Record<string, unknown>) => ({
        investment_id: r.investment_id,
        name: r.name,
        stage: r.stage,
        asset_count: r.asset_count,
        total_noi: r.total_noi,
        total_value: r.total_value,
        total_nav: r.total_nav,
      })),
    });

    return Response.json({
      entity_type: "fund",
      entity_id: params.fundId,
      quarter: params.quarter,
      scenario_id: null,
      generated_at: new Date().toISOString(),
      widgets,
      issues,
    });
  } catch (err) {
    console.error("[re/v2/funds/[id]/lineage] DB error", err);
    return Response.json({
      entity_type: "fund",
      entity_id: params.fundId,
      quarter: params.quarter,
      generated_at: new Date().toISOString(),
      widgets: [],
      issues: [{ severity: "error", message: String(err) }],
    });
  }
}
