import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/approvals?env_id=X&business_id=Y&status=S&entity_type=T
 *
 * Returns approval gate items joined with workflow observation context.
 */
export async function GET(request: Request) {
  const pool = getPool();
  const empty = { approvals: [] as Record<string, unknown>[] };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const status = searchParams.get("status");
  const entityType = searchParams.get("entity_type");

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(empty);

    const params: (string | null)[] = [businessId];
    let idx = 2;
    let filters = "";

    if (status) {
      filters += ` AND cfi.status = $${idx}`;
      params.push(status);
      idx++;
    }

    if (entityType) {
      filters += ` AND wo.entity_type = $${idx}`;
      params.push(entityType);
      idx++;
    }

    const res = await pool.query(
      `SELECT
         cfi.id::text,
         cfi.step_label,
         cfi.actor,
         cfi.status,
         cfi.notes,
         cfi.due_date::text,
         cfi.created_at::text,
         cfi.updated_at::text,
         wo.workflow_name,
         wo.entity_type,
         wo.entity_id::text,
         wo.transition_label,
         wo.outcome
       FROM epi_case_feed_item cfi
       JOIN epi_workflow_observation wo ON wo.id = cfi.workflow_observation_id
       WHERE wo.business_id = $1::uuid${filters}
       ORDER BY cfi.created_at DESC
       LIMIT 200`,
      params
    );

    return Response.json({ approvals: res.rows });
  } catch (err) {
    console.error("[re/v2/approvals] DB error", err);
    return Response.json(empty);
  }
}
