import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, POST, OPTIONS" } });
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

/**
 * POST /api/re/v2/funds/[fundId]/models
 * Create a new model for a fund.
 */
export async function POST(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  try {
    const body = await request.json();
    const { name, description, strategy_type } = body;

    if (!name?.trim()) {
      return Response.json({ error: "name required" }, { status: 400 });
    }

    const res = await pool.query(
      `INSERT INTO re_model (fund_id, name, description, strategy_type, status)
       VALUES ($1::uuid, $2, $3, $4, 'draft')
       RETURNING model_id::text, fund_id::text, name, description, status, strategy_type, created_by, created_at::text`,
      [params.fundId, name.trim(), description?.trim() || null, strategy_type || null]
    );

    return Response.json(res.rows[0], { status: 201 });
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/models POST]", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
