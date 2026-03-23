import { getPool } from "@/lib/server/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, POST, OPTIONS" } });
}

export async function GET(
  _request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  try {
    const res = await pool.query(
      `SELECT
         scenario_id::text,
         fund_id::text,
         name,
         description,
         scenario_type,
         is_base,
         status,
         created_at
       FROM re_scenario
       WHERE fund_id = $1::uuid
       ORDER BY is_base DESC, created_at ASC`,
      [params.fundId]
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/scenarios] DB error", err);
    return Response.json([], { status: 200 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "DB not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const scenarioId = randomUUID();
  try {
    const res = await pool.query(
      `INSERT INTO re_scenario
         (scenario_id, fund_id, name, description, scenario_type, is_base, status, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, false, 'active', NOW())
       ON CONFLICT (fund_id, name) DO NOTHING
       RETURNING
         scenario_id::text,
         fund_id::text,
         name,
         description,
         scenario_type,
         is_base,
         status,
         created_at`,
      [
        scenarioId,
        params.fundId,
        name,
        (body.description as string) || null,
        (body.scenario_type as string) || "custom",
      ]
    );
    if (res.rows.length === 0) {
      return Response.json(
        { error: "Scenario with that name already exists in this fund" },
        { status: 409 }
      );
    }
    return Response.json(res.rows[0], { status: 201 });
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/scenarios] POST error", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
