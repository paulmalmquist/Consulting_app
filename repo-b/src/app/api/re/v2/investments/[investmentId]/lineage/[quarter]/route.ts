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
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenario_id");
  const versionId = searchParams.get("version_id");

  if (!pool) {
    return Response.json({
      entity_type: "investment",
      entity_id: params.investmentId,
      quarter: params.quarter,
      scenario_id: scenarioId,
      version_id: versionId,
      generated_at: new Date().toISOString(),
      widgets: [],
      issues: [{ severity: "error", code: "DB_UNAVAILABLE", message: "Database not available", widget_keys: [] }],
    });
  }

  try {
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

    const assetsRes = await pool.query(
      `WITH asset_states AS (
         SELECT
           a.asset_id::text,
           a.name,
           qs.quarter,
           qs.noi::float8,
           qs.asset_value::float8,
           qs.nav::float8,
           qs.run_id::text,
           qs.created_at::text,
           ROW_NUMBER() OVER (
             PARTITION BY a.asset_id, qs.quarter
             ORDER BY
               CASE
                 WHEN $4::uuid IS NOT NULL AND qs.version_id = $4::uuid THEN 0
                 WHEN qs.version_id IS NULL THEN 1
                 ELSE 2
               END,
               qs.created_at DESC
           ) AS version_rank
         FROM repe_asset a
         LEFT JOIN re_asset_quarter_state qs
           ON qs.asset_id = a.asset_id
           AND qs.quarter = $2
           AND (
             ($3::uuid IS NULL AND qs.scenario_id IS NULL)
             OR qs.scenario_id = $3::uuid
           )
           AND (
             $4::uuid IS NULL
             OR qs.version_id = $4::uuid
             OR qs.version_id IS NULL
           )
         WHERE a.deal_id = $1::uuid
       )
       SELECT asset_id, name, quarter, noi, asset_value, nav, run_id, created_at
       FROM asset_states
       WHERE quarter IS NULL OR version_rank = 1
       ORDER BY name`,
      [params.investmentId, params.quarter, scenarioId, versionId]
    );

    const issues: Array<{ severity: string; code: string; message: string; widget_keys: string[] }> = [];
    const widgets: Array<Record<string, unknown>> = [];

    const missingQs = assetsRes.rows.filter((r: Record<string, unknown>) => !r.quarter);
    if (missingQs.length > 0) {
      issues.push({
        severity: "warn",
        code: "MISSING_ASSET_STATE",
        message: `${missingQs.length} asset(s) missing quarter state for ${params.quarter}: ${missingQs.map((r: Record<string, unknown>) => r.name).join(", ")}`,
        widget_keys: ["investment_nav"],
      });
    }

    const totalNav = assetsRes.rows.reduce(
      (sum: number, r: Record<string, unknown>) => sum + (Number(r.nav) || 0), 0
    );
    const assetsWithState = assetsRes.rows.filter((r: Record<string, unknown>) => r.quarter).length;
    const hasState = assetsWithState > 0;
    widgets.push({
      widget_key: "investment_nav",
      label: "Investment NAV",
      status: hasState ? (missingQs.length > 0 ? "fallback" : "ok") : "missing_data",
      display_value: totalNav,
      endpoint: `/api/re/v2/investments/${params.investmentId}/quarter-state/${params.quarter}`,
      source_table: "re_asset_quarter_state",
      source_column: "nav",
      source_row_ref: params.investmentId,
      run_id: assetsRes.rows.find((r: Record<string, unknown>) => r.run_id)?.run_id ?? null,
      inputs_hash: null,
      computed_from: ["re_asset_quarter_state.nav"],
      propagates_to: ["re_investment_quarter_state.nav", "re_fund_quarter_state.portfolio_nav"],
      notes: [
        `Investment: ${inv.name}`,
        `Assets: ${assetsRes.rows.length} total, ${assetsWithState} with quarter state`,
      ],
    });

    for (const r of assetsRes.rows as Record<string, unknown>[]) {
      widgets.push({
        widget_key: `asset_nav_${r.asset_id}`,
        label: `${r.name} · NAV`,
        status: r.quarter ? "ok" : "missing_data",
        display_value: r.nav ?? null,
        endpoint: `/api/re/v2/assets/${r.asset_id}/quarter-state/${params.quarter}`,
        source_table: "re_asset_quarter_state",
        source_column: "nav",
        source_row_ref: String(r.asset_id),
        run_id: r.run_id ?? null,
        inputs_hash: null,
        computed_from: ["repe_asset.asset_id"],
        propagates_to: ["investment_nav"],
        notes: r.quarter ? [] : [`No quarter state for ${params.quarter}`],
      });
    }

    return Response.json({
      entity_type: "investment",
      entity_id: params.investmentId,
      quarter: params.quarter,
      scenario_id: scenarioId,
      version_id: versionId,
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
      scenario_id: scenarioId,
      version_id: versionId,
      generated_at: new Date().toISOString(),
      widgets: [],
      issues: [{ severity: "error", code: "DB_ERROR", message: String(err), widget_keys: [] }],
    });
  }
}
