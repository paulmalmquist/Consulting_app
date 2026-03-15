import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/investors?env_id=X&business_id=Y&partner_type=lp
 *
 * Returns investor list with per-partner commitment totals and fund count.
 */
export async function GET(request: Request) {
  const pool = getPool();
  const empty = { investors: [] as Record<string, unknown>[] };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const partnerType = searchParams.get("partner_type");
  const quarter = searchParams.get("quarter") || "2026Q1";

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(empty);

    const params: (string | null)[] = [businessId];
    let typeFilter = "";
    if (partnerType) {
      typeFilter = " AND p.partner_type = $2";
      params.push(partnerType);
    }

    const res = await pool.query(
      `SELECT
         p.partner_id::text,
         p.name,
         p.partner_type,
         p.created_at::text,
         COUNT(DISTINCT pc.fund_id)::int AS fund_count,
         COALESCE(SUM(pc.committed_amount), 0)::text AS total_committed
       FROM re_partner p
       LEFT JOIN re_partner_commitment pc ON pc.partner_id = p.partner_id
       WHERE p.business_id = $1::uuid${typeFilter}
       GROUP BY p.partner_id
       ORDER BY p.name`,
      params
    );

    // Enrich with latest quarter metrics (weighted TVPI)
    const partnerIds = res.rows.map((r) => r.partner_id as string);
    let metricsMap: Record<string, { tvpi: string; irr: string }> = {};
    if (partnerIds.length > 0) {
      try {
        const metricsRes = await pool.query(
          `SELECT DISTINCT ON (partner_id)
             partner_id::text,
             tvpi::text,
             irr::text
           FROM re_partner_quarter_metrics
           WHERE partner_id = ANY($1::uuid[])
             AND quarter = $2
             AND scenario_id IS NULL
           ORDER BY partner_id, created_at DESC`,
          [partnerIds, quarter]
        );
        for (const row of metricsRes.rows) {
          metricsMap[row.partner_id as string] = {
            tvpi: row.tvpi as string,
            irr: row.irr as string,
          };
        }
      } catch {
        // Metrics table may not have data
      }
    }

    const investors = res.rows.map((r) => ({
      ...r,
      tvpi: metricsMap[r.partner_id as string]?.tvpi || null,
      irr: metricsMap[r.partner_id as string]?.irr || null,
    }));

    return Response.json({ investors });
  } catch (err) {
    console.error("[re/v2/investors] DB error", err);
    return Response.json(empty);
  }
}
