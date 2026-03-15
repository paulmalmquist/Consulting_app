import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/distributions/[eventId]
 *
 * Returns distribution event detail with per-partner payouts and type breakdown.
 */
export async function GET(
  request: Request,
  { params }: { params: { eventId: string } }
) {
  const pool = getPool();
  const empty = {
    event: null as Record<string, unknown> | null,
    payouts: [] as Record<string, unknown>[],
  };
  if (!pool) return Response.json(empty);

  try {
    // Distribution event detail
    const eventRes = await pool.query(
      `SELECT
         de.event_id::text,
         de.fund_id::text,
         f.name AS fund_name,
         de.event_type,
         de.total_amount::text,
         de.effective_date::text,
         de.status,
         de.created_at::text
       FROM fin_distribution_event de
       JOIN repe_fund f ON f.fund_id = de.fund_id
       WHERE de.event_id = $1::uuid`,
      [params.eventId]
    );
    const event = eventRes.rows[0] || null;
    if (!event) return Response.json(empty);

    // Payouts for this event
    const payoutRes = await pool.query(
      `SELECT
         dp.payout_id::text,
         dp.event_id::text,
         dp.partner_id::text,
         p.name AS partner_name,
         p.partner_type,
         dp.payout_type,
         dp.amount::text,
         dp.status,
         dp.created_at::text
       FROM fin_distribution_payout dp
       JOIN re_partner p ON p.partner_id = dp.partner_id
       WHERE dp.event_id = $1::uuid
       ORDER BY p.name, dp.payout_type`,
      [params.eventId]
    );

    // Aggregate by payout type
    const byType: Record<string, number> = {};
    let totalPayouts = 0;
    for (const row of payoutRes.rows) {
      const amt = parseFloat(row.amount as string) || 0;
      const pt = row.payout_type as string;
      byType[pt] = (byType[pt] || 0) + amt;
      totalPayouts += amt;
    }

    return Response.json({
      event,
      payouts: payoutRes.rows,
      totals: {
        total_payouts: String(totalPayouts),
        payout_count: payoutRes.rows.length,
        by_type: Object.fromEntries(
          Object.entries(byType).map(([k, v]) => [k, String(v)])
        ),
      },
    });
  } catch (err) {
    console.error("[re/v2/distributions/[id]] DB error", err);
    return Response.json(empty);
  }
}
