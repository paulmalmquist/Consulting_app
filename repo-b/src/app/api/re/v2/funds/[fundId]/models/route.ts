import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/models
 * List all models for a fund.
 */
export async function GET(
  _request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  try {
    const res = await pool.query(
      `SELECT model_id::text, fund_id::text, name, description, status,
              created_by, approved_at::text, approved_by, created_at::text
       FROM re_model
       WHERE fund_id = $1::uuid
       ORDER BY created_at DESC`,
      [params.fundId]
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/models] DB error", err);
    return Response.json([], { status: 200 });
  }
}
