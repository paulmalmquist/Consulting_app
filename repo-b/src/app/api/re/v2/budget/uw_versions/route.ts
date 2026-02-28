import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/budget/uw_versions
 *
 * Lists underwriting/budget versions for a business.
 * Query params: env_id, business_id
 */
export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json([]);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const businessId = searchParams.get("business_id");

  if (!envId || !businessId) {
    return Response.json([]);
  }

  try {
    const res = await pool.query(
      `SELECT
         id::text, env_id, business_id::text, name,
         scenario_id::text, effective_from::text, created_at::text
       FROM uw_version
       WHERE env_id = $1 AND business_id = $2::uuid
       ORDER BY created_at DESC`,
      [envId, businessId]
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/budget/uw_versions] DB error", err);
    return Response.json([]);
  }
}
