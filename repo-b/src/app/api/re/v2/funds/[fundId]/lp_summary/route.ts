import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/lp_summary
 *
 * Returns LP summary matching the LpSummary type expected by the frontend:
 * { fund_id, quarter, fund_metrics, gross_net_bridge, partners[], total_committed,
 *   total_contributed, total_distributed, fund_nav }
 */
export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  const empty = {
    fund_id: params.fundId,
    quarter: null as string | null,
    fund_metrics: {} as Record<string, string | null>,
    gross_net_bridge: {} as Record<string, string | null>,
    partners: [] as Record<string, unknown>[],
    total_committed: "0",
    total_contributed: "0",
    total_distributed: "0",
    fund_nav: "0",
  };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter") || "2026Q1";

  try {
    // Partner commitments and capital activity — aliased to match LpPartnerSummary type
    const partnersRes = await pool.query(
      `SELECT
         p.partner_id::text,
         p.name,
         p.partner_type,
         c.committed_amount::text AS committed,
         pm.contributed_to_date::text AS contributed,
         pm.distributed_to_date::text AS distributed,
         pm.nav::text AS nav_share,
         pm.dpi::text,
         pm.tvpi::text,
         pm.irr::text
       FROM re_partner p
       JOIN re_partner_commitment c ON c.partner_id = p.partner_id AND c.fund_id = $1::uuid
       LEFT JOIN re_partner_quarter_metrics pm
         ON pm.partner_id = p.partner_id
         AND pm.fund_id = $1::uuid
         AND pm.quarter = $2
         AND pm.scenario_id IS NULL
       WHERE p.business_id = (SELECT business_id FROM repe_fund WHERE fund_id = $1::uuid)
       ORDER BY p.name`,
      [params.fundId, quarter]
    );

    // Fund-level state
    const totalsRes = await pool.query(
      `SELECT
         portfolio_nav::text AS fund_nav,
         total_committed::text,
         total_called::text AS total_contributed,
         total_distributed::text,
         dpi::text, tvpi::text,
         gross_irr::text, net_irr::text
       FROM re_fund_quarter_state
       WHERE fund_id = $1::uuid AND quarter = $2 AND scenario_id IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [params.fundId, quarter]
    );
    const totals = totalsRes.rows[0] || {};

    // Fund metrics for KPI row
    const fundMetrics: Record<string, string | null> = {
      gross_irr: totals.gross_irr || null,
      net_irr: totals.net_irr || null,
      gross_tvpi: totals.tvpi || null,
      dpi: totals.dpi || null,
    };

    // Gross-net bridge from FI tables
    const envLookup = await pool.query(
      `SELECT ebb.env_id::text, f.business_id::text
       FROM repe_fund f
       LEFT JOIN env_business_bindings ebb ON ebb.business_id = f.business_id
       WHERE f.fund_id = $1::uuid`,
      [params.fundId]
    );
    const envId = envLookup.rows[0]?.env_id || "default";
    const businessId = envLookup.rows[0]?.business_id;

    let grossNetBridge: Record<string, string | null> = {};
    if (businessId) {
      const bridgeRes = await pool.query(
        `SELECT
           gross_return::text, mgmt_fees::text,
           fund_expenses::text, carry_shadow::text AS carry,
           net_return::text
         FROM re_gross_net_bridge_qtr
         WHERE fund_id = $1::uuid AND quarter = $2
         ORDER BY created_at DESC LIMIT 1`,
        [params.fundId, quarter]
      );
      if (bridgeRes.rows[0]) {
        grossNetBridge = bridgeRes.rows[0];
      }
    }

    // Waterfall allocations per partner (from re_waterfall_run_result)
    let waterfallByPartner: Record<string, Record<string, string>> = {};
    try {
      const wfRes = await pool.query(
        `SELECT
           wrr.partner_id::text,
           wrr.tier_code,
           wrr.amount::text
         FROM re_waterfall_run_result wrr
         JOIN re_waterfall_run wrun ON wrun.run_id = wrr.run_id
         WHERE wrun.fund_id = $1::uuid
           AND wrun.quarter = $2
           AND wrun.scenario_id IS NULL
         ORDER BY wrr.tier_code`,
        [params.fundId, quarter]
      );
      for (const row of wfRes.rows) {
        const pid = row.partner_id as string;
        if (!waterfallByPartner[pid]) waterfallByPartner[pid] = {};
        waterfallByPartner[pid][row.tier_code as string] = row.amount as string;
      }
    } catch {
      // Waterfall tables may not have data yet
    }

    // Build partners with waterfall_allocation if available
    const partners = partnersRes.rows.map((p) => {
      const wf = waterfallByPartner[p.partner_id as string];
      const allocation = wf ? {
        return_of_capital: wf.tier_1_return_of_capital || wf.return_of_capital || "0",
        preferred_return: wf.tier_2_preferred_return || wf.preferred_return || "0",
        carry: wf.tier_3_catch_up || wf.tier_4_carried_interest || wf.catch_up || wf.split || "0",
      } : undefined;

      if (allocation) {
        const roc = parseFloat(allocation.return_of_capital) || 0;
        const pref = parseFloat(allocation.preferred_return) || 0;
        const carr = parseFloat(allocation.carry) || 0;
        (allocation as Record<string, string>).total = String(roc + pref + carr);
      }
      return {
        ...p,
        waterfall_allocation: allocation,
      };
    });

    // Compute totals from partner data
    let totalCommitted = 0;
    let totalContributed = 0;
    let totalDistributed = 0;
    for (const p of partnersRes.rows) {
      totalCommitted += parseFloat(p.committed as string) || 0;
      totalContributed += parseFloat(p.contributed as string) || 0;
      totalDistributed += parseFloat(p.distributed as string) || 0;
    }

    return Response.json({
      fund_id: params.fundId,
      quarter,
      fund_metrics: fundMetrics,
      gross_net_bridge: grossNetBridge,
      partners,
      total_committed: totals.total_committed || String(totalCommitted),
      total_contributed: totals.total_contributed || String(totalContributed),
      total_distributed: totals.total_distributed || String(totalDistributed),
      fund_nav: totals.fund_nav || "0",
    });
  } catch (err) {
    console.error("[re/v2/funds/[id]/lp_summary] DB error", err);
    return Response.json({ ...empty, quarter });
  }
}
