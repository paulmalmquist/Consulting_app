import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

const ALLOWED_SORT = new Set(["sf", "rent", "expiry"]);

export async function GET(
  req: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ rows: [], total: 0 }, { status: 200 });

  const { searchParams } = new URL(req.url);
  const rawSort   = searchParams.get("sort") ?? "sf";
  const rawStatus = searchParams.get("status") ?? "active";
  const sort      = ALLOWED_SORT.has(rawSort) ? rawSort : "sf";

  const orderBy =
    sort === "rent"  ? "l.base_rent_psf DESC" :
    sort === "expiry" ? "l.expiration_date ASC" :
    "l.rentable_sf DESC";

  try {
    const { rows } = await pool.query(
      `SELECT
         l.lease_id,
         t.name           AS tenant_name,
         t.is_anchor,
         s.suite_number,
         s.floor,
         l.rentable_sf::float8,
         l.lease_type,
         l.status,
         l.commencement_date,
         l.expiration_date,
         l.base_rent_psf::float8,
         (l.base_rent_psf * l.rentable_sf)::float8  AS annual_base_rent,
         l.free_rent_months,
         l.ti_allowance_psf::float8,
         l.renewal_options,
         l.expansion_option,
         l.termination_option
       FROM re_lease       l
       JOIN re_tenant      t ON t.tenant_id = l.tenant_id
       LEFT JOIN re_asset_space s ON s.space_id = l.space_id
       WHERE l.asset_id = $1::uuid
         AND ($2::text = 'all' OR l.status = $2::text)
       ORDER BY ${orderBy}`,
      [params.assetId, rawStatus]
    );

    return Response.json({ rows, total: rows.length });
  } catch (err) {
    console.error("[leasing/rent-roll] DB error", err);
    return Response.json({ rows: [], total: 0 }, { status: 200 });
  }
}
