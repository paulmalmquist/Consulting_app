import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "DELETE, OPTIONS" } });
}

/**
 * DELETE /api/re/v2/dashboards/[dashboardId]?env_id=...&business_id=...
 * Delete a saved dashboard by ID.
 * Requires env_id and business_id in query params to verify ownership.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { dashboardId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const businessId = searchParams.get("business_id");
  const dashboardId = params.dashboardId;

  if (!dashboardId || !envId || !businessId) {
    return Response.json(
      { error: "dashboardId, env_id, and business_id required" },
      { status: 400 }
    );
  }

  try {
    // Verify ownership: dashboard belongs to env_id and business_id
    const verifyRes = await pool.query(
      `SELECT id FROM re_dashboard WHERE id = $1 AND env_id = $2 AND business_id = $3::uuid`,
      [dashboardId, envId, businessId]
    );

    if (verifyRes.rows.length === 0) {
      return Response.json(
        { error: "Dashboard not found or does not belong to this environment" },
        { status: 404 }
      );
    }

    // Delete the dashboard (cascade deletes favorites, subscriptions, exports)
    await pool.query(`DELETE FROM re_dashboard WHERE id = $1`, [dashboardId]);

    return Response.json({ success: true, id: dashboardId }, { status: 200 });
  } catch (err) {
    console.error("[dashboards] Delete error:", err);
    return Response.json({ error: "Failed to delete dashboard" }, { status: 500 });
  }
}
