import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

/**
 * POST /api/re/v2/models/[modelId]/clone
 * Clone a model with all its scope and override settings
 */
export async function POST(
  _request: Request,
  { params }: { params: { modelId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get the source model
    const sourceRes = await client.query(
      `SELECT id, fund_id, name, description, status, strategy_type, created_by, created_at
       FROM re_model
       WHERE id = $1::uuid
       LIMIT 1`,
      [params.modelId]
    );

    if (sourceRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return Response.json({ error: "Model not found" }, { status: 404 });
    }

    const source = sourceRes.rows[0] as {
      id: string;
      fund_id: string;
      name: string;
      description: string | null;
      status: string;
      strategy_type: string | null;
      created_by: string | null;
      created_at: string;
    };

    // Create cloned model
    const clonedName = `${source.name} (Copy)`;
    const clonedRes = await client.query(
      `INSERT INTO re_model (fund_id, name, description, status, strategy_type, created_by)
       VALUES ($1::uuid, $2, $3, $4, $5, $6)
       RETURNING id::text, fund_id::text, name, description, status, strategy_type, created_by, created_at::text`,
      [source.fund_id, clonedName, source.description, "draft", source.strategy_type, source.created_by]
    );

    const clonedModel = clonedRes.rows[0];
    const clonedModelId = clonedModel.id;

    // Copy scope entries
    await client.query(
      `INSERT INTO re_model_scope (model_id, scope_type, scope_node_id, include)
       SELECT $1::uuid, scope_type, scope_node_id, include
       FROM re_model_scope
       WHERE model_id = $2::uuid`,
      [clonedModelId, params.modelId]
    );

    // Copy overrides
    await client.query(
      `INSERT INTO re_model_override (model_id, scope_node_type, scope_node_id, key, value_type, value_decimal, value_int, value_text, reason, is_active)
       SELECT $1::uuid, scope_node_type, scope_node_id, key, value_type, value_decimal, value_int, value_text, reason, is_active
       FROM re_model_override
       WHERE model_id = $2::uuid`,
      [clonedModelId, params.modelId]
    );

    await client.query("COMMIT");

    return Response.json(
      {
        model_id: clonedModelId,
        fund_id: clonedModel.fund_id,
        name: clonedModel.name,
        description: clonedModel.description,
        status: clonedModel.status,
        strategy_type: clonedModel.strategy_type,
        created_by: clonedModel.created_by,
        created_at: clonedModel.created_at,
      },
      { status: 201 }
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[re/v2/models/[modelId]/clone POST] Error:", err);
    return Response.json({ error: "Failed to clone model" }, { status: 500 });
  } finally {
    client.release();
  }
}
