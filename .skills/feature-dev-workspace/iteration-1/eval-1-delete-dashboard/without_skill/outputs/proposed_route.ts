import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "DELETE, OPTIONS" } });
}

/**
 * DELETE /api/re/v2/dashboards/[dashboardId]
 * Delete a saved dashboard by ID.
 *
 * The dashboard and all related records (favorites, subscriptions, exports)
 * are automatically cleaned up via PostgreSQL CASCADE constraints.
 *
 * Returns 204 No Content on success (idempotent).
 * Returns 404 if dashboard not found.
 * Returns 503 if database unavailable.
 * Returns 500 on other database errors.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { dashboardId: string } },
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  try {
    // First, verify the dashboard exists
    const checkRes = await pool.query(
      `SELECT id FROM re_dashboard WHERE id = $1::uuid`,
      [params.dashboardId],
    );

    if (checkRes.rows.length === 0) {
      return Response.json({ error: "Dashboard not found" }, { status: 404 });
    }

    // Delete the dashboard (cascade will handle related records)
    await pool.query(
      `DELETE FROM re_dashboard WHERE id = $1::uuid`,
      [params.dashboardId],
    );

    // Return 204 No Content (standard REST pattern for successful delete)
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("[dashboards/delete] Error:", err);
    return Response.json({ error: "Failed to delete dashboard" }, { status: 500 });
  }
}
