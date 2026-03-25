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
  if (!pool) return Response.json({ buckets: [], total_leased_sf: 0 }, { status: 200 });

  try {
    const curYear = new Date().getFullYear();
    const capYear = curYear + 5; // everything beyond this goes in the last bucket

    const { rows } = await pool.query(
      `SELECT
         CASE
           WHEN EXTRACT(year FROM l.expiration_date) >= $2
           THEN $3::text
           ELSE TO_CHAR(l.expiration_date, 'YYYY')
         END                               AS year,
         SUM(l.rentable_sf)::float8        AS sf,
         COUNT(*)::int                     AS lease_count,
         SUM(l.rentable_sf) OVER ()::float8 AS total_leased_sf
       FROM re_lease l
       WHERE l.asset_id = $1::uuid
         AND l.status   = 'active'
       GROUP BY 1, total_leased_sf
       ORDER BY MIN(l.expiration_date)`,
      [params.assetId, capYear, `${capYear}+`]
    );

    const total = rows.length > 0 ? Number(rows[0].total_leased_sf) : 0;

    return Response.json({
      buckets: rows.map((r) => ({
        year:         r.year,
        sf:           Number(r.sf),
        pct_expiring: total > 0 ? Number(((Number(r.sf) / total) * 100).toFixed(1)) : 0,
        lease_count:  Number(r.lease_count),
      })),
      total_leased_sf: total,
    });
  } catch (err) {
    console.error("[leasing/expiration] DB error", err);
    return Response.json({ buckets: [], total_leased_sf: 0 }, { status: 200 });
  }
}
