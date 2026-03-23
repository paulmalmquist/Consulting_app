import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, POST, DELETE, OPTIONS" } });
}

/**
 * GET /api/re/v2/models/[modelId]/scope
 * List all entities in scope for a model.
 */
export async function GET(
  _request: Request,
  { params }: { params: { modelId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  try {
    const res = await pool.query(
      `SELECT id::text, model_id::text, scope_type, scope_node_id::text, include, created_at::text
       FROM re_model_scope
       WHERE model_id = $1::uuid
       ORDER BY created_at`,
      [params.modelId]
    );
    return Response.json(res.rows);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[re/v2/models/[modelId]/scope GET] DB error", { error: errorMessage, code: (err as any)?.code });
    return Response.json({ error: errorMessage || "Failed to load scope" }, { status: 500 });
  }
}

/**
 * POST /api/re/v2/models/[modelId]/scope
 * Add an entity to model scope.
 */
export async function POST(
  request: Request,
  { params }: { params: { modelId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  try {
    const body = await request.json();
    const { scope_type, scope_node_id, include = true } = body as {
      scope_type: string;
      scope_node_id: string;
      include?: boolean;
    };

    if (!scope_type || !scope_node_id) {
      return Response.json({ error: "scope_type and scope_node_id required" }, { status: 400 });
    }

    const res = await pool.query(
      `INSERT INTO re_model_scope (model_id, scope_type, scope_node_id, include)
       VALUES ($1::uuid, $2, $3::uuid, $4)
       ON CONFLICT (model_id, scope_type, scope_node_id) DO UPDATE SET include = EXCLUDED.include
       RETURNING id::text, model_id::text, scope_type, scope_node_id::text, include, created_at::text`,
      [params.modelId, scope_type, scope_node_id, include]
    );
    return Response.json(res.rows[0], { status: 201 });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[re/v2/models/[modelId]/scope POST] DB error", { error: errorMessage, code: (err as any)?.code });
    return Response.json({ error: errorMessage || "Failed to update scope" }, { status: 500 });
  }
}

/**
 * DELETE /api/re/v2/models/[modelId]/scope/[entityId]
 * Remove an entity from model scope.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { modelId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  try {
    // Extract entityId from URL path
    const url = new URL(_request.url);
    const pathParts = url.pathname.split("/");
    const entityId = pathParts[pathParts.length - 1];

    if (!entityId) {
      return Response.json({ error: "Entity ID required" }, { status: 400 });
    }

    const res = await pool.query(
      `DELETE FROM re_model_scope
       WHERE model_id = $1::uuid AND scope_node_id = $2::uuid
       RETURNING id::text`,
      [params.modelId, entityId]
    );

    if (res.rowCount === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[re/v2/models/[modelId]/scope DELETE] DB error", { error: errorMessage, code: (err as any)?.code });
    return Response.json({ error: errorMessage || "Failed to remove from scope" }, { status: 500 });
  }
}
