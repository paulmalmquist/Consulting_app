import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/waterfall-runs?env_id=X&fund_id=Y
 *
 * Lists waterfall runs for a fund, used by comparison picker.
 */
export async function GET(request: Request) {
  const pool = getPool();
  const empty = { runs: [] as Record<string, unknown>[] };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const fundId = searchParams.get("fund_id");

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(empty);

    const params: (string | null)[] = [businessId];
    let idx = 2;
    let filters = "";

    if (fundId) {
      filters += ` AND wr.fund_id = $${idx}::uuid`;
      params.push(fundId);
      idx++;
    }

    const res = await pool.query(
      `SELECT
         wr.run_id::text,
         wr.fund_id::text,
         f.name AS fund_name,
         wr.quarter,
         s.name AS scenario_name,
         s.scenario_type,
         wr.run_type,
         wr.total_distributable::text,
         wr.status,
         wr.created_at::text
       FROM re_waterfall_run wr
       JOIN repe_fund f ON f.fund_id = wr.fund_id
       LEFT JOIN re_scenario s ON s.scenario_id = wr.scenario_id
       WHERE f.business_id = $1::uuid${filters}
       ORDER BY wr.created_at DESC`,
      params
    );

    return Response.json({ runs: res.rows });
  } catch (err) {
    console.error("[re/v2/waterfall-runs] DB error", err);
    return Response.json(empty);
  }
}
