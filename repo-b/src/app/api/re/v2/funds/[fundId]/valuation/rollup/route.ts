import { getPool } from "@/lib/server/db";
import { computeFundBaseScenario } from "@/lib/server/reBaseScenario";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/valuation/rollup?quarter=2026Q1&scenario_id=...
 *
 * Aggregate all asset quarter states for a fund + quarter + optional scenario.
 * Returns: total portfolio value, total equity, weighted avg cap rate, weighted avg LTV.
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "DB_UNAVAILABLE", message: "Database not available" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter");
  const scenarioId = searchParams.get("scenario_id");

  if (!quarter) {
    return Response.json({ error_code: "MISSING_PARAM", message: "quarter is required" }, { status: 400 });
  }

  try {
    const scenarioClause = scenarioId
      ? "AND qs.scenario_id = $3::uuid"
      : "AND qs.scenario_id IS NULL";
    const values = scenarioId ? [params.fundId, quarter, scenarioId] : [params.fundId, quarter];
    const baseScenario = await computeFundBaseScenario({
      pool,
      fundId: params.fundId,
      quarter,
      scenarioId,
      liquidationMode: "current_state",
    });
    const occupancyRes = await pool.query(
      `WITH latest_qs AS (
         SELECT DISTINCT ON (qs.asset_id)
           qs.asset_id::text,
           qs.occupancy::float8
         FROM re_asset_quarter_state qs
         JOIN repe_asset a ON a.asset_id = qs.asset_id
         JOIN repe_deal d ON d.deal_id = a.deal_id
         WHERE d.fund_id = $1::uuid
           AND qs.quarter = $2
           ${scenarioClause}
         ORDER BY qs.asset_id, qs.created_at DESC
       )
       SELECT * FROM latest_qs`,
      values
    );

    const occupancyByAsset = new Map<string, number>(
      occupancyRes.rows.map((row) => [String(row.asset_id), Number(row.occupancy || 0)])
    );
    const activeAssets = baseScenario.assets.filter((asset) => asset.status_category === "active");
    const totalPortfolioValue = activeAssets.reduce((sum, asset) => sum + asset.attributable_gross_value, 0);
    const totalDebt = activeAssets.reduce((sum, asset) => sum + asset.debt_balance * asset.ownership_percent, 0);
    const totalNoi = activeAssets.reduce((sum, asset) => sum + asset.attributable_noi, 0);
    const weightedAvgOccupancy =
      totalPortfolioValue > 0
        ? activeAssets.reduce((sum, asset) => {
            const occupancy = occupancyByAsset.get(asset.asset_id) || 0;
            return sum + occupancy * asset.attributable_gross_value;
          }, 0) / totalPortfolioValue
        : null;

    return Response.json({
      fund_id: params.fundId,
      quarter,
      scenario_id: scenarioId ?? null,
      summary: {
        asset_count: baseScenario.assets.length,
        total_portfolio_value: totalPortfolioValue,
        total_equity: baseScenario.summary.attributable_nav,
        total_debt: totalDebt,
        total_noi: totalNoi,
        weighted_avg_cap_rate: totalPortfolioValue > 0 ? (totalNoi * 4) / totalPortfolioValue : null,
        weighted_avg_ltv: totalPortfolioValue > 0 ? totalDebt / totalPortfolioValue : null,
        weighted_avg_occupancy: weightedAvgOccupancy,
      },
      assets: baseScenario.assets
        .map((asset) => ({
          asset_id: asset.asset_id,
          asset_name: asset.asset_name,
          property_type: asset.property_type,
          noi: asset.attributable_noi,
          asset_value: asset.attributable_gross_value,
          nav: asset.attributable_nav,
          debt_balance: asset.debt_balance * asset.ownership_percent,
          occupancy: occupancyByAsset.get(asset.asset_id) ?? null,
          valuation_method: asset.valuation_method,
        }))
        .sort((left, right) => Number(right.asset_value || 0) - Number(left.asset_value || 0)),
    });
  } catch (err) {
    console.error("[re/v2/funds/valuation/rollup] error", err);
    return Response.json(
      { error_code: "DB_ERROR", message: String(err) },
      { status: 500 }
    );
  }
}
