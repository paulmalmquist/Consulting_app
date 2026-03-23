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
  if (!pool) return Response.json({ tenants: [], walt: null }, { status: 200 });

  try {
    const { rows } = await pool.query(
      `WITH active AS (
         SELECT
           l.lease_id,
           l.tenant_id,
           l.rentable_sf,
           l.base_rent_psf,
           l.expiration_date,
           l.lease_type,
           l.status,
           t.name,
           t.industry,
           t.is_anchor,
           SUM(l.rentable_sf) OVER () AS total_leased_sf
         FROM re_lease  l
         JOIN re_tenant t ON t.tenant_id = l.tenant_id
         WHERE l.asset_id = $1::uuid
           AND l.status   = 'active'
         ORDER BY l.rentable_sf DESC
         LIMIT 20
       )
       SELECT
         a.*,
         ROUND(
           (a.rentable_sf / NULLIF(a.total_leased_sf, 0) * 100)::numeric, 1
         ) AS gla_pct
       FROM active a`,
      [params.assetId]
    );

    // Compute WALT on the DB result set
    let waltNum: number | null = null;
    if (rows.length > 0) {
      const now = Date.now();
      let sfWeighted = 0;
      let sfTotal = 0;
      for (const r of rows) {
        const sf = Number(r.rentable_sf);
        const exp = new Date(r.expiration_date).getTime();
        const yearsLeft = Math.max((exp - now) / (365.25 * 24 * 3600 * 1000), 0);
        sfWeighted += sf * yearsLeft;
        sfTotal    += sf;
      }
      waltNum = sfTotal > 0 ? Number((sfWeighted / sfTotal).toFixed(2)) : null;
    }

    return Response.json({
      tenants: rows.map((r) => ({
        tenant_id:       r.tenant_id,
        name:            r.name,
        industry:        r.industry ?? null,
        is_anchor:       Boolean(r.is_anchor),
        lease_id:        r.lease_id,
        rentable_sf:     Number(r.rentable_sf),
        gla_pct:         Number(r.gla_pct ?? 0),
        base_rent_psf:   Number(r.base_rent_psf),
        expiration_date: r.expiration_date,
        lease_type:      r.lease_type,
        status:          r.status,
      })),
      walt: waltNum,
    });
  } catch (err) {
    console.error("[leasing/tenants] DB error", err);
    return Response.json({ tenants: [], walt: null }, { status: 200 });
  }
}
