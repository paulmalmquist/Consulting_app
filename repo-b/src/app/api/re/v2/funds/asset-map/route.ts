import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/asset-map?env_id=X&business_id=Y&fund_id=Z&status=owned|pipeline|disposed|all
 *
 * Returns all property assets with lat/lon for map rendering,
 * with owned/pipeline/disposed status derived from deal stage and asset_status.
 * When fund_id is provided, results are scoped to that single fund.
 * Disposed assets are LEFT JOINed to re_asset_realization for sale metadata.
 */
export async function GET(request: Request) {
  const pool = getPool();
  const empty = { summary: { owned_assets: 0, pipeline_assets: 0, disposed_assets: 0, markets: 0 }, points: [] };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const fundId = searchParams.get("fund_id");
  const statusFilter = searchParams.get("status") || "all";

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(empty);

    const params: unknown[] = [businessId];
    let fundClause = "";
    if (fundId) {
      params.push(fundId);
      fundClause = `AND f.fund_id = $${params.length}::uuid`;
    }

    const sql = `
      SELECT
        a.asset_id::text,
        a.deal_id::text,
        a.name,
        CASE
          WHEN a.asset_status IN ('exited', 'written_off') THEN 'disposed'
          WHEN a.asset_status = 'pipeline' THEN 'pipeline'
          WHEN d.stage IN ('sourcing','underwriting','ic','closing') THEN 'pipeline'
          ELSE 'owned'
        END AS status,
        f.name AS fund_name,
        pa.property_type,
        pa.market,
        pa.city,
        pa.state,
        pa.latitude::text AS lat,
        pa.longitude::text AS lon,
        a.cost_basis::text,
        pa.current_noi::text,
        pa.occupancy::text,
        r.sale_date::text,
        r.net_sale_proceeds::text,
        r.gross_sale_price::text
      FROM repe_asset a
      JOIN repe_deal d ON d.deal_id = a.deal_id
      JOIN repe_fund f ON f.fund_id = d.fund_id
      JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
      LEFT JOIN re_asset_realization r ON r.asset_id = a.asset_id
      WHERE f.business_id = $1::uuid
        ${fundClause}
        AND pa.latitude IS NOT NULL
        AND pa.longitude IS NOT NULL
      ORDER BY a.name
    `;

    const res = await pool.query(sql, params);

    const points = statusFilter === "all"
      ? res.rows
      : res.rows.filter((r: Record<string, unknown>) => r.status === statusFilter);

    const ownedCount = res.rows.filter((r: Record<string, unknown>) => r.status === "owned").length;
    const pipelineCount = res.rows.filter((r: Record<string, unknown>) => r.status === "pipeline").length;
    const disposedCount = res.rows.filter((r: Record<string, unknown>) => r.status === "disposed").length;
    const markets = new Set(res.rows.map((r: Record<string, unknown>) => r.market).filter(Boolean)).size;

    return Response.json({
      summary: {
        owned_assets: ownedCount,
        pipeline_assets: pipelineCount,
        disposed_assets: disposedCount,
        markets,
      },
      points,
    });
  } catch (err) {
    console.error("[re/v2/funds/asset-map] DB error", err);
    return Response.json(empty);
  }
}
