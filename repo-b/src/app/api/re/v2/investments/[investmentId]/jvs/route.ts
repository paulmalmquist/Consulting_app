import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(
  _request: Request,
  { params }: { params: { investmentId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  try {
    const res = await pool.query(
      `SELECT
         jv_id::text,
         investment_id::text,
         legal_name,
         ownership_percent,
         gp_percent,
         lp_percent,
         promote_structure_id::text,
         status,
         created_at
       FROM re_jv
       WHERE investment_id = $1::uuid
       ORDER BY created_at DESC`,
      [params.investmentId]
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[re/v2/investments/[investmentId]/jvs] DB error", err);
    return Response.json([], { status: 200 });
  }
}
