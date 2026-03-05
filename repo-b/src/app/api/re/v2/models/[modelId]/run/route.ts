import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}Q${q}`;
}

function getBackendOrigin(): string | null {
  const candidates = [
    process.env.BOS_API_ORIGIN,
    process.env.BOS_API_URL,
    process.env.BUSINESS_OS_API_URL,
    process.env.NEXT_PUBLIC_BOS_API_BASE_URL,
    process.env.NEXT_PUBLIC_API_BASE_URL,
  ];

  for (const raw of candidates) {
    const value = (raw || "").trim();
    if (!value) continue;
    try {
      return new URL(value).origin;
    } catch {
      continue;
    }
  }

  return null;
}

async function extractErrorMessage(response: Response): Promise<string> {
  const fallback = `Backend run trigger failed with status ${response.status}`;
  const responseClone = response.clone();

  try {
    const data = await response.json();
    if (typeof data?.detail === "string" && data.detail) return data.detail;
    if (typeof data?.message === "string" && data.message) return data.message;
    if (typeof data?.error === "string" && data.error) return data.error;
    if (typeof data?.detail?.message === "string" && data.detail.message) return data.detail.message;
  } catch {
    try {
      const text = await responseClone.text();
      if (text) return text;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

/**
 * POST /api/re/v2/models/[modelId]/run
 * Run a model to generate fund impact results.
 * Validates that the model has entities in scope before running.
 */
export async function POST(
  request: Request,
  { params }: { params: { modelId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No pool" }, { status: 500 });

  try {
    const body = (await request.json().catch(() => ({}))) as {
      quarter?: string;
      run_waterfall?: boolean;
    };
    const quarter = body.quarter || getCurrentQuarter();
    const runWaterfall = body.run_waterfall === true;
    const backendOrigin = getBackendOrigin();

    if (!backendOrigin) {
      return Response.json({ error: "No backend origin configured" }, { status: 503 });
    }

    // Validate model exists
    const modelRes = await pool.query(
      `SELECT model_id FROM re_model WHERE model_id = $1::uuid LIMIT 1`,
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

    // Create the externally visible run record first so the UI can poll immediately.
    const runRes = await pool.query(
      `INSERT INTO re_model_run (id, model_id, status, started_at, triggered_by)
       VALUES (gen_random_uuid(), $1::uuid, 'in_progress', now(), 'api')
       RETURNING id::text, model_id::text, status, started_at::text`,
      [params.modelId]
    );

    if (runRes.rows.length === 0) {
      return Response.json({ error: "Failed to create model run" }, { status: 500 });
    }

    const modelRunId = runRes.rows[0].id as string;
    const backendUrl = new URL(`/api/re/v2/models/${params.modelId}/run`, backendOrigin);

    const markRunFailed = async (errorMessage: string) => {
      await pool.query(
        `UPDATE re_model_run
         SET status = 'failed', completed_at = now(), error_message = $2
         WHERE id = $1::uuid AND status = 'in_progress'`,
        [modelRunId, errorMessage]
      );
    };

    void fetch(backendUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quarter,
        run_id: modelRunId,
        run_waterfall: runWaterfall,
      }),
    })
      .then(async (response) => {
        if (response.ok) return;

        const errorMessage = await extractErrorMessage(response);
        console.error("[model run] Backend kick-off failed:", {
          modelId: params.modelId,
          runId: modelRunId,
          status: response.status,
          error: errorMessage,
        });

        try {
          await markRunFailed(errorMessage);
        } catch (updateErr) {
          console.error("[model run] Failed to mark run as failed:", updateErr);
        }
      })
      .catch(async (err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("[model run] Backend kick-off failed:", {
          modelId: params.modelId,
          runId: modelRunId,
          error: errorMessage,
        });

        try {
          await markRunFailed(errorMessage);
        } catch (updateErr) {
          console.error("[model run] Failed to mark run as failed:", updateErr);
        }
      });

    return Response.json(
      {
        run_id: modelRunId,
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
