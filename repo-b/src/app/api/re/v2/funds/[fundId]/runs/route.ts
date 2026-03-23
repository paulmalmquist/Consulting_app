import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/runs
 *
 * Lists run provenance records for a fund, optionally filtered by quarter.
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([]);

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter");

  try {
    const conditions = ["fund_id = $1::uuid"];
    const values: string[] = [params.fundId];

    if (quarter) {
      conditions.push("quarter = $2");
      values.push(quarter);
    }

    const res = await pool.query(
      `SELECT
         id::text AS provenance_id,
         id::text AS run_id,
         run_type,
         fund_id::text,
         quarter,
         status,
         created_by AS triggered_by,
         created_at::text AS started_at,
         created_at::text AS completed_at
       FROM re_run
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT 50`,
      values
    );

    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/funds/[id]/runs] DB error", err);
    return Response.json([]);
  }
}
