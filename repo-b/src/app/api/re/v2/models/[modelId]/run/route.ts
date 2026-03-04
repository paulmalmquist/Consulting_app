import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

/**
 * POST /api/re/v2/models/[modelId]/run
 * Run a model to generate fund impact results.
 * Validates that the model has entities in scope before running.
 */
export async function POST(
  _request: Request,
  { params }: { params: { modelId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  try {
    // Validate model exists
    const modelRes = await pool.query(
      `SELECT id FROM re_model WHERE id = $1::uuid LIMIT 1`,
      [params.modelId]
    );

    if (modelRes.rows.length === 0) {
      return Response.json({ error: "Model not found" }, { status: 404 });
    }

    // Check that model has entities in scope
    const scopeRes = await pool.query(
      `SELECT COUNT(*) as count FROM re_model_scope WHERE model_id = $1::uuid AND include = true`,
      [params.modelId]
    );

    const scopeCount = parseInt(scopeRes.rows[0]?.count || "0", 10);
    if (scopeCount === 0) {
      return Response.json(
        { error: "Model has no entities in scope. Add assets before running." },
        { status: 400 }
      );
    }

    // For now, create a placeholder run record.
    // In production, this would queue a background job or invoke external modeling engine.
    const runRes = await pool.query(
      `INSERT INTO re_model_run (id, model_id, status, started_at, triggered_by)
       VALUES (gen_random_uuid(), $1::uuid, 'in_progress', now(), 'api')
       RETURNING id::text, model_id::text, status, started_at::text`,
      [params.modelId]
    );

    if (runRes.rows.length === 0) {
      return Response.json({ error: "Failed to create model run" }, { status: 500 });
    }

    return Response.json(
      {
        run_id: runRes.rows[0].id,
        model_id: runRes.rows[0].model_id,
        status: runRes.rows[0].status,
        started_at: runRes.rows[0].started_at,
        message: "Model run started successfully",
      },
      { status: 202 }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[re/v2/models/[modelId]/run POST] Error:", { error: errorMessage });
    return Response.json(
      { error: errorMessage || "Failed to run model" },
      { status: 500 }
    );
  }
}
