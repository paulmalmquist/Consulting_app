import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(
  request: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  const { searchParams } = new URL(request.url);
  const quarterFrom = searchParams.get("quarter_from");
  const quarterTo = searchParams.get("quarter_to");
  const scenarioId = searchParams.get("scenario_id");

  try {
    // Try to get enriched data by joining quarter_state with accounting rollups
    const conditions: string[] = ["qs.asset_id = $1::uuid"];
    const values: (string | number)[] = [params.assetId];
    let idx = 2;

    if (scenarioId) {
      conditions.push(`qs.scenario_id = $${idx}::uuid`);
      values.push(scenarioId);
      idx++;
    } else {
      conditions.push("qs.scenario_id IS NULL");
    }

    if (quarterFrom) {
      conditions.push(`qs.quarter >= $${idx}`);
      values.push(quarterFrom);
      idx++;
    }

    if (quarterTo) {
      conditions.push(`qs.quarter <= $${idx}`);
      values.push(quarterTo);
      idx++;
    }

    const whereClause = conditions.join(" AND ");

    const res = await pool.query(
      `SELECT
         qs.quarter,
         qs.revenue,
         qs.opex,
         qs.noi,
         qs.occupancy,
         qs.asset_value,
         qs.capex,
         qs.debt_service,
         qs.debt_balance,
         qs.cash_balance,
         qs.nav,
         qs.valuation_method,
         CASE
           WHEN qs.asset_value IS NOT NULL AND qs.asset_value > 0 AND qs.noi IS NOT NULL
           THEN (qs.noi * 4) / qs.asset_value
           ELSE NULL
         END AS cap_rate
       FROM re_asset_quarter_state qs
       WHERE ${whereClause}
       ORDER BY qs.quarter ASC`,
      values
    );

    // Map to the expected response shape
    const rows = res.rows.map((r) => ({
      quarter: r.quarter,
      revenue: r.revenue,
      opex: r.opex,
      noi: r.noi,
      occupancy: r.occupancy,
      asset_value: r.asset_value,
      cap_rate: r.cap_rate,
      capex: r.capex,
      debt_service: r.debt_service,
      debt_balance: r.debt_balance,
      cash_balance: r.cash_balance,
      nav: r.nav,
      valuation_method: r.valuation_method,
    }));

    return Response.json(rows);
  } catch (err) {
    console.error("[re/v2/assets/[assetId]/periods] DB error", err);
    return Response.json([], { status: 200 });
  }
}
