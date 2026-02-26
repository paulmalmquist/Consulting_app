import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, POST, OPTIONS" } });
}

export async function GET(
  _request: Request,
  { params }: { params: { dealId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json([], { status: 200 });

  try {
    const res = await pool.query(
      `SELECT
         asset_id::text,
         deal_id::text,
         asset_type,
         name,
         jv_id::text,
         acquisition_date,
         cost_basis,
         asset_status,
         created_at
       FROM repe_asset
       WHERE deal_id = $1::uuid
       ORDER BY created_at DESC`,
      [params.dealId]
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[repe/deals/[dealId]/assets] DB error", err);
    return Response.json([], { status: 200 });
  }
}
