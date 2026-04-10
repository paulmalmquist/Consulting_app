import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/environments/[envId]/fund-timeseries?metric=portfolio_nav
 *
 * Returns per-fund metric values across all available quarters for time-series charting.
 * Each row: { quarter, fund1_name: value, fund2_name: value, ... }
 *
 * Supported metrics: portfolio_nav, gross_irr, net_irr, tvpi, dpi
 */
export async function GET(
  request: Request,
  { params }: { params: { envId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([]);

  const { searchParams } = new URL(request.url);
  const metric = searchParams.get("metric") || "portfolio_nav";

  const ALLOWED_METRICS = ["portfolio_nav", "gross_irr", "net_irr", "tvpi", "dpi", "weighted_dscr"];
  if (!ALLOWED_METRICS.includes(metric)) {
    return Response.json({ error: `Invalid metric: ${metric}` }, { status: 400 });
  }

  try {
    const ebRes = await pool.query(
      `SELECT business_id::text FROM app.env_business_bindings WHERE env_id = $1::uuid LIMIT 1`,
      [params.envId]
    );
    const businessId = ebRes.rows[0]?.business_id;
    if (!businessId) return Response.json([]);

    // Get fund names
    const fundsRes = await pool.query(
      `SELECT fund_id::text, name FROM repe_fund WHERE business_id = $1::uuid ORDER BY name`,
      [businessId]
    );

    // Get all quarter state data for these funds, using DISTINCT ON for latest per fund+quarter
    const stateRes = await pool.query(
      `SELECT DISTINCT ON (fqs.fund_id, fqs.quarter)
         fqs.fund_id::text,
         fqs.quarter,
         fqs.${metric}::text AS value
       FROM re_fund_quarter_state fqs
       WHERE fqs.fund_id IN (SELECT fund_id FROM repe_fund WHERE business_id = $1::uuid)
         AND fqs.scenario_id IS NULL
       ORDER BY fqs.fund_id, fqs.quarter, fqs.created_at DESC`,
      [businessId]
    );

    // Build lookup: fund_id -> name
    const fundNames: Record<string, string> = {};
    for (const f of fundsRes.rows) {
      fundNames[f.fund_id] = f.name;
    }

    // Build quarter -> { fundName: value } map
    const quarterMap: Record<string, Record<string, number | null>> = {};
    for (const row of stateRes.rows) {
      const q = row.quarter;
      if (!quarterMap[q]) quarterMap[q] = {};
      const name = fundNames[row.fund_id] || row.fund_id;
      quarterMap[q][name] = row.value ? parseFloat(row.value) : null;
    }

    // Sort quarters and build output
    const quarters = Object.keys(quarterMap).sort();
    const result = quarters.map((q) => ({
      quarter: q,
      ...quarterMap[q],
    }));

    return Response.json({
      metric,
      funds: fundsRes.rows.map((f: { fund_id: string; name: string }) => f.name),
      data: result,
    });
  } catch (err) {
    console.error("[re/v2/environments/[envId]/fund-timeseries] DB error", err);
    return Response.json([]);
  }
}
