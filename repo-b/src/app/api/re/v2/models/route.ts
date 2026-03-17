import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/models?business_id=X
 * List all models across all funds for a business.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get("business_id");

  if (!businessId) {
    return Response.json({ error: "business_id required" }, { status: 400 });
  }

  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  try {
    const res = await pool.query(
      `SELECT m.model_id::text, m.primary_fund_id::text, m.env_id::text,
              m.name, m.description, m.status, m.model_type, m.strategy_type,
              m.created_by, m.created_at::text,
              f.name AS fund_name,
              COALESCE(sc.cnt, 0)::int AS scenario_count,
              lr.started_at::text AS last_run_at,
              lr.status AS last_run_status,
              COALESCE(scp.cnt, 0)::int AS scope_count
       FROM re_model m
       LEFT JOIN repe_fund f ON f.fund_id = m.primary_fund_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt FROM re_model_scenarios s WHERE s.model_id = m.model_id
       ) sc ON true
       LEFT JOIN LATERAL (
         SELECT r.started_at, r.status FROM re_model_run r
         WHERE r.model_id = m.model_id ORDER BY r.created_at DESC LIMIT 1
       ) lr ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt FROM re_model_scope scp
         WHERE scp.model_id = m.model_id AND scp.include = true
       ) scp ON true
       WHERE f.business_id = $1::uuid
          OR m.env_id IN (SELECT env_id FROM env_business_bindings WHERE business_id = $1::uuid)
       ORDER BY m.created_at DESC`,
      [businessId]
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/models GET] DB error", err);
    return Response.json([], { status: 200 });
  }
}
