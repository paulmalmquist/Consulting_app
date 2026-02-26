import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
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
