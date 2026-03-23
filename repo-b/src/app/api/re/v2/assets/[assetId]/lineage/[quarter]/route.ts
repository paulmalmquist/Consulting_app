import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/assets/[assetId]/lineage/[quarter]
 *
 * Returns computation lineage for an asset:
 * - Asset quarter state snapshot
 * - Parent hierarchy (investment, fund)
 * - Data completeness warnings
 */
export async function GET(
  request: Request,
  { params }: { params: { assetId: string; quarter: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({
      entity_type: "asset",
      entity_id: params.assetId,
      quarter: params.quarter,
      generated_at: new Date().toISOString(),
      widgets: [],
      issues: [{ severity: "error", code: "DB_UNAVAILABLE", message: "Database not available", widget_keys: [] }],
    });
  }

  try {
    // Asset info + parent hierarchy
    const assetRes = await pool.query(
      `SELECT
         a.asset_id::text, a.name AS asset_name, a.asset_type,
         d.deal_id::text AS investment_id, d.name AS investment_name,
         f.fund_id::text, f.name AS fund_name,
         pa.property_type, pa.units, pa.square_feet::float8
       FROM repe_asset a
       JOIN repe_deal d ON d.deal_id = a.deal_id
       JOIN repe_fund f ON f.fund_id = d.fund_id
       LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
       WHERE a.asset_id = $1::uuid`,
      [params.assetId]
    );
    const asset = assetRes.rows[0];
    if (!asset) {
      return Response.json(
        { error_code: "NOT_FOUND", message: "Asset not found" },
        { status: 404 }
      );
    }

    // Quarter state
    const qsRes = await pool.query(
      `SELECT
         noi::float8, revenue::float8, opex::float8, occupancy::float8,
         asset_value::float8, nav::float8, debt_balance::float8, debt_service::float8,
         valuation_method, run_id::text, inputs_hash, created_at::text
       FROM re_asset_quarter_state
       WHERE asset_id = $1::uuid AND quarter = $2 AND scenario_id IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [params.assetId, params.quarter]
    );
    const qs = qsRes.rows[0];

    const issues: Array<{ severity: string; code: string; message: string; widget_keys: string[] }> = [];
    const widgets: Array<Record<string, unknown>> = [];

    if (!qs) {
      issues.push({
        severity: "warn",
        code: "NO_QUARTER_STATE",
        message: `No quarter state for ${params.quarter}. Run a valuation or quarter close to populate.`,
        widget_keys: ["asset_nav", "asset_value", "asset_noi"],
      });
    }

    // NAV widget
    widgets.push({
      widget_key: "asset_nav",
      label: "Asset NAV",
      status: qs ? "ok" : "missing_data",
      display_value: qs?.nav ?? null,
      endpoint: `/api/re/v2/assets/${params.assetId}/quarter-state/${params.quarter}`,
      source_table: "re_asset_quarter_state",
      source_column: "nav",
      source_row_ref: params.assetId,
      run_id: qs?.run_id ?? null,
      inputs_hash: qs?.inputs_hash ?? null,
      computed_from: ["re_asset_quarter_state.asset_value", "re_asset_quarter_state.debt_balance"],
      propagates_to: ["re_investment_quarter_state.nav", "re_fund_quarter_state.portfolio_nav"],
      notes: [
        `Asset: ${asset.asset_name} (${asset.property_type ?? asset.asset_type})`,
        `Investment: ${asset.investment_name}`,
        `Fund: ${asset.fund_name}`,
        qs ? `Value: ${qs.asset_value}, Debt: ${qs.debt_balance ?? 0}, NAV: ${qs.nav}` : "No quarter state",
      ],
    });

    // Gross Value widget
    widgets.push({
      widget_key: "asset_value",
      label: "Gross Asset Value",
      status: qs ? "ok" : "missing_data",
      display_value: qs?.asset_value ?? null,
      endpoint: `/api/re/v2/assets/${params.assetId}/quarter-state/${params.quarter}`,
      source_table: "re_asset_quarter_state",
      source_column: "asset_value",
      source_row_ref: params.assetId,
      run_id: qs?.run_id ?? null,
      inputs_hash: qs?.inputs_hash ?? null,
      computed_from: ["re_asset_quarter_state.noi", "valuation_method"],
      propagates_to: ["asset_nav"],
      notes: qs ? [`Method: ${qs.valuation_method ?? "unknown"}`] : [],
    });

    // NOI widget
    widgets.push({
      widget_key: "asset_noi",
      label: "NOI (Quarterly)",
      status: qs ? "ok" : "missing_data",
      display_value: qs?.noi ?? null,
      endpoint: `/api/re/v2/assets/${params.assetId}/quarter-state/${params.quarter}`,
      source_table: "re_asset_quarter_state",
      source_column: "noi",
      source_row_ref: params.assetId,
      run_id: qs?.run_id ?? null,
      inputs_hash: null,
      computed_from: ["re_asset_quarter_state.revenue", "re_asset_quarter_state.opex"],
      propagates_to: ["asset_value"],
      notes: qs ? [`Revenue: ${qs.revenue ?? "—"}, OpEx: ${qs.opex ?? "—"}`] : [],
    });

    return Response.json({
      entity_type: "asset",
      entity_id: params.assetId,
      quarter: params.quarter,
      scenario_id: null,
      generated_at: new Date().toISOString(),
      widgets,
      issues,
    });
  } catch (err) {
    console.error("[re/v2/assets/[assetId]/lineage] DB error", err);
    return Response.json({
      entity_type: "asset",
      entity_id: params.assetId,
      quarter: params.quarter,
      generated_at: new Date().toISOString(),
      widgets: [],
      issues: [{ severity: "error", message: String(err) }],
    });
  }
}
