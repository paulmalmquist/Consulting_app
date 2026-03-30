import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/assets/[assetId]/cf-bridge
 *
 * Returns the complete cash flow bridge for an asset across all available quarters.
 * Each row traces: Revenue → OpEx → NOI → CapEx → TI/LC → Reserves → Debt Service → NCF
 *
 * Used by the golden-path validation harness to prove the asset-level math.
 * For the golden path asset (Gateway Industrial Center), all values are locked;
 * any row where reconciles=false is a data integrity failure.
 */
export async function GET(
  _request: Request,
  { params }: { params: { assetId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "DB not configured" }, { status: 503 });

  const { assetId } = params;

  try {
    // Pull locked quarterly data from the GL rollup layer
    const rowsRes = await pool.query<{
      quarter: string;
      revenue: number;
      opex: number;
      noi: number;
      capex: number;
      ti_lc: number;
      reserves: number;
      debt_service: number;
      net_cash_flow: number;
      asset_value: number;
      nav: number;
      debt_balance: number;
      occupancy: number;
    }>(
      `SELECT
         qr.quarter,
         qr.revenue::float8,
         qr.opex::float8,
         qr.noi::float8,
         qr.capex::float8,
         COALESCE(qr.ti_lc, 0)::float8        AS ti_lc,
         COALESCE(qr.reserves, 0)::float8     AS reserves,
         COALESCE(qr.debt_service, 0)::float8 AS debt_service,
         COALESCE(qr.net_cash_flow, 0)::float8 AS net_cash_flow,
         COALESCE(qs.asset_value, 0)::float8  AS asset_value,
         COALESCE(qs.nav, 0)::float8          AS nav,
         COALESCE(qs.debt_balance, 0)::float8 AS debt_balance,
         COALESCE(qs.occupancy, 0)::float8    AS occupancy
       FROM re_asset_acct_quarter_rollup qr
       LEFT JOIN re_asset_quarter_state qs
         ON qs.asset_id = qr.asset_id AND qs.quarter = qr.quarter AND qs.scenario_id IS NULL
       WHERE qr.asset_id = $1::uuid
       ORDER BY qr.quarter`,
      [assetId]
    );

    // Pull realization (sale event) if present
    const saleRes = await pool.query(
      `SELECT
         sale_date::text,
         gross_sale_price::float8,
         sale_costs::float8,
         debt_payoff::float8,
         net_sale_proceeds::float8,
         ownership_percent::float8,
         attributable_proceeds::float8
       FROM re_asset_realization
       WHERE asset_id = $1::uuid AND realization_type = 'historical_sale'
       LIMIT 1`,
      [assetId]
    );
    const sale = saleRes.rows[0] || null;

    // Build cash flow bridge rows with reconciliation checks
    const rows = rowsRes.rows.map((r) => {
      const noi_check = Math.round((r.revenue - r.opex) * 100) / 100;
      const ncf_check = Math.round(
        (r.noi - r.capex - r.ti_lc - r.reserves - r.debt_service) * 100
      ) / 100;
      const noi_delta = Math.abs(r.noi - noi_check);
      const ncf_delta = Math.abs(r.net_cash_flow - ncf_check);

      return {
        quarter: r.quarter,
        // Income statement
        revenue: r.revenue,
        opex: r.opex,
        noi: r.noi,
        // Below-NOI deductions
        capex: r.capex,
        ti_lc: r.ti_lc,
        reserves: r.reserves,
        debt_service: r.debt_service,
        // Result
        net_cash_flow: r.net_cash_flow,
        // Valuation
        asset_value: r.asset_value,
        debt_balance: r.debt_balance,
        nav: r.nav,
        occupancy: r.occupancy,
        // Reconciliation
        noi_check,
        ncf_check,
        noi_reconciles: noi_delta < 1,   // within $1
        ncf_reconciles: ncf_delta < 1,
        noi_delta,
        ncf_delta,
      };
    });

    // LTD totals
    const ltdRevenue    = rows.reduce((s, r) => s + r.revenue, 0);
    const ltdOpex       = rows.reduce((s, r) => s + r.opex, 0);
    const ltdNoi        = rows.reduce((s, r) => s + r.noi, 0);
    const ltdCapex      = rows.reduce((s, r) => s + r.capex, 0);
    const ltdTiLc       = rows.reduce((s, r) => s + r.ti_lc, 0);
    const ltdReserves   = rows.reduce((s, r) => s + r.reserves, 0);
    const ltdDebtSvc    = rows.reduce((s, r) => s + r.debt_service, 0);
    const ltdNcf        = rows.reduce((s, r) => s + r.net_cash_flow, 0);

    const saleNetProceeds = sale ? sale.net_sale_proceeds : 0;
    const totalEquityDistributions = ltdNcf + saleNetProceeds;

    const allNOIReconcile = rows.every((r) => r.noi_reconciles);
    const allNCFReconcile = rows.every((r) => r.ncf_reconciles);

    return Response.json({
      asset_id: assetId,
      periods: rows.length,
      rows,
      sale_event: sale,
      ltd_totals: {
        revenue: Math.round(ltdRevenue),
        opex: Math.round(ltdOpex),
        noi: Math.round(ltdNoi),
        capex: Math.round(ltdCapex),
        ti_lc: Math.round(ltdTiLc),
        reserves: Math.round(ltdReserves),
        debt_service: Math.round(ltdDebtSvc),
        net_cash_flow: Math.round(ltdNcf),
        sale_net_proceeds: Math.round(saleNetProceeds),
        total_equity_distributions: Math.round(totalEquityDistributions),
      },
      validation: {
        all_noi_reconcile: allNOIReconcile,
        all_ncf_reconcile: allNCFReconcile,
        period_count_ok: rows.length > 0,
        has_sale_event: !!sale,
      },
    });
  } catch (err) {
    console.error("[re/v2/assets/cf-bridge] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
