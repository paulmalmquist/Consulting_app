import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(
  _req: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json(null, { status: 200 });

  try {
    const { rows } = await pool.query(
      `SELECT
         v.lease_count,
         v.tenant_count,
         v.leased_sf          AS occupied_sf,
         v.leasable_sf        AS total_sf,
         v.snapshot_occupancy AS physical_occupancy,
         v.walt_years,
         v.in_place_psf,
         v.market_rent_psf,
         v.mark_to_market_pct,
         v.total_annual_base_rent,
         v.top_tenant_name,
         v.anchor_pct,
         v.next_expiration,
         v.snapshot_date
       FROM re_asset_lease_summary_v v
       WHERE v.asset_id = $1::uuid`,
      [params.assetId]
    );

    if (rows.length === 0) return Response.json(null, { status: 200 });

    const r = rows[0];
    return Response.json({
      lease_count:           Number(r.lease_count ?? 0),
      tenant_count:          Number(r.tenant_count ?? 0),
      occupied_sf:           r.occupied_sf != null ? Number(r.occupied_sf) : null,
      total_sf:              r.total_sf    != null ? Number(r.total_sf)    : null,
      physical_occupancy:    r.physical_occupancy != null ? Number(r.physical_occupancy) : null,
      walt_years:            r.walt_years  != null ? Number(r.walt_years)  : null,
      in_place_psf:          r.in_place_psf != null ? Number(r.in_place_psf) : null,
      market_rent_psf:       r.market_rent_psf != null ? Number(r.market_rent_psf) : null,
      mark_to_market_pct:    r.mark_to_market_pct != null ? Number(r.mark_to_market_pct) : null,
      total_annual_base_rent: r.total_annual_base_rent != null ? Number(r.total_annual_base_rent) : null,
      top_tenant_name:       r.top_tenant_name ?? null,
      anchor_pct:            r.anchor_pct != null ? Number(r.anchor_pct) : null,
      next_expiration:       r.next_expiration ?? null,
      snapshot_date:         r.snapshot_date ?? null,
    });
  } catch (err) {
    console.error("[leasing/summary] DB error", err);
    return Response.json(null, { status: 200 });
  }
}
