import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/investments/[investmentId]/lineage/[quarter]
 *
 * Returns the computation lineage for an investment:
 * - Which assets contributed to NAV
 * - Data freshness / staleness warnings
 * - Input sources (quarter state, accounting, valuations)
 */
export async function GET(
  request: Request,
  { params }: { params: { investmentId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({
      entity_type: "investment",
      entity_id: params.investmentId,
      quarter: params.quarter,
      generated_at: new Date().toISOString(),
      widgets: [],
      issues: [{ severity: "warning", message: "Database not available" }],
    });
  }

  try {
    // Get investment info
    const invRes = await pool.query(
      `SELECT d.deal_id::text AS investment_id, d.name, d.fund_id::text
       FROM repe_deal d WHERE d.deal_id = $1::uuid`,
      [params.investmentId]
    );
    const inv = invRes.rows[0];
    if (!inv) {
      return Response.json(
        { error_code: "NOT_FOUND", message: "Investment not found" },
        { status: 404 }
      );
    }

    // Get asset-level quarter states
    const assetsRes = await pool.query(
      `SELECT
         a.asset_id::text, a.name,
         qs.quarter, qs.noi::float8, qs.asset_value::float8, qs.nav::float8,
         qs.run_id::text, qs.created_at::text
       FROM repe_asset a
       LEFT JOIN re_asset_quarter_state qs
         ON qs.asset_id = a.asset_id AND qs.quarter = $2 AND qs.scenario_id IS NULL
       WHERE a.deal_id = $1::uuid
       ORDER BY a.name`,
      [params.investmentId, params.quarter]
    );

    const issues: Array<{ severity: string; message: string }> = [];
    const widgets: Array<Record<string, unknown>> = [];

    // Check for missing quarter states
    const missingQs = assetsRes.rows.filter((r: Record<string, unknown>) => !r.quarter);
    if (missingQs.length > 0) {
      issues.push({
        severity: "warning",
        message: `${missingQs.length} asset(s) missing quarter state for ${params.quarter}: ${missingQs.map((r: Record<string, unknown>) => r.name).join(", ")}`,
      });
    }

    // NAV summary widget
    const totalNav = assetsRes.rows.reduce(
      (sum: number, r: Record<string, unknown>) => sum + (Number(r.nav) || 0), 0
    );
    widgets.push({
      type: "summary",
      title: "Investment NAV Lineage",
      data: {
        investment_name: inv.name,
        quarter: params.quarter,
        total_assets: assetsRes.rows.length,
        assets_with_state: assetsRes.rows.filter((r: Record<string, unknown>) => r.quarter).length,
        total_nav: totalNav,
      },
    });

    // Asset breakdown widget
    widgets.push({
      type: "table",
      title: "Asset Contributions",
      columns: ["Asset", "NOI", "Value", "NAV"],
      rows: assetsRes.rows.map((r: Record<string, unknown>) => ({
        asset_id: r.asset_id,
        name: r.name,
        noi: r.noi,
        asset_value: r.asset_value,
        nav: r.nav,
      })),
    });

    return Response.json({
      entity_type: "investment",
      entity_id: params.investmentId,
      quarter: params.quarter,
      scenario_id: null,
      generated_at: new Date().toISOString(),
      widgets,
      issues,
    });
  } catch (err) {
    console.error("[re/v2/investments/[id]/lineage] DB error", err);
    return Response.json({
      entity_type: "investment",
      entity_id: params.investmentId,
      quarter: params.quarter,
      generated_at: new Date().toISOString(),
      widgets: [],
      issues: [{ severity: "error", message: String(err) }],
    });
  }
}
