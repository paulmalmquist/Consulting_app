import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, POST, OPTIONS" } });
}

/**
 * GET /api/re/v2/models/[modelId]/overrides
 * List all assumption overrides for a model.
 */
export async function GET(
  _request: Request,
  { params }: { params: { modelId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  try {
    const res = await pool.query(
      `SELECT id::text, model_id::text, scope_node_type, scope_node_id::text,
              key, value_type,
              value_decimal::float8, value_int, value_text,
              reason, is_active, created_at::text
       FROM re_model_override
       WHERE model_id = $1::uuid AND is_active = true
       ORDER BY created_at`,
      [params.modelId]
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/models/[modelId]/overrides GET] DB error", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/re/v2/models/[modelId]/overrides
 * Set an assumption override for a model.
 */
export async function POST(
  request: Request,
  { params }: { params: { modelId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  try {
    const body = await request.json();
    const {
      scope_node_type,
      scope_node_id,
      key,
      value_type = "decimal",
      value_decimal,
      value_int,
      value_text,
      reason,
    } = body as {
      scope_node_type: string;
      scope_node_id: string;
      key: string;
      value_type?: string;
      value_decimal?: number;
      value_int?: number;
      value_text?: string;
      reason?: string;
    };

    if (!scope_node_type || !scope_node_id || !key) {
      return Response.json({ error: "scope_node_type, scope_node_id, and key required" }, { status: 400 });
    }

    const res = await pool.query(
      `INSERT INTO re_model_override
         (model_id, scope_node_type, scope_node_id, key, value_type, value_decimal, value_int, value_text, reason)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (model_id, scope_node_type, scope_node_id, key) DO UPDATE
         SET value_type = EXCLUDED.value_type,
             value_decimal = EXCLUDED.value_decimal,
             value_int = EXCLUDED.value_int,
             value_text = EXCLUDED.value_text,
             reason = EXCLUDED.reason,
             is_active = true
       RETURNING id::text, model_id::text, scope_node_type, scope_node_id::text,
                 key, value_type, value_decimal::float8, value_int, value_text,
                 reason, is_active, created_at::text`,
      [params.modelId, scope_node_type, scope_node_id, key, value_type,
       value_decimal ?? null, value_int ?? null, value_text ?? null, reason ?? null]
    );
    return Response.json(res.rows[0], { status: 201 });
  } catch (err) {
    console.error("[re/v2/models/[modelId]/overrides POST] DB error", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
