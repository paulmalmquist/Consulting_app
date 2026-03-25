import { getPool } from "@/lib/server/db";
import { computeFundBaseScenario } from "@/lib/server/reBaseScenario";

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

  function toText(value: number | null | undefined): string | null {
    return value == null ? null : String(value);
  }

  try {
    const baseScenario = await computeFundBaseScenario({
      pool,
      fundId: params.fundId,
      quarter,
      liquidationMode: "current_state",
    });

    const fundMetrics: Record<string, string | null> = {
      gross_irr: toText(baseScenario.summary.gross_irr),
      net_irr: toText(baseScenario.summary.net_irr),
      gross_tvpi: toText(baseScenario.summary.tvpi),
      net_tvpi: toText(baseScenario.summary.net_tvpi),
      dpi: toText(baseScenario.summary.dpi),
      rvpi: toText(baseScenario.summary.rvpi),
    };

    const grossNetBridge: Record<string, string | null> = {
      gross_return: toText(baseScenario.summary.gross_irr),
      mgmt_fees: toText(baseScenario.summary.management_fees),
      fund_expenses: toText(baseScenario.summary.fund_expenses),
      carry: toText(baseScenario.summary.carry_shadow),
      net_return: toText(baseScenario.summary.net_irr),
    };

    const partners = baseScenario.waterfall.partner_allocations.map((partner) => ({
      partner_id: partner.partner_id,
      name: partner.name,
      partner_type: partner.partner_type,
      committed: String(partner.committed),
      contributed: String(partner.contributed),
      distributed: String(partner.distributed),
      nav_share: String(partner.nav_share),
      dpi: toText(partner.dpi),
      tvpi: toText(partner.tvpi),
      irr: toText(partner.irr),
      waterfall_allocation: {
        return_of_capital: String(partner.waterfall_allocation.return_of_capital),
        preferred_return: String(partner.waterfall_allocation.preferred_return),
        carry: String(partner.waterfall_allocation.catch_up + partner.waterfall_allocation.split),
        total: String(partner.waterfall_allocation.total),
      },
    }));

    return Response.json({
      fund_id: params.fundId,
      quarter,
      fund_metrics: fundMetrics,
      gross_net_bridge: grossNetBridge,
      partners,
      total_committed: String(baseScenario.summary.total_committed),
      total_contributed: String(baseScenario.summary.paid_in_capital),
      total_distributed: String(baseScenario.summary.distributed_capital),
      fund_nav: String(baseScenario.summary.remaining_value),
    });
  } catch (err) {
    console.error("[re/v2/funds/[id]/lp_summary] DB error", err);
    return Response.json({ ...empty, quarter });
  }
}
