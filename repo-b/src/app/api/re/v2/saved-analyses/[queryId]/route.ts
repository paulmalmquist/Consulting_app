import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, DELETE, OPTIONS" } });
}

/**
 * GET /api/re/v2/saved-analyses/[queryId]?env_id=X&business_id=Y
 *
 * Returns analysis detail with last run statistics.
 */
export async function GET(
  request: Request,
  { params }: { params: { queryId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const businessId = searchParams.get("business_id");
  const queryId = params.queryId;

  if (!queryId || !envId || !businessId) {
    return Response.json(
      { error: "queryId, env_id, and business_id are required" },
      { status: 400 }
    );
  }

  try {
    const res = await pool.query(
      `SELECT
         aq.id::text,
         aq.env_id,
         aq.business_id::text,
         aq.title,
         aq.description,
         aq.sql_text,
         aq.nl_prompt,
         aq.visualization_spec,
         aq.created_by,
         aq.created_at::text,
         aq.updated_at::text
       FROM analytics_query aq
       WHERE aq.id = $1::uuid
         AND aq.env_id = $2
         AND aq.business_id = $3::uuid`,
      [queryId, envId, businessId]
    );

    if (res.rows.length === 0) {
      return Response.json({ error: "Analysis not found" }, { status: 404 });
    }

    const analysis = res.rows[0];

    // Fetch last run info
    let lastRun = null;
    try {
      const runRes = await pool.query(
        `SELECT
           id::text,
           row_count,
           elapsed_ms,
           cost_estimate::text,
           created_at::text
         FROM analytics_query_run
         WHERE query_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT 1`,
        [queryId]
      );
      if (runRes.rows.length > 0) {
        lastRun = runRes.rows[0];
      }
    } catch {
      // analytics_query_run table may not have data
    }

    return Response.json({ ...analysis, last_run: lastRun });
  } catch (err) {
    console.error("[re/v2/saved-analyses/[queryId]] DB error", err);
    return Response.json(
      { error: (err instanceof Error ? err.message : String(err)) || "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/re/v2/saved-analyses/[queryId]?env_id=X&business_id=Y
 *
 * Remove a saved analysis.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { queryId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const businessId = searchParams.get("business_id");
  const queryId = params.queryId;

  if (!queryId || !envId || !businessId) {
    return Response.json(
      { error: "queryId, env_id, and business_id are required" },
      { status: 400 }
    );
  }

  try {
    // Verify ownership
    const verifyRes = await pool.query(
      `SELECT id FROM analytics_query
       WHERE id = $1::uuid AND env_id = $2 AND business_id = $3::uuid`,
      [queryId, envId, businessId]
    );

    if (verifyRes.rows.length === 0) {
      return Response.json({ error: "Analysis not found" }, { status: 404 });
    }

    // Remove collection memberships first
    await pool.query(
      `DELETE FROM analytics_collection_membership WHERE query_id = $1::uuid`,
      [queryId]
    );

    // Remove query runs
    try {
      await pool.query(
        `DELETE FROM analytics_query_run WHERE query_id = $1::uuid`,
        [queryId]
      );
    } catch {
      // Table may not exist or have data
    }

    // Remove cache entries
    try {
      await pool.query(
        `DELETE FROM analytics_query_cache WHERE query_id = $1::uuid`,
        [queryId]
      );
    } catch {
      // Table may not exist or have data
    }

    // Delete the query
    await pool.query(
      `DELETE FROM analytics_query WHERE id = $1::uuid`,
      [queryId]
    );

    return Response.json({ success: true, id: queryId });
  } catch (err) {
    console.error("[re/v2/saved-analyses/[queryId] DELETE] DB error", err);
    return Response.json(
      { error: (err instanceof Error ? err.message : String(err)) || "Failed to delete analysis" },
      { status: 500 }
    );
  }
}
