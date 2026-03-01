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
      issues: [{ severity: "error", code: "DB_UNAVAILABLE", message: "Database not available", widget_keys: [] }],
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

    const issues: Array<{ severity: string; code: string; message: string; widget_keys: string[] }> = [];
    const widgets: Array<Record<string, unknown>> = [];

    // Check for missing data
    const totalAssets = invRes.rows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.asset_count) || 0), 0);
    const assetsWithState = invRes.rows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.assets_with_state) || 0), 0);
    const fqs = fqsRes.rows[0];

    if (totalAssets > assetsWithState) {
      issues.push({
        severity: "warn",
        code: "MISSING_ASSET_STATE",
        message: `${totalAssets - assetsWithState} of ${totalAssets} assets missing quarter state for ${params.quarter}`,
        widget_keys: ["fund_portfolio_nav"],
      });
    }

    if (!fqs) {
      issues.push({
        severity: "info",
        code: "NO_FUND_QUARTER_STATE",
        message: `No fund quarter state for ${params.quarter}. Run a quarter close to compute portfolio metrics.`,
        widget_keys: ["fund_portfolio_nav", "fund_irr", "fund_tvpi"],
      });
    }

    // Summary widget — properly shaped for EntityLineagePanel
    const totalNav = invRes.rows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.total_nav) || 0), 0);
    const hasQuarterState = !!fqs;
    widgets.push({
      widget_key: "fund_portfolio_nav",
      label: "Portfolio NAV",
      status: hasQuarterState ? "ok" : "missing_data",
      display_value: fqs?.portfolio_nav ?? totalNav,
      endpoint: `/api/re/v2/funds/${params.fundId}/quarter-state/${params.quarter}`,
      source_table: "re_fund_quarter_state",
      source_column: "portfolio_nav",
      source_row_ref: params.fundId,
      run_id: null,
      inputs_hash: null,
      computed_from: ["re_investment_quarter_state.nav"],
      propagates_to: ["re_fund_quarter_state.portfolio_nav"],
      notes: [
        `Fund: ${fund.name} (${fund.strategy})`,
        `Investments: ${invRes.rows.length}, Assets: ${totalAssets} (${assetsWithState} with state)`,
        `Bottom-up NAV: ${totalNav}, Quarter state NAV: ${fqs?.portfolio_nav ?? "not computed"}`,
      ],
    });

    widgets.push({
      widget_key: "fund_irr",
      label: "Fund IRR (Gross)",
      status: hasQuarterState ? "ok" : "missing_data",
      display_value: fqs?.gross_irr ?? null,
      endpoint: `/api/re/v2/funds/${params.fundId}/metrics-detail`,
      source_table: "re_fund_quarter_state",
      source_column: "gross_irr",
      source_row_ref: params.fundId,
      run_id: null,
      inputs_hash: null,
      computed_from: ["re_capital_ledger.amount", "re_fund_quarter_state.portfolio_nav"],
      propagates_to: [],
      notes: [],
    });

    widgets.push({
      widget_key: "fund_tvpi",
      label: "TVPI",
      status: hasQuarterState ? "ok" : "missing_data",
      display_value: fqs?.tvpi ?? null,
      endpoint: `/api/re/v2/funds/${params.fundId}/metrics-detail`,
      source_table: "re_fund_quarter_state",
      source_column: "tvpi",
      source_row_ref: params.fundId,
      run_id: null,
      inputs_hash: null,
      computed_from: ["re_fund_quarter_state.portfolio_nav", "re_fund_quarter_state.total_called"],
      propagates_to: [],
      notes: [],
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
