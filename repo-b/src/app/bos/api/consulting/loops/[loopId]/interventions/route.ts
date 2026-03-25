import { NextRequest } from "next/server";
import { getPool } from "@/lib/server/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_TYPES = new Set([
  "remove_step",
  "consolidate_role",
  "automate_step",
  "policy_rewrite",
  "data_standardize",
  "other",
]);

/**
 * POST /bos/api/consulting/loops/[loopId]/interventions
 *
 * Creates an intervention with a server-captured before_snapshot.
 */
export async function POST(
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

  if (!envId) {
    return Response.json({ error_code: "VALIDATION_ERROR", message: "env_id is required." }, { status: 400 });
  }
  if (!UUID_RE.test(businessId)) {
    return Response.json({ error_code: "VALIDATION_ERROR", message: "business_id must be a valid UUID." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error_code: "VALIDATION_ERROR", message: "Invalid JSON body." }, { status: 400 });
  }

  const interventionType = typeof body.intervention_type === "string" ? body.intervention_type : "";
  if (!VALID_TYPES.has(interventionType)) {
    return Response.json(
      { error_code: "VALIDATION_ERROR", message: `intervention_type must be one of: ${[...VALID_TYPES].join(", ")}` },
      { status: 400 },
    );
  }

  const notes = typeof body.notes === "string" ? body.notes : null;
  const afterSnapshot = body.after_snapshot && typeof body.after_snapshot === "object" ? body.after_snapshot : null;
  const observedDelta = typeof body.observed_delta_percent === "number" ? body.observed_delta_percent : null;

  try {
    // Verify loop exists and capture before_snapshot
    const loopRes = await pool.query(
      `SELECT l.id, l.frequency_per_year::float8, l.control_maturity_stage::int,
              l.automation_readiness_score::int, l.status
       FROM nv_loop l
       WHERE l.id = $1::uuid AND l.env_id = $2 AND l.business_id = $3::uuid`,
      [params.loopId, envId, businessId],
    );

    if (loopRes.rows.length === 0) {
      return Response.json({ error_code: "NOT_FOUND", message: "Loop not found." }, { status: 404 });
    }

    const loop = loopRes.rows[0];

    // Get current roles for snapshot
    const rolesRes = await pool.query(
      `SELECT role_name, loaded_hourly_rate::float8, active_minutes::float8, notes
       FROM nv_loop_role WHERE loop_id = $1::uuid ORDER BY created_at`,
      [params.loopId],
    );

    const roles = rolesRes.rows;
    const costPerRun = roles.reduce(
      (sum: number, r: Record<string, unknown>) =>
        sum + (Number(r.loaded_hourly_rate) * Number(r.active_minutes) / 60),
      0,
    );

    const beforeSnapshot = {
      frequency_per_year: loop.frequency_per_year,
      control_maturity_stage: loop.control_maturity_stage,
      automation_readiness_score: loop.automation_readiness_score,
      status: loop.status,
      role_count: roles.length,
      loop_cost_per_run: costPerRun,
      annual_estimated_cost: costPerRun * Number(loop.frequency_per_year),
      roles,
    };

    const interventionId = randomUUID();

    const insRes = await pool.query(
      `INSERT INTO nv_loop_intervention
         (id, loop_id, intervention_type, notes, before_snapshot, after_snapshot, observed_delta_percent)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::jsonb, $7)
       RETURNING
         id::text, loop_id::text, intervention_type, notes,
         before_snapshot, after_snapshot, observed_delta_percent::float8,
         created_at::text, updated_at::text`,
      [
        interventionId, params.loopId, interventionType, notes,
        JSON.stringify(beforeSnapshot),
        afterSnapshot ? JSON.stringify(afterSnapshot) : null,
        observedDelta,
      ],
    );

    const intervention = insRes.rows[0];
    // Attach loop_metrics for frontend convenience
    intervention.loop_metrics = {
      role_count: roles.length,
      loop_cost_per_run: costPerRun,
      annual_estimated_cost: costPerRun * Number(loop.frequency_per_year),
    };

    return Response.json(intervention, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[bos.consulting.loops.[loopId].interventions] POST failed", {
      loopId: params.loopId,
      error: message,
    });
    return Response.json({ error_code: "INTERNAL_ERROR", message: "Failed to create intervention." }, { status: 500 });
  }
}
