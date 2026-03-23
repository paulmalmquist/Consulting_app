import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, POST, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/capital-snapshots?quarter=2026Q1
 *
 * Returns capital account snapshots for all partners in a fund for a given quarter.
 * Joins re_partner_quarter_metrics with repe_partner for partner details.
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error: "DB unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter");

  if (!quarter) {
    return Response.json({ error: "quarter is required" }, { status: 400 });
  }

  try {
    const res = await pool.query(
      `SELECT
         pqm.id::text,
         pqm.partner_id::text,
         pp.name AS partner_name,
         pp.partner_type,
         pqm.contributed_to_date::float8 AS contributed,
         pqm.distributed_to_date::float8 AS distributed,
         pqm.nav::float8 AS nav_share,
         pqm.dpi::float8,
         CASE WHEN pqm.nav::float8 > 0 THEN (pqm.nav::float8 / NULLIF(pqm.contributed_to_date::float8, 0))::float8 ELSE NULL END AS rvpi,
         pqm.tvpi::float8,
         pqm.irr::float8 AS irr_pct,
         NULL::float8 AS carry_allocation,
         pqm.created_at::text
       FROM re_partner_quarter_metrics pqm
       LEFT JOIN repe_partner pp ON pp.partner_id = pqm.partner_id
       WHERE pqm.fund_id = $1::uuid
         AND pqm.quarter = $2
         AND pqm.scenario_id IS NULL
       ORDER BY pp.partner_type DESC, pp.name`,
      [params.fundId, quarter]
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/capital-snapshots GET]", err);
    return Response.json({ error: (err instanceof Error ? err.message : String(err)) || "Unknown error" }, { status: 500 });
  }
}

/**
 * POST /api/re/v2/funds/[fundId]/capital-snapshots/compute
 *
 * Computes capital snapshots (materialization - for now just returns from DB).
 * In future, this could trigger a computation job.
 */
export async function POST(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error: "DB unavailable" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const quarter = body.quarter || new Date().toISOString().split('-').slice(0, 2).join('');

    // For now, just return existing data from DB
    // In future, this could trigger a computation engine
    const res = await pool.query(
      `SELECT
         pqm.id::text,
         pqm.partner_id::text,
         pp.name AS partner_name,
         pp.partner_type,
         pqm.contributed_to_date::float8 AS contributed,
         pqm.distributed_to_date::float8 AS distributed,
         pqm.nav::float8 AS nav_share,
         pqm.dpi::float8,
         CASE WHEN pqm.nav::float8 > 0 THEN (pqm.nav::float8 / NULLIF(pqm.contributed_to_date::float8, 0))::float8 ELSE NULL END AS rvpi,
         pqm.tvpi::float8,
         pqm.irr::float8 AS irr_pct,
         NULL::float8 AS carry_allocation,
         pqm.created_at::text
       FROM re_partner_quarter_metrics pqm
       LEFT JOIN repe_partner pp ON pp.partner_id = pqm.partner_id
       WHERE pqm.fund_id = $1::uuid
         AND pqm.quarter = $2
         AND pqm.scenario_id IS NULL
       ORDER BY pp.partner_type DESC, pp.name`,
      [params.fundId, quarter]
    );

    return Response.json(res.rows, { status: 201 });
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/capital-snapshots POST]", err);
    return Response.json({ error: (err instanceof Error ? err.message : String(err)) || "Unknown error" }, { status: 500 });
  }
}
