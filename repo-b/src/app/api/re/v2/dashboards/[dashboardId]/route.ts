import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

type DashboardRouteContext = {
  params: { dashboardId: string };
};

type DashboardWriteBody = {
  env_id?: string;
  business_id?: string;
  name?: string;
  description?: string | null;
  layout_archetype?: string;
  spec?: unknown;
  prompt_text?: string | null;
  entity_scope?: Record<string, unknown>;
  quarter?: string | null;
  spec_file?: string | null;
  density?: "comfortable" | "compact" | "auto";
};

const VALID_DENSITIES = new Set(["comfortable", "compact", "auto"]);

function normalizeSpec(
  spec: unknown,
  density?: DashboardWriteBody["density"],
) {
  const baseSpec: Record<string, unknown> = spec && typeof spec === "object" && !Array.isArray(spec)
    ? { ...(spec as Record<string, unknown>) }
    : { widgets: [] };

  const rawDensity = baseSpec["density"];
  const specDensity = typeof rawDensity === "string" && VALID_DENSITIES.has(rawDensity)
    ? rawDensity
    : undefined;
  const resolvedDensity = density && VALID_DENSITIES.has(density)
    ? density
    : specDensity || "comfortable";

  return {
    density: resolvedDensity,
    spec: {
      ...baseSpec,
      density: resolvedDensity,
    },
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, PATCH, DELETE, OPTIONS" } });
}

/**
 * GET /api/re/v2/dashboards/[dashboardId]?env_id=...&business_id=...
 * Fetch a single dashboard by ID.
 */
export async function GET(
  request: Request,
  { params }: DashboardRouteContext,
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const businessId = searchParams.get("business_id");
  const dashboardId = params.dashboardId;

  if (!dashboardId || !envId || !businessId) {
    return Response.json({ error: "dashboardId, env_id, and business_id required" }, { status: 400 });
  }

  try {
    const res = await pool.query(
      `SELECT id, env_id, business_id, name, description, layout_archetype, spec,
              prompt_text, entity_scope, quarter, spec_file, density, created_by, created_at, updated_at
       FROM re_dashboard
       WHERE id = $1 AND env_id = $2 AND business_id = $3::uuid`,
      [dashboardId, envId, businessId],
    );

    if (res.rows.length === 0) {
      return Response.json({ error: "Dashboard not found" }, { status: 404 });
    }

    return Response.json(res.rows[0]);
  } catch (err) {
    console.error("[dashboards] Get error:", err);
    return Response.json({ error: "Failed to fetch dashboard" }, { status: 500 });
  }
}

/**
 * PATCH /api/re/v2/dashboards/[dashboardId]?env_id=...&business_id=...
 * Update an existing saved dashboard.
 */
export async function PATCH(
  request: Request,
  { params }: DashboardRouteContext,
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const dashboardId = params.dashboardId;

  if (!dashboardId) {
    return Response.json({ error: "dashboardId is required" }, { status: 400 });
  }

  try {
    const body = await request.json() as DashboardWriteBody;
    const {
      env_id,
      business_id,
      name,
      description,
      layout_archetype,
      spec,
      prompt_text,
      entity_scope,
      quarter,
      spec_file,
      density,
    } = body;

    if (!env_id || !business_id || !name || !spec) {
      return Response.json(
        { error: "env_id, business_id, name, and spec are required" },
        { status: 400 },
      );
    }

    const normalized = normalizeSpec(spec, density);
    const res = await pool.query(
      `UPDATE re_dashboard
       SET name = $4,
           description = $5,
           layout_archetype = $6,
           spec = $7::jsonb,
           prompt_text = $8,
           entity_scope = $9::jsonb,
           quarter = $10,
           spec_file = $11,
           density = $12,
           updated_at = now()
       WHERE id = $1 AND env_id = $2 AND business_id = $3::uuid
       RETURNING id, env_id, business_id, name, description, layout_archetype, spec,
                 prompt_text, entity_scope, quarter, spec_file, density, created_by, created_at, updated_at`,
      [
        dashboardId,
        env_id,
        business_id,
        name,
        description || null,
        layout_archetype || "custom",
        JSON.stringify(normalized.spec),
        prompt_text || null,
        JSON.stringify(entity_scope || {}),
        quarter || null,
        spec_file || null,
        normalized.density,
      ],
    );

    if (res.rows.length === 0) {
      return Response.json({ error: "Dashboard not found" }, { status: 404 });
    }

    return Response.json(res.rows[0]);
  } catch (err) {
    console.error("[dashboards] Update error:", err);
    return Response.json({ error: "Failed to update dashboard" }, { status: 500 });
  }
}

/**
 * DELETE /api/re/v2/dashboards/[dashboardId]?env_id=...&business_id=...
 * Delete a saved dashboard by ID.
 * Requires env_id and business_id in query params to verify ownership.
 */
export async function DELETE(
  request: Request,
  { params }: DashboardRouteContext,
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
