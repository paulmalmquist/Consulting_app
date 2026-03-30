import { NextRequest } from "next/server";
import { getPool } from "@/lib/server/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function badRequest(message: string) {
  return Response.json(
    { error_code: "VALIDATION_ERROR", message },
    { status: 400 },
  );
}

/**
 * GET /bos/api/consulting/loops
 *
 * Returns loops with computed cost metrics and roles.
 * Query params: env_id, business_id, client_id?, status?, domain?, min_cost?
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

  if (!envId) return badRequest("env_id is required.");
  if (!UUID_RE.test(businessId)) return badRequest("business_id must be a valid UUID.");

  const clientId = url.searchParams.get("client_id")?.trim() || null;
  const status = url.searchParams.get("status")?.trim() || null;
  const domain = url.searchParams.get("domain")?.trim() || null;
  const minCostRaw = url.searchParams.get("min_cost");
  const minCost = minCostRaw ? Number(minCostRaw) : null;

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

    let having = "";
    if (minCost !== null && Number.isFinite(minCost)) {
      paramIdx++;
      params.push(minCost);
      having = `HAVING (COALESCE(SUM(r.loaded_hourly_rate * r.active_minutes / 60), 0) * l.frequency_per_year) >= $${paramIdx}`;
    }

    const sql = `
      SELECT
        l.id::text,
        l.env_id,
        l.business_id::text,
        l.client_id::text,
        l.name,
        l.process_domain,
        l.description,
        l.trigger_type,
        l.frequency_type,
        l.frequency_per_year::float8,
        l.status,
        l.control_maturity_stage::int,
        l.automation_readiness_score::int,
        l.avg_wait_time_minutes::float8,
        l.rework_rate_percent::float8,
        l.created_at::text,
        l.updated_at::text,
        COUNT(r.id)::int AS role_count,
        COALESCE(SUM(r.loaded_hourly_rate * r.active_minutes / 60), 0)::float8 AS loop_cost_per_run,
        (COALESCE(SUM(r.loaded_hourly_rate * r.active_minutes / 60), 0) * l.frequency_per_year)::float8 AS annual_estimated_cost
      FROM nv_loop l
      LEFT JOIN nv_loop_role r ON r.loop_id = l.id
      ${where}
      GROUP BY l.id
      ${having}
      ORDER BY (COALESCE(SUM(r.loaded_hourly_rate * r.active_minutes / 60), 0) * l.frequency_per_year) DESC
    `;

    const { rows } = await pool.query(sql, params);
    return Response.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("does not exist") || message.includes("relation")) {
      return Response.json(
        {
          error_code: "SCHEMA_NOT_MIGRATED",
          message: "Loop Intelligence schema not migrated.",
          detail: "Run migration 302 (consulting_loop_intelligence). Check /bos/api/consulting/health for full status.",
          health_check_url: "/bos/api/consulting/health",
          required_migrations: ["302_consulting_loop_intelligence.sql"],
        },
        { status: 503 },
      );
    }
    console.error("[bos.consulting.loops] GET failed", { envId, businessId, error: message });
    return Response.json({ error_code: "INTERNAL_ERROR", message: "Failed to load loops." }, { status: 500 });
  }
}

/**
 * POST /bos/api/consulting/loops
 *
 * Creates a new loop with roles. Returns the full LoopDetail.
 */
export async function POST(request: NextRequest) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error_code: "CONFIG_ERROR", message: "DATABASE_URL is not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const envId = typeof body.env_id === "string" ? body.env_id.trim() : "";
  const businessId = typeof body.business_id === "string" ? body.business_id.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const processDomain = typeof body.process_domain === "string" ? body.process_domain.trim() : "";

  if (!envId) return badRequest("env_id is required.");
  if (!UUID_RE.test(businessId)) return badRequest("business_id must be a valid UUID.");
  if (!name) return badRequest("name is required.");
  if (!processDomain) return badRequest("process_domain is required.");

  const loopId = randomUUID();
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
  const roles = Array.isArray(body.roles) ? body.roles : [];

  const client = typeof pool.connect === "function" ? await (pool as import("pg").Pool).connect() : null;
  const conn = client || pool;

  try {
    if (client) await client.query("BEGIN");

    await conn.query(
      `INSERT INTO nv_loop
         (id, env_id, business_id, client_id, name, process_domain, description,
          trigger_type, frequency_type, frequency_per_year, status,
          control_maturity_stage, automation_readiness_score,
          avg_wait_time_minutes, rework_rate_percent)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        loopId, envId, businessId, clientId, name, processDomain, description,
        triggerType, frequencyType, frequencyPerYear, status,
        maturityStage, readinessScore, avgWait, reworkRate,
      ],
    );

    const insertedRoles: Array<Record<string, unknown>> = [];
    for (const role of roles) {
      const roleId = randomUUID();
      const roleName = typeof role.role_name === "string" ? role.role_name.trim() : "";
      if (!roleName) continue;
      const hourlyRate = Number(role.loaded_hourly_rate) || 0;
      const activeMin = Number(role.active_minutes) || 0;
      const notes = typeof role.notes === "string" ? role.notes : null;

      const { rows } = await conn.query(
        `INSERT INTO nv_loop_role (id, loop_id, role_name, loaded_hourly_rate, active_minutes, notes)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
         RETURNING id::text, loop_id::text, role_name, loaded_hourly_rate::float8, active_minutes::float8, notes, created_at::text, updated_at::text`,
        [roleId, loopId, roleName, hourlyRate, activeMin, notes],
      );
      insertedRoles.push(rows[0]);
    }

    if (client) await client.query("COMMIT");

    // Compute cost metrics
    const costPerRun = insertedRoles.reduce(
      (sum, r) => sum + (Number(r.loaded_hourly_rate) * Number(r.active_minutes) / 60),
      0,
    );

    const loopDetail = {
      id: loopId,
      env_id: envId,
      business_id: businessId,
      client_id: clientId,
      name,
      process_domain: processDomain,
      description,
      trigger_type: triggerType,
      frequency_type: frequencyType,
      frequency_per_year: frequencyPerYear,
      status,
      control_maturity_stage: maturityStage,
      automation_readiness_score: readinessScore,
      avg_wait_time_minutes: avgWait,
      rework_rate_percent: reworkRate,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      role_count: insertedRoles.length,
      loop_cost_per_run: costPerRun,
      annual_estimated_cost: costPerRun * frequencyPerYear,
      roles: insertedRoles,
      interventions: [],
    };

    return Response.json(loopDetail, { status: 201 });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    console.error("[bos.consulting.loops] POST failed", { envId, businessId, error: message });

    if (message.includes("unique constraint") || message.includes("duplicate key")) {
      return Response.json(
        { error_code: "DUPLICATE", message: "A loop with that name already exists in this environment." },
        { status: 409 },
      );
    }
    return Response.json({ error_code: "INTERNAL_ERROR", message: "Failed to create loop." }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
