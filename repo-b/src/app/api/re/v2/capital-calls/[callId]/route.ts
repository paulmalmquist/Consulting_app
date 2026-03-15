import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/capital-calls/[callId]
 *
 * Returns capital call detail with per-partner contributions.
 */
export async function GET(
  request: Request,
  { params }: { params: { callId: string } }
) {
  const pool = getPool();
  const empty = {
    call: null as Record<string, unknown> | null,
    contributions: [] as Record<string, unknown>[],
  };
  if (!pool) return Response.json(empty);

  try {
    // Capital call detail
    const callRes = await pool.query(
      `SELECT
         cc.call_id::text,
         cc.fund_id::text,
         f.name AS fund_name,
         cc.call_number,
         cc.call_date::text,
         cc.due_date::text,
         cc.amount_requested::text,
         cc.purpose,
         cc.status,
         cc.created_at::text
       FROM fin_capital_call cc
       JOIN repe_fund f ON f.fund_id = cc.fund_id
       WHERE cc.call_id = $1::uuid`,
      [params.callId]
    );
    const call = callRes.rows[0] || null;
    if (!call) return Response.json(empty);

    // Contributions for this call
    const contribRes = await pool.query(
      `SELECT
         c.contribution_id::text,
         c.call_id::text,
         c.partner_id::text,
         p.name AS partner_name,
         p.partner_type,
         c.contribution_date::text,
         c.amount_contributed::text,
         c.status,
         c.created_at::text
       FROM fin_contribution c
       JOIN re_partner p ON p.partner_id = c.partner_id
       WHERE c.call_id = $1::uuid
       ORDER BY p.name`,
      [params.callId]
    );

    // Aggregate totals
    let totalContributed = 0;
    for (const row of contribRes.rows) {
      totalContributed += parseFloat(row.amount_contributed as string) || 0;
    }

    return Response.json({
      call,
      contributions: contribRes.rows,
      totals: {
        total_contributed: String(totalContributed),
        outstanding: String(
          (parseFloat(call.amount_requested as string) || 0) - totalContributed
        ),
        contribution_count: contribRes.rows.length,
      },
    });
  } catch (err) {
    console.error("[re/v2/capital-calls/[id]] DB error", err);
    return Response.json(empty);
  }
}
