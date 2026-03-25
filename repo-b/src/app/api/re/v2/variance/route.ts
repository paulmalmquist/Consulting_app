import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/variance?env_id=X&fund_id=Y&quarter=2026Q1&asset_id=Z
 *
 * Returns budget vs actual variance data from re_asset_variance_qtr,
 * joined with repe_asset for names.
 */
export async function GET(request: Request) {
  const pool = getPool();
  const empty = {
    variance_items: [] as Record<string, unknown>[],
    summary: { total_actual: "0", total_plan: "0", total_variance: "0", avg_variance_pct: "0" },
  };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const fundId = searchParams.get("fund_id");
  const quarter = searchParams.get("quarter");
  const assetId = searchParams.get("asset_id");

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(empty);

    const params: (string | null)[] = [businessId];
    let idx = 2;
    let filters = "";

    if (fundId) {
      filters += ` AND v.fund_id = $${idx}::uuid`;
      params.push(fundId);
      idx++;
    }

    if (quarter) {
      filters += ` AND v.quarter = $${idx}`;
      params.push(quarter);
      idx++;
    }

    if (assetId) {
      filters += ` AND v.asset_id = $${idx}::uuid`;
      params.push(assetId);
      idx++;
    }

    const res = await pool.query(
      `SELECT
         v.id::text,
         v.run_id::text,
         v.fund_id::text,
         v.asset_id::text,
         a.name AS asset_name,
         a.property_type,
         a.address_city,
         a.address_state,
         v.quarter,
         v.line_code,
         v.actual_amount::text,
         v.plan_amount::text,
         v.variance_amount::text,
         v.variance_pct::text
       FROM re_asset_variance_qtr v
       JOIN repe_asset a ON a.asset_id = v.asset_id
       WHERE v.business_id = $1::uuid${filters}
       ORDER BY a.name, v.line_code`,
      params
    );

    const rows = res.rows;

    // Compute summary aggregates
    let totalActual = 0;
    let totalPlan = 0;
    let totalVariance = 0;
    let variancePctSum = 0;
    let variancePctCount = 0;

    for (const row of rows) {
      totalActual += parseFloat((row.actual_amount as string) || "0");
      totalPlan += parseFloat((row.plan_amount as string) || "0");
      totalVariance += parseFloat((row.variance_amount as string) || "0");
      const pct = parseFloat((row.variance_pct as string) || "0");
      if (!isNaN(pct) && row.variance_pct != null) {
        variancePctSum += pct;
        variancePctCount++;
      }
    }

    const avgVariancePct = variancePctCount > 0 ? variancePctSum / variancePctCount : 0;

    return Response.json({
      variance_items: rows,
      summary: {
        total_actual: totalActual.toFixed(2),
        total_plan: totalPlan.toFixed(2),
        total_variance: totalVariance.toFixed(2),
        avg_variance_pct: avgVariancePct.toFixed(2),
      },
    });
  } catch (err) {
    console.error("[re/v2/variance] DB error", err);
    return Response.json(empty);
  }
}
