import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/investors/[partnerId]
 *
 * Returns investor detail: profile, per-fund commitments, and latest quarter metrics.
 */
export async function GET(
  request: Request,
  { params }: { params: { partnerId: string } }
) {
  const pool = getPool();
  const empty = {
    partner: null as Record<string, unknown> | null,
    commitments: [] as Record<string, unknown>[],
    metrics: [] as Record<string, unknown>[],
  };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter") || "2026Q1";

  try {
    // Partner profile
    const partnerRes = await pool.query(
      `SELECT partner_id::text, name, partner_type, business_id::text, created_at::text
       FROM re_partner
       WHERE partner_id = $1::uuid`,
      [params.partnerId]
    );
    const partner = partnerRes.rows[0] || null;
    if (!partner) return Response.json(empty);

    // Commitments across funds
    const commitmentsRes = await pool.query(
      `SELECT
         pc.fund_id::text,
         f.name AS fund_name,
         f.vintage_year,
         f.strategy,
         pc.committed_amount::text,
         pc.commitment_date::text
       FROM re_partner_commitment pc
       JOIN repe_fund f ON f.fund_id = pc.fund_id
       WHERE pc.partner_id = $1::uuid
       ORDER BY f.name`,
      [params.partnerId]
    );

    // Latest quarter metrics per fund
    const metricsRes = await pool.query(
      `SELECT
         pqm.fund_id::text,
         f.name AS fund_name,
         pqm.quarter,
         pqm.contributed_to_date::text AS contributed,
         pqm.distributed_to_date::text AS distributed,
         pqm.nav::text AS nav_share,
         pqm.dpi::text,
         pqm.tvpi::text,
         pqm.irr::text
       FROM re_partner_quarter_metrics pqm
       JOIN repe_fund f ON f.fund_id = pqm.fund_id
       WHERE pqm.partner_id = $1::uuid
         AND pqm.quarter = $2
         AND pqm.scenario_id IS NULL
       ORDER BY f.name`,
      [params.partnerId, quarter]
    );

    // Aggregate totals
    let totalCommitted = 0;
    let totalContributed = 0;
    let totalDistributed = 0;
    for (const c of commitmentsRes.rows) {
      totalCommitted += parseFloat(c.committed_amount as string) || 0;
    }
    for (const m of metricsRes.rows) {
      totalContributed += parseFloat(m.contributed as string) || 0;
      totalDistributed += parseFloat(m.distributed as string) || 0;
    }

    return Response.json({
      partner,
      commitments: commitmentsRes.rows,
      metrics: metricsRes.rows,
      totals: {
        total_committed: String(totalCommitted),
        total_contributed: String(totalContributed),
        total_distributed: String(totalDistributed),
      },
    });
  } catch (err) {
    console.error("[re/v2/investors/[id]] DB error", err);
    return Response.json(empty);
  }
}
