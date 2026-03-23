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
  if (!pool) return Response.json({ in_place_psf: null, market_rent_psf: null, mark_to_market_pct: null, total_annual_base_rent: null, below_market_leases: [] }, { status: 200 });

  try {
    // Latest snapshot for market rent benchmark
    const snapRes = await pool.query(
      `SELECT weighted_avg_rent_psf, market_rent_psf, mark_to_market_pct, total_annual_base_rent
       FROM re_rent_roll_snapshot
       WHERE asset_id = $1::uuid
       ORDER BY as_of_date DESC
       LIMIT 1`,
      [params.assetId]
    );

    const snap = snapRes.rows[0] ?? null;
    const marketPsf = snap ? Number(snap.market_rent_psf) : null;

    // Below-market leases: in-place PSF < market PSF * 0.97 (3% buffer)
    const belowRes = await pool.query(
      `SELECT
         t.name           AS tenant_name,
         l.base_rent_psf::float8  AS in_place_psf,
         l.rentable_sf::float8    AS rentable_sf
       FROM re_lease  l
       JOIN re_tenant t ON t.tenant_id = l.tenant_id
       WHERE l.asset_id = $1::uuid
         AND l.status   = 'active'
         AND $2::numeric IS NOT NULL
         AND l.base_rent_psf < $2::numeric * 0.97
       ORDER BY l.base_rent_psf ASC`,
      [params.assetId, marketPsf]
    );

    const belowMarket = belowRes.rows.map((r) => ({
      tenant_name:  r.tenant_name,
      in_place_psf: Number(r.in_place_psf),
      market_psf:   marketPsf ?? 0,
      gap_psf:      marketPsf != null ? Number((marketPsf - Number(r.in_place_psf)).toFixed(2)) : 0,
      rentable_sf:  Number(r.rentable_sf),
      annual_upside: marketPsf != null
        ? Number(((marketPsf - Number(r.in_place_psf)) * Number(r.rentable_sf)).toFixed(0))
        : 0,
    }));

    return Response.json({
      in_place_psf:          snap ? Number(snap.weighted_avg_rent_psf) : null,
      market_rent_psf:       marketPsf,
      mark_to_market_pct:    snap ? Number(snap.mark_to_market_pct)    : null,
      total_annual_base_rent: snap ? Number(snap.total_annual_base_rent) : null,
      below_market_leases:   belowMarket,
    });
  } catch (err) {
    console.error("[leasing/economics] DB error", err);
    return Response.json({
      in_place_psf: null, market_rent_psf: null, mark_to_market_pct: null,
      total_annual_base_rent: null, below_market_leases: [],
    }, { status: 200 });
  }
}
