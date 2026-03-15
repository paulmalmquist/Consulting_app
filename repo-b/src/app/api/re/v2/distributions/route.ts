import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/distributions?env_id=X&business_id=Y&fund_id=Z&status=S&event_type=T
 *
 * Returns distribution events with payout totals, joined to fund names.
 */
export async function GET(request: Request) {
  const pool = getPool();
  const empty = { distributions: [] as Record<string, unknown>[] };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const fundId = searchParams.get("fund_id");
  const status = searchParams.get("status");
  const eventType = searchParams.get("event_type");

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(empty);

    const params: (string | null)[] = [businessId];
    let idx = 2;
    let filters = "";

    if (fundId) {
      filters += ` AND de.fund_id = $${idx}::uuid`;
      params.push(fundId);
      idx++;
    }

    if (status) {
      filters += ` AND de.status = $${idx}`;
      params.push(status);
      idx++;
    }

    if (eventType) {
      filters += ` AND de.event_type = $${idx}`;
      params.push(eventType);
      idx++;
    }

    const res = await pool.query(
      `SELECT
         de.event_id::text,
         de.fund_id::text,
         f.name AS fund_name,
         de.event_type,
         de.total_amount::text,
         de.effective_date::text,
         de.status,
         de.created_at::text,
         COUNT(dp.payout_id)::int AS payout_count,
         COALESCE(SUM(dp.amount), 0)::text AS total_payouts
       FROM fin_distribution_event de
       JOIN repe_fund f ON f.fund_id = de.fund_id
       LEFT JOIN fin_distribution_payout dp ON dp.event_id = de.event_id
       WHERE f.business_id = $1::uuid${filters}
       GROUP BY de.event_id, f.name
       ORDER BY de.effective_date DESC`,
      params
    );

    return Response.json({ distributions: res.rows });
  } catch (err) {
    console.error("[re/v2/distributions] DB error", err);
    return Response.json(empty);
  }
}
