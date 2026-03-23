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
         a.asset_id::text,
         a.deal_id::text,
         a.asset_type,
         a.name,
         a.jv_id::text,
         a.acquisition_date,
         a.cost_basis,
         a.asset_status,
         a.created_at,
         p.property_type,
         p.units,
         p.market,
         p.current_noi,
         p.occupancy,
         p.gross_sf,
         p.year_built
       FROM repe_asset a
       LEFT JOIN repe_property_asset p ON a.asset_id = p.asset_id
       WHERE a.deal_id = $1::uuid
       ORDER BY a.created_at DESC`,
      [params.dealId]
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[repe/deals/[dealId]/assets] DB error", err);
    return Response.json([], { status: 200 });
  }
}
