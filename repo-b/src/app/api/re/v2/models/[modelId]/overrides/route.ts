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
  request: Request,
  { params }: { params: { modelId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  try {
    const { searchParams } = new URL(request.url);
    const keyPrefix = searchParams.get("key_prefix");
    const scopeNodeId = searchParams.get("scope_node_id");

    const conditions = ["model_id = $1::uuid", "is_active = true"];
    const values: (string | number)[] = [params.modelId];
    let idx = 2;

    if (keyPrefix) {
      conditions.push(`key LIKE $${idx}`);
      values.push(`${keyPrefix}%`);
      idx++;
    }
    if (scopeNodeId) {
      conditions.push(`scope_node_id = $${idx}::uuid`);
      values.push(scopeNodeId);
      idx++;
    }

    const res = await pool.query(
      `SELECT id::text, model_id::text, scope_node_type, scope_node_id::text,
              key, value_type,
              value_decimal::float8, value_int, value_text,
              reason, is_active, created_at::text
       FROM re_model_override
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at`,
      values
    );
    return Response.json(res.rows);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[re/v2/models/[modelId]/overrides GET] DB error", { error: errorMessage, code: (err as any)?.code });
    return Response.json({ error: errorMessage || "Failed to load overrides" }, { status: 500 });
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
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[re/v2/models/[modelId]/overrides POST] DB error", { error: errorMessage, code: (err as any)?.code });

    // Map PostgreSQL error codes to user-friendly messages
    if ((err as any)?.code === '23503') {
      return Response.json({ error: "Invalid fund or entity reference" }, { status: 400 });
    }
    if ((err as any)?.code === '22P02') {
      return Response.json({ error: "Value must be a valid number (e.g., 0.065 for 6.5%)" }, { status: 400 });
    }

    return Response.json({ error: errorMessage || "Failed to save override" }, { status: 500 });
  }
}
