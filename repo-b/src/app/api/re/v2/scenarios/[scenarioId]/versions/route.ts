import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/scenarios/[scenarioId]/versions
 * List all versions for a scenario.
 */
export async function GET(
  _request: Request,
  { params }: { params: { scenarioId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  try {
    const res = await pool.query(
      `SELECT version_id::text, scenario_id::text, model_id::text,
              version_number::int, label, assumption_set_id::text,
              is_locked, locked_at::text, locked_by, notes, created_at::text
       FROM re_scenario_version
       WHERE scenario_id = $1::uuid
       ORDER BY version_number DESC`,
      [params.scenarioId]
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/scenarios/[scenarioId]/versions] DB error", err);
    return Response.json([], { status: 200 });
  }
}
