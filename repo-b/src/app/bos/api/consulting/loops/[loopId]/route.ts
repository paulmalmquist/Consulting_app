import { NextRequest } from "next/server";
import { getPool } from "@/lib/server/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function badRequest(message: string) {
  return Response.json({ error_code: "VALIDATION_ERROR", message }, { status: 400 });
}

/** Build a full LoopDetail from DB rows. */
async function buildLoopDetail(
  pool: NonNullable<ReturnType<typeof getPool>>,
  loopId: string,
  envId: string,
  businessId: string,
) {
  const loopRes = await pool.query(
    `SELECT
       l.id::text, l.env_id, l.business_id::text, l.client_id::text,
       l.name, l.process_domain, l.description,
       l.trigger_type, l.frequency_type, l.frequency_per_year::float8,
       l.status, l.control_maturity_stage::int, l.automation_readiness_score::int,
       l.avg_wait_time_minutes::float8, l.rework_rate_percent::float8,
       l.created_at::text, l.updated_at::text
     FROM nv_loop l
     WHERE l.id = $1::uuid AND l.env_id = $2 AND l.business_id = $3::uuid`,
    [loopId, envId, businessId],
  );

  if (loopRes.rows.length === 0) return null;
  const loop = loopRes.rows[0];

  const rolesRes = await pool.query(
    `SELECT id::text, loop_id::text, role_name, loaded_hourly_rate::float8,
            active_minutes::float8, notes, created_at::text, updated_at::text
     FROM nv_loop_role
     WHERE loop_id = $1::uuid
     ORDER BY created_at`,
    [loopId],
  );

  const interventionsRes = await pool.query(
    `SELECT id::text, loop_id::text, intervention_type, notes,
            before_snapshot, after_snapshot, observed_delta_percent::float8,
            created_at::text, updated_at::text
     FROM nv_loop_intervention
     WHERE loop_id = $1::uuid
     ORDER BY created_at DESC`,
    [loopId],
  );

  const roles = rolesRes.rows;
  const costPerRun = roles.reduce(
    (sum: number, r: Record<string, unknown>) =>
      sum + (Number(r.loaded_hourly_rate) * Number(r.active_minutes) / 60),
    0,
  );

  return {
    ...loop,
    role_count: roles.length,
    loop_cost_per_run: costPerRun,
    annual_estimated_cost: costPerRun * Number(loop.frequency_per_year),
    roles,
    interventions: interventionsRes.rows,
  };
}

/**
 * GET /bos/api/consulting/loops/[loopId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { loopId: string } },
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "CONFIG_ERROR", message: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const envId = url.searchParams.get("env_id")?.trim() || "";
  const businessId = url.searchParams.get("business_id")?.trim() || "";

  if (!envId) return badRequest("env_id is required.");
  if (!UUID_RE.test(businessId)) return badRequest("business_id must be a valid UUID.");

  try {
    const detail = await buildLoopDetail(pool, params.loopId, envId, businessId);
    if (!detail) {
      return Response.json({ error_code: "NOT_FOUND", message: "Loop not found." }, { status: 404 });
    }
    return Response.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[bos.consulting.loops.[loopId]] GET failed", { loopId: params.loopId, error: message });
    return Response.json({ error_code: "INTERNAL_ERROR", message: "Failed to load loop." }, { status: 500 });
  }
}

/**
 * PUT /bos/api/consulting/loops/[loopId]
 *
 * Replaces the loop and its roles. Returns the updated LoopDetail.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { loopId: string } },
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "CONFIG_ERROR", message: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const envId = url.searchParams.get("env_id")?.trim() || "";
  const businessId = url.searchParams.get("business_id")?.trim() || "";

  if (!envId) return badRequest("env_id is required.");
  if (!UUID_RE.test(businessId)) return badRequest("business_id must be a valid UUID.");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const processDomain = typeof body.process_domain === "string" ? body.process_domain.trim() : "";
  if (!name) return badRequest("name is required.");
  if (!processDomain) return badRequest("process_domain is required.");

  const clientId = typeof body.client_id === "string" && UUID_RE.test(body.client_id) ? body.client_id : null;
  const description = typeof body.description === "string" ? body.description : null;
  const triggerType = typeof body.trigger_type === "string" ? body.trigger_type : "manual";
  const frequencyType = typeof body.frequency_type === "string" ? body.frequency_type : "monthly";
  const frequencyPerYear = Number(body.frequency_per_year) || 0;
  const status = typeof body.status === "string" ? body.status : "observed";
  const maturityStage = Math.max(1, Math.min(5, Number(body.control_maturity_stage) || 1));
  const readinessScore = Math.max(0, Math.min(100, Number(body.automation_readiness_score) || 0));
  const avgWait = Math.max(0, Number(body.avg_wait_time_minutes) || 0);
  const reworkRate = Math.max(0, Math.min(100, Number(body.rework_rate_percent) || 0));
  const roles = Array.isArray(body.roles) ? body.roles : null;

  const client = typeof pool.connect === "function" ? await (pool as import("pg").Pool).connect() : null;
  const conn = client || pool;

  try {
    if (client) await client.query("BEGIN");

    // Verify ownership
    const check = await conn.query(
      `SELECT id FROM nv_loop WHERE id = $1::uuid AND env_id = $2 AND business_id = $3::uuid`,
      [params.loopId, envId, businessId],
    );
    if (check.rows.length === 0) {
      if (client) await client.query("ROLLBACK");
      return Response.json({ error_code: "NOT_FOUND", message: "Loop not found." }, { status: 404 });
    }

    await conn.query(
      `UPDATE nv_loop SET
         client_id = $2::uuid, name = $3, process_domain = $4, description = $5,
         trigger_type = $6, frequency_type = $7, frequency_per_year = $8, status = $9,
         control_maturity_stage = $10, automation_readiness_score = $11,
         avg_wait_time_minutes = $12, rework_rate_percent = $13, updated_at = NOW()
       WHERE id = $1::uuid`,
      [
        params.loopId, clientId, name, processDomain, description,
        triggerType, frequencyType, frequencyPerYear, status,
        maturityStage, readinessScore, avgWait, reworkRate,
      ],
    );

    // Replace roles if provided
    if (roles !== null) {
      await conn.query(`DELETE FROM nv_loop_role WHERE loop_id = $1::uuid`, [params.loopId]);
      for (const role of roles) {
        const roleName = typeof role.role_name === "string" ? role.role_name.trim() : "";
        if (!roleName) continue;
        await conn.query(
          `INSERT INTO nv_loop_role (id, loop_id, role_name, loaded_hourly_rate, active_minutes, notes)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
          [
            randomUUID(), params.loopId, roleName,
            Number(role.loaded_hourly_rate) || 0,
            Number(role.active_minutes) || 0,
            typeof role.notes === "string" ? role.notes : null,
          ],
        );
      }
    }

    if (client) await client.query("COMMIT");

    const detail = await buildLoopDetail(pool, params.loopId, envId, businessId);
    return Response.json(detail);
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    console.error("[bos.consulting.loops.[loopId]] PUT failed", { loopId: params.loopId, error: message });
    return Response.json({ error_code: "INTERNAL_ERROR", message: "Failed to update loop." }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

/**
 * DELETE /bos/api/consulting/loops/[loopId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { loopId: string } },
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "CONFIG_ERROR", message: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const envId = url.searchParams.get("env_id")?.trim() || "";
  const businessId = url.searchParams.get("business_id")?.trim() || "";

  if (!envId) return badRequest("env_id is required.");
  if (!UUID_RE.test(businessId)) return badRequest("business_id must be a valid UUID.");

  try {
    const res = await pool.query(
      `DELETE FROM nv_loop WHERE id = $1::uuid AND env_id = $2 AND business_id = $3::uuid RETURNING id`,
      [params.loopId, envId, businessId],
    );
    if (res.rows.length === 0) {
      return Response.json({ error_code: "NOT_FOUND", message: "Loop not found." }, { status: 404 });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[bos.consulting.loops.[loopId]] DELETE failed", { loopId: params.loopId, error: message });
    return Response.json({ error_code: "INTERNAL_ERROR", message: "Failed to delete loop." }, { status: 500 });
  }
}
