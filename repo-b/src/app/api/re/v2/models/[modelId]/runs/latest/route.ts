import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { modelId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "No database" }, { status: 500 });

  try {
    // Get the most recent run for this model
    const runRes = await pool.query(
      `SELECT id, model_id, status, started_at, completed_at, error_message, result_summary
       FROM re_model_run
       WHERE model_id = $1::uuid
       ORDER BY created_at DESC
       LIMIT 1`,
      [params.modelId],
    );

    if (runRes.rows.length === 0) {
      return Response.json({ error: "No runs found" }, { status: 404 });
    }

    const run = runRes.rows[0];

    // Get result rows if any
    const resultRes = await pool.query(
      `SELECT fund_id, metric,
              COALESCE(base_value, 0)::float8 AS base_value,
              COALESCE(model_value, 0)::float8 AS model_value,
              COALESCE(variance, 0)::float8 AS variance
       FROM re_model_run_result
       WHERE run_id = $1::uuid`,
      [run.id],
    );

    return Response.json({
      id: run.id,
      status: run.status,
      started_at: run.started_at,
      completed_at: run.completed_at,
      error_message: run.error_message,
      result_summary: run.result_summary,
      results: resultRes.rows,
    });
  } catch (err) {
    console.error("[runs/latest GET]", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
