import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, POST, DELETE, OPTIONS" } });
}

/**
 * GET /api/re/v2/dashboards?env_id=...&business_id=...
 * List saved dashboards for the environment.
 */
export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const businessId = searchParams.get("business_id");

  if (!envId || !businessId) {
    return Response.json({ error: "env_id and business_id required" }, { status: 400 });
  }

  try {
    const res = await pool.query(
      `SELECT id, name, description, layout_archetype, prompt_text, entity_scope,
              quarter, created_by, created_at, updated_at
       FROM re_dashboard
       WHERE env_id = $1 AND business_id = $2::uuid
       ORDER BY updated_at DESC`,
      [envId, businessId],
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[dashboards] List error:", err);
    return Response.json({ error: "Failed to list dashboards" }, { status: 500 });
  }
}

/**
 * POST /api/re/v2/dashboards
 * Save a new dashboard.
 */
export async function POST(request: Request) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const body = await request.json();
    const { env_id, business_id, name, description, layout_archetype, spec, prompt_text, entity_scope, quarter } = body;

    if (!env_id || !business_id || !name || !spec) {
      return Response.json({ error: "env_id, business_id, name, and spec are required" }, { status: 400 });
    }

    const res = await pool.query(
      `INSERT INTO re_dashboard
         (env_id, business_id, name, description, layout_archetype, spec, prompt_text, entity_scope, quarter)
       VALUES ($1, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9)
       RETURNING id, name, created_at`,
      [
        env_id, business_id, name, description || null,
        layout_archetype || "custom",
        JSON.stringify(spec),
        prompt_text || null,
        JSON.stringify(entity_scope || {}),
        quarter || null,
      ],
    );

    return Response.json(res.rows[0], { status: 201 });
  } catch (err) {
    console.error("[dashboards] Save error:", err);
    return Response.json({ error: "Failed to save dashboard" }, { status: 500 });
  }
}

/**
 * DELETE /api/re/v2/dashboards/[dashboardId]
 * Delete a saved dashboard by ID.
 * Cascading deletes handle related records (favorites, subscriptions, exports).
 */
export async function DELETE(request: Request) {
  const pool = getPool();
  if (!pool) {
    return Response.json(
      { error: "Database unavailable" },
      { status: 503 }
    );
  }

  try {
    // Parse the dashboard ID from the URL path
    // URL format: /api/re/v2/dashboards/[dashboardId]
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const dashboardId = pathParts[pathParts.length - 1];

    if (!dashboardId || dashboardId === "dashboards") {
      return Response.json({ error: "Dashboard ID is required" }, { status: 400 });
    }

    // Check if dashboard exists
    const existsRes = await pool.query(
      `SELECT id, name FROM re_dashboard WHERE id = $1::uuid LIMIT 1`,
      [dashboardId]
    );

    if (!existsRes.rows[0]) {
      return Response.json(
        { error: "Dashboard not found", dashboard_id: dashboardId },
        { status: 404 }
      );
    }

    const dashboard = existsRes.rows[0];

    // Delete the dashboard. ON DELETE CASCADE will handle:
    // - re_dashboard_favorite (references re_dashboard.id)
    // - re_dashboard_subscription (references re_dashboard.id)
    // - re_dashboard_export (references re_dashboard.id)
    const deleteRes = await pool.query(
      `DELETE FROM re_dashboard WHERE id = $1::uuid`,
      [dashboardId]
    );

    return Response.json({
      success: true,
      message: `Dashboard "${dashboard.name}" deleted successfully`,
      dashboard_id: dashboardId,
      deleted_count: deleteRes.rowCount ?? 0,
    });
  } catch (err) {
    console.error("[dashboards] Delete error:", err);
    return Response.json(
      { error: "Failed to delete dashboard" },
      { status: 500 }
    );
  }
}
