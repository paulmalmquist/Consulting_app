import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, PATCH, OPTIONS" } });
}

/**
 * GET /api/re/v2/models/[modelId]
 * Get a single model by ID.
 */
export async function GET(
  _request: Request,
  { params }: { params: { modelId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  try {
    const res = await pool.query(
      `SELECT model_id::text, fund_id::text, name, description, status,
              created_by, approved_at::text, approved_by, created_at::text
       FROM re_model
       WHERE model_id = $1::uuid`,
      [params.modelId]
    );
    if (res.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(res.rows[0]);
  } catch (err) {
    console.error("[re/v2/models/[modelId]] DB error", err);
    return Response.json({ error: (err instanceof Error ? err.message : String(err)) || "Unknown error" }, { status: 500 });
  }
}

/**
 * PATCH /api/re/v2/models/[modelId]
 * Update model status (draft → approved | archived).
 */
export async function PATCH(
  request: Request,
  { params }: { params: { modelId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  try {
    const body = await request.json();
    const { status } = body as { status?: string };
    if (!status) return Response.json({ error: "status required" }, { status: 400 });

    const res = await pool.query(
      `UPDATE re_model
       SET status = $2,
           approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE approved_at END
       WHERE model_id = $1::uuid
       RETURNING model_id::text, fund_id::text, name, description, status,
                 created_by, approved_at::text, approved_by, created_at::text`,
      [params.modelId, status]
    );
    if (res.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(res.rows[0]);
  } catch (err) {
    console.error("[re/v2/models/[modelId] PATCH] DB error", err);
    return Response.json({ error: (err instanceof Error ? err.message : String(err)) || "Unknown error" }, { status: 500 });
  }
}
