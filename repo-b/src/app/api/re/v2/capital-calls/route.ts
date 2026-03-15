import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/capital-calls?env_id=X&business_id=Y&fund_id=Z&status=S
 *
 * Returns capital calls with contribution totals, joined to fund names.
 */
export async function GET(request: Request) {
  const pool = getPool();
  const empty = { capital_calls: [] as Record<string, unknown>[] };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const fundId = searchParams.get("fund_id");
  const status = searchParams.get("status");

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(empty);

    const params: (string | null)[] = [businessId];
    let idx = 2;
    let filters = "";

    if (fundId) {
      filters += ` AND cc.fund_id = $${idx}::uuid`;
      params.push(fundId);
      idx++;
    }

    if (status) {
      filters += ` AND cc.status = $${idx}`;
      params.push(status);
      idx++;
    }

    const res = await pool.query(
      `SELECT
         cc.call_id::text,
         cc.fund_id::text,
         f.name AS fund_name,
         cc.call_number,
         cc.call_date::text,
         cc.due_date::text,
         cc.amount_requested::text,
         cc.purpose,
         cc.status,
         cc.created_at::text,
         COUNT(c.contribution_id)::int AS contribution_count,
         COALESCE(SUM(c.amount_contributed), 0)::text AS total_contributed
       FROM fin_capital_call cc
       JOIN repe_fund f ON f.fund_id = cc.fund_id
       LEFT JOIN fin_contribution c ON c.call_id = cc.call_id
       WHERE f.business_id = $1::uuid${filters}
       GROUP BY cc.call_id, f.name
       ORDER BY cc.call_date DESC`,
      params
    );

    return Response.json({ capital_calls: res.rows });
  } catch (err) {
    console.error("[re/v2/capital-calls] DB error", err);
    return Response.json(empty);
  }
}
