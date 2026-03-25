import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, POST, DELETE, OPTIONS" } });
}

/**
 * GET /api/re/v2/assets/[assetId]/valuation/overrides?scenario_id=...
 *
 * List assumption overrides for this asset under a scenario.
 */
export async function GET(
  request: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "DB_UNAVAILABLE", message: "Database not available" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenario_id");
  if (!scenarioId) {
    return Response.json({ error_code: "MISSING_PARAM", message: "scenario_id is required" }, { status: 400 });
  }

  try {
    const res = await pool.query(
      `SELECT
         o.id::text, o.assumption_set_id::text, o.scope_node_type, o.scope_node_id::text,
         o.field_name, o.override_value, o.notes, o.created_at::text
       FROM re_assumption_override o
       JOIN re_assumption_set aset ON aset.id = o.assumption_set_id
       WHERE aset.scenario_id = $1::uuid
         AND o.scope_node_type = 'asset'
         AND o.scope_node_id = $2::uuid
       ORDER BY o.field_name`,
      [scenarioId, params.assetId]
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/assets/valuation/overrides] GET error", err);
    return Response.json({ error_code: "DB_ERROR", message: String(err) }, { status: 500 });
  }
}

/**
 * POST /api/re/v2/assets/[assetId]/valuation/overrides
 *
 * Upsert an override for this asset. Body: { scenario_id, field_name, override_value, notes? }
 */
export async function POST(
  request: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "DB_UNAVAILABLE", message: "Database not available" }, { status: 503 });
  }

  let body: { scenario_id: string; field_name: string; override_value: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error_code: "INVALID_JSON", message: "Invalid JSON" }, { status: 400 });
  }

  if (!body.scenario_id || !body.field_name || body.override_value == null) {
    return Response.json({ error_code: "MISSING_FIELDS", message: "scenario_id, field_name, override_value required" }, { status: 400 });
  }

  try {
    // Get or create assumption set for this scenario
    let asetRes = await pool.query(
      `SELECT id::text FROM re_assumption_set WHERE scenario_id = $1::uuid LIMIT 1`,
      [body.scenario_id]
    );

    let assumptionSetId: string;
    if (asetRes.rows.length === 0) {
      const createRes = await pool.query(
        `INSERT INTO re_assumption_set (scenario_id, name, is_active)
         VALUES ($1::uuid, 'Auto-created', true)
         RETURNING id::text`,
        [body.scenario_id]
      );
      assumptionSetId = createRes.rows[0].id;
    } else {
      assumptionSetId = asetRes.rows[0].id;
    }

    // Upsert the override
    const res = await pool.query(
      `INSERT INTO re_assumption_override (
         assumption_set_id, scope_node_type, scope_node_id, field_name, override_value, notes
       ) VALUES ($1::uuid, 'asset', $2::uuid, $3, $4, $5)
       ON CONFLICT (assumption_set_id, scope_node_type, scope_node_id, field_name)
       DO UPDATE SET override_value = EXCLUDED.override_value, notes = EXCLUDED.notes
       RETURNING id::text, field_name, override_value, notes, created_at::text`,
      [assumptionSetId, params.assetId, body.field_name, body.override_value, body.notes ?? null]
    );

    return Response.json(res.rows[0]);
  } catch (err) {
    console.error("[re/v2/assets/valuation/overrides] POST error", err);
    return Response.json({ error_code: "DB_ERROR", message: String(err) }, { status: 500 });
  }
}

/**
 * DELETE /api/re/v2/assets/[assetId]/valuation/overrides
 *
 * Delete an override. Body: { scenario_id, field_name }
 */
export async function DELETE(
  request: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "DB_UNAVAILABLE", message: "Database not available" }, { status: 503 });
  }

  let body: { scenario_id: string; field_name: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error_code: "INVALID_JSON", message: "Invalid JSON" }, { status: 400 });
  }

  try {
    await pool.query(
      `DELETE FROM re_assumption_override o
       USING re_assumption_set aset
       WHERE o.assumption_set_id = aset.id
         AND aset.scenario_id = $1::uuid
         AND o.scope_node_type = 'asset'
         AND o.scope_node_id = $2::uuid
         AND o.field_name = $3`,
      [body.scenario_id, params.assetId, body.field_name]
    );
    return Response.json({ deleted: true });
  } catch (err) {
    console.error("[re/v2/assets/valuation/overrides] DELETE error", err);
    return Response.json({ error_code: "DB_ERROR", message: String(err) }, { status: 500 });
  }
}
