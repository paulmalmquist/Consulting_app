import { NextRequest } from "next/server";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /bos/api/consulting/loops/summary
 *
 * Returns aggregate summary: total_annual_cost, loop_count, avg_maturity_stage,
 * top_5_by_cost, status_counts.
 */
export async function GET(request: NextRequest) {
  const pool = getPool();
  if (!pool) {
    return Response.json(
      { error_code: "CONFIG_ERROR", message: "DATABASE_URL is not configured." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const envId = url.searchParams.get("env_id")?.trim() || "";
  const businessId = url.searchParams.get("business_id")?.trim() || "";

  if (!envId) {
    return Response.json({ error_code: "VALIDATION_ERROR", message: "env_id is required." }, { status: 400 });
  }
  if (!UUID_RE.test(businessId)) {
    return Response.json({ error_code: "VALIDATION_ERROR", message: "business_id must be a valid UUID." }, { status: 400 });
  }

  const clientId = url.searchParams.get("client_id")?.trim() || null;
  const status = url.searchParams.get("status")?.trim() || null;
  const domain = url.searchParams.get("domain")?.trim() || null;

  try {
    const params: Array<string | number> = [envId, businessId];
    let where = `WHERE l.env_id = $1 AND l.business_id = $2::uuid`;
    let paramIdx = 2;

    if (clientId && UUID_RE.test(clientId)) {
      paramIdx++;
      params.push(clientId);
      where += ` AND l.client_id = $${paramIdx}::uuid`;
    }
    if (status) {
      paramIdx++;
      params.push(status);
      where += ` AND l.status = $${paramIdx}`;
    }
    if (domain) {
      paramIdx++;
      params.push(domain);
      where += ` AND l.process_domain ILIKE '%' || $${paramIdx} || '%'`;
    }

    // Aggregate summary
    const aggRes = await pool.query(
      `SELECT
         COUNT(DISTINCT l.id)::int AS loop_count,
         COALESCE(AVG(l.control_maturity_stage), 0)::float8 AS avg_maturity_stage,
         COALESCE(SUM(
           (SELECT COALESCE(SUM(r.loaded_hourly_rate * r.active_minutes / 60), 0) FROM nv_loop_role r WHERE r.loop_id = l.id)
           * l.frequency_per_year
         ), 0)::float8 AS total_annual_cost
       FROM nv_loop l
       ${where}`,
      params,
    );

    const agg = aggRes.rows[0] || { loop_count: 0, avg_maturity_stage: 0, total_annual_cost: 0 };

    // Top 5 by cost
    const topRes = await pool.query(
      `SELECT
         l.id::text,
         l.name,
         (COALESCE(SUM(r.loaded_hourly_rate * r.active_minutes / 60), 0) * l.frequency_per_year)::float8 AS annual_estimated_cost
       FROM nv_loop l
       LEFT JOIN nv_loop_role r ON r.loop_id = l.id
       ${where}
       GROUP BY l.id
       ORDER BY annual_estimated_cost DESC
       LIMIT 5`,
      params,
    );

    // Status counts
    const statusRes = await pool.query(
      `SELECT l.status, COUNT(*)::int AS count
       FROM nv_loop l
       ${where}
       GROUP BY l.status`,
      params,
    );

    const statusCounts: Record<string, number> = {};
    for (const row of statusRes.rows) {
      statusCounts[row.status] = row.count;
    }

    return Response.json({
      total_annual_cost: agg.total_annual_cost,
      loop_count: agg.loop_count,
      avg_maturity_stage: agg.avg_maturity_stage,
      top_5_by_cost: topRes.rows,
      status_counts: statusCounts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("does not exist") || message.includes("relation")) {
      return Response.json(
        { error_code: "SCHEMA_NOT_MIGRATED", message: "Loop Intelligence schema not migrated.", detail: "Run migration 302." },
        { status: 503 },
      );
    }
    console.error("[bos.consulting.loops.summary] GET failed", { envId, businessId, error: message });
    return Response.json({ error_code: "INTERNAL_ERROR", message: "Failed to load loop summary." }, { status: 500 });
  }
}
