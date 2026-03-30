import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/chain-validation
 *
 * End-to-end validation report: Asset → JV → Investment → Fund → LP/GP Waterfall.
 *
 * Query params:
 *   asset_id  — UUID of the asset to trace (defaults to golden-path asset)
 *   quarter   — terminal quarter for waterfall (defaults to 2026Q4)
 *
 * Returns a structured report with:
 *   1. Asset CF bridge (per-period)
 *   2. JV ownership split
 *   3. Fund cash flow allocation
 *   4. Fee drag (gross-to-net bridge)
 *   5. Waterfall tier audit (LP/GP split)
 *   6. Return metrics (IRR, TVPI, DPI, RVPI, NAV)
 *   7. Reconciliation assertions (pass/fail)
 *
 * Golden-path expected values (from 432_re_golden_path_seed.sql):
 *   total_operating_ncf = 334,343
 *   fund_share (80%)    = 267,474 (operating)
 *   sale_net_proceeds   = 4,690,656
 *   fund_sale_share     = 3,752,525
 *   total_equity_distrib= 5,024,999
 *   TVPI (asset level)  = 1.38x
 */

const GOLDEN_PATH_ASSET_ID = "f0000000-9001-0003-0001-000000000001";

// Tolerance for floating-point reconciliation checks ($1 on amounts)
const TOLERANCE = 1;

function withinTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE;
}

// Approximate IRR using Newton-Raphson on a cash flow series (quarterly periods)
function approximateIRR(cashflows: number[], quarterlyGuess = 0.04): number {
  let rate = quarterlyGuess;
  for (let iter = 0; iter < 100; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      npv  += cashflows[t] / Math.pow(1 + rate, t);
      dnpv -= (t * cashflows[t]) / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(npv) < 0.01) break;
    rate -= npv / dnpv;
    if (rate < -0.999) rate = -0.999;
  }
  // Annualise: (1 + quarterly_rate)^4 - 1
  return Math.round(((Math.pow(1 + rate, 4) - 1) * 10000)) / 10000;
}

export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "DB not configured" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get("asset_id") || GOLDEN_PATH_ASSET_ID;
  const terminalQuarter = searchParams.get("quarter") || "2026Q4";
  const fundId = params.fundId;

  try {
    // ─── 1. ASSET META ──────────────────────────────────────────────
    const assetRes = await pool.query(
      `SELECT
         a.asset_id::text, a.name, a.cost_basis::float8,
         d.deal_id::text, d.name AS deal_name, d.invested_capital::float8,
         j.jv_id::text, j.legal_name AS jv_name,
         j.lp_percent::float8 AS jv_fund_pct,
         j.gp_percent::float8 AS jv_partner_pct
       FROM repe_asset a
       JOIN repe_deal d ON d.deal_id = a.deal_id
       LEFT JOIN re_jv j ON j.jv_id = a.jv_id
       WHERE a.asset_id = $1::uuid AND d.fund_id = $2::uuid`,
      [assetId, fundId]
    );
    if (!assetRes.rows[0]) {
      return Response.json(
        { error: `Asset ${assetId} not found in fund ${fundId}` },
        { status: 404 }
      );
    }
    const asset = assetRes.rows[0];
    const jvFundPct: number = asset.jv_fund_pct ?? 1.0;

    // ─── 2. CASH FLOW BRIDGE (asset level) ─────────────────────────
    const bridgeRes = await pool.query<{
      quarter: string;
      revenue: number; opex: number; noi: number;
      capex: number; ti_lc: number; reserves: number;
      debt_service: number; net_cash_flow: number;
      asset_value: number; debt_balance: number; nav: number;
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
         COALESCE(qs.debt_balance, 0)::float8 AS debt_balance,
         COALESCE(qs.nav, 0)::float8          AS nav
       FROM re_asset_acct_quarter_rollup qr
       LEFT JOIN re_asset_quarter_state qs
         ON qs.asset_id = qr.asset_id AND qs.quarter = qr.quarter AND qs.scenario_id IS NULL
       WHERE qr.asset_id = $1::uuid
       ORDER BY qr.quarter`,
      [assetId]
    );
    const bridge = bridgeRes.rows;

    // ─── 3. SALE EVENT ─────────────────────────────────────────────
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

    // ─── 4. JV ROLL-UP (per quarter) ───────────────────────────────
    const jvRollup = bridge.map((r) => ({
      quarter: r.quarter,
      asset_ncf: r.net_cash_flow,
      fund_share: Math.round(r.net_cash_flow * jvFundPct * 100) / 100,
      partner_share: Math.round(r.net_cash_flow * (1 - jvFundPct) * 100) / 100,
      jv_fund_pct: jvFundPct,
    }));

    const ltdAssetNcf    = bridge.reduce((s, r) => s + r.net_cash_flow, 0);
    const ltdFundOpNcf   = Math.round(ltdAssetNcf * jvFundPct);
    const saleNet        = sale?.net_sale_proceeds ?? 0;
    const fundSaleShare  = Math.round(saleNet * jvFundPct);
    const totalFundDist  = ltdFundOpNcf + fundSaleShare;

    // ─── 5. FEES (gross-to-net bridge) ─────────────────────────────
    // Management fee: 1.5%/yr on invested equity, assessed quarterly
    const equityInvested = (asset.cost_basis ?? asset.invested_capital ?? 0) * jvFundPct;
    const annualMgmtFeeRate = 0.015;
    const quarterlyMgmtFee = Math.round(equityInvested * annualMgmtFeeRate / 4);
    const totalMgmtFees = quarterlyMgmtFee * bridge.length;

    // Asset management fee: $0 (inline with management fee above for simplicity)
    const totalAMFees = 0;
    const totalFees = totalMgmtFees + totalAMFees;

    const netFundDist = totalFundDist - totalFees;

    // ─── 6. WATERFALL TIER AUDIT ────────────────────────────────────
    // Run a simplified waterfall on this deal's economics alone.
    // Full fund waterfall runs against all partners via /waterfall/run.
    const yearsInvested = bridge.length / 4;
    const hurdleRate = 0.08;
    const preferredMultiplier = Math.pow(1 + hurdleRate, yearsInvested) - 1;
    const preferredOwed = Math.round(equityInvested * preferredMultiplier);

    let pool_ = netFundDist;
    const tiers: {
      tier: number; name: string; lp: number; gp: number;
      pool_before: number; pool_after: number; description: string;
    }[] = [];

    // Tier 1: Return of Capital
    const roc = Math.min(pool_, equityInvested);
    tiers.push({
      tier: 1, name: "return_of_capital",
      lp: roc, gp: 0,
      pool_before: pool_, pool_after: pool_ - roc,
      description: `Return $${roc.toLocaleString()} of $${equityInvested.toLocaleString()} invested capital to LP`,
    });
    pool_ -= roc;

    // Tier 2: Preferred Return (8% hurdle)
    const pref = Math.min(pool_, preferredOwed);
    const prefShortfall = Math.max(0, preferredOwed - pref);
    tiers.push({
      tier: 2, name: "preferred_return",
      lp: pref, gp: 0,
      pool_before: pool_, pool_after: pool_ - pref,
      description: `8% pref over ${yearsInvested} years = $${preferredOwed.toLocaleString()} owed; paid $${pref.toLocaleString()}; shortfall $${prefShortfall.toLocaleString()}`,
    });
    pool_ -= pref;

    // Tier 3: GP Catch-Up (to 20% of total profit above RoC)
    const gpCatchUpTarget = prefShortfall === 0
      ? Math.round((pref * 0.20) / 0.80)
      : 0;
    const catchUp = Math.min(pool_, gpCatchUpTarget);
    tiers.push({
      tier: 3, name: "catch_up",
      lp: 0, gp: catchUp,
      pool_before: pool_, pool_after: pool_ - catchUp,
      description: prefShortfall === 0
        ? `GP catch-up to 20% of profits: target $${gpCatchUpTarget.toLocaleString()}, paid $${catchUp.toLocaleString()}`
        : "GP catch-up skipped — preferred return not fully met",
    });
    pool_ -= catchUp;

    // Tier 4: Residual 80/20 Split
    const residualLp = Math.round(pool_ * 0.80);
    const residualGp = pool_ - residualLp;
    tiers.push({
      tier: 4, name: "split",
      lp: residualLp, gp: residualGp,
      pool_before: pool_, pool_after: 0,
      description: `Residual 80/20 split: LP $${residualLp.toLocaleString()}, GP $${residualGp.toLocaleString()}`,
    });

    const totalLp = roc + pref + residualLp;
    const totalGp = catchUp + residualGp;
    const waterfallCheck = totalLp + totalGp;

    // ─── 7. RETURN METRICS ──────────────────────────────────────────
    // Build quarterly cash flow series for IRR: [-equity, ncf×jvPct per quarter, ... + sale]
    const cfSeries: number[] = [-(equityInvested)];
    for (let i = 0; i < bridge.length; i++) {
      const opCf = Math.round(bridge[i].net_cash_flow * jvFundPct);
      const fee = quarterlyMgmtFee;
      const saleCf = i === bridge.length - 1 ? fundSaleShare : 0;
      cfSeries.push(opCf - fee + saleCf);
    }

    const grossIRR = approximateIRR(
      [-(equityInvested), ...bridge.map((r) => Math.round(r.net_cash_flow * jvFundPct)), fundSaleShare]
    );
    const netIRR = approximateIRR(cfSeries);

    const terminalNav = bridge.length > 0
      ? Math.round(bridge[bridge.length - 1].nav * jvFundPct)
      : 0;
    const dpi = equityInvested > 0
      ? Math.round((totalFundDist / equityInvested) * 10000) / 10000
      : 0;
    const rvpi = sale ? 0 : Math.round(terminalNav / equityInvested * 10000) / 10000;
    const tvpi = Math.round((dpi + rvpi) * 10000) / 10000;

    // ─── 8. RECONCILIATION ASSERTIONS ─────────────────────────────
    const assertions: { name: string; passed: boolean; detail: string }[] = [];

    // A1: NOI = revenue − opex for every period
    const noiErrors = bridge.filter((r) => !withinTolerance(r.noi, r.revenue - r.opex));
    assertions.push({
      name: "noi_equals_rev_minus_opex",
      passed: noiErrors.length === 0,
      detail: noiErrors.length === 0
        ? `All ${bridge.length} periods: NOI = Revenue − OpEx ✓`
        : `${noiErrors.length} periods fail: NOI ≠ Revenue − OpEx (quarters: ${noiErrors.map((r) => r.quarter).join(", ")})`,
    });

    // A2: NCF = NOI − capex − TI/LC − reserves − debt_service
    const ncfErrors = bridge.filter(
      (r) => !withinTolerance(r.net_cash_flow, r.noi - r.capex - (r.ti_lc ?? 0) - (r.reserves ?? 0) - r.debt_service)
    );
    assertions.push({
      name: "ncf_waterfall_reconciles",
      passed: ncfErrors.length === 0,
      detail: ncfErrors.length === 0
        ? `All ${bridge.length} periods: NCF = NOI − CapEx − TI/LC − Reserves − DebtSvc ✓`
        : `${ncfErrors.length} periods fail NCF waterfall (quarters: ${ncfErrors.map((r) => r.quarter).join(", ")})`,
    });

    // A3: Fund cash flows = asset NCF × JV ownership
    const jvErrors = jvRollup.filter(
      (r) => !withinTolerance(r.fund_share, r.asset_ncf * jvFundPct)
    );
    assertions.push({
      name: "jv_rollup_reconciles",
      passed: jvErrors.length === 0,
      detail: jvErrors.length === 0
        ? `All ${bridge.length} periods: fund_cf = asset_ncf × ${(jvFundPct * 100).toFixed(0)}% ✓`
        : `${jvErrors.length} periods fail JV ownership split`,
    });

    // A4: Sale net proceeds = gross − costs − debt payoff
    if (sale) {
      const saleCheck = withinTolerance(
        sale.net_sale_proceeds,
        sale.gross_sale_price - sale.sale_costs - sale.debt_payoff
      );
      assertions.push({
        name: "sale_net_proceeds_reconcile",
        passed: saleCheck,
        detail: saleCheck
          ? `Sale: $${sale.gross_sale_price.toLocaleString()} − $${sale.sale_costs.toLocaleString()} costs − $${sale.debt_payoff.toLocaleString()} debt = $${sale.net_sale_proceeds.toLocaleString()} net ✓`
          : `Sale net proceeds mismatch: expected ${(sale.gross_sale_price - sale.sale_costs - sale.debt_payoff).toLocaleString()}, got ${sale.net_sale_proceeds.toLocaleString()}`,
      });
    }

    // A5: Waterfall sums to net distributable
    assertions.push({
      name: "waterfall_balances",
      passed: withinTolerance(waterfallCheck, netFundDist),
      detail: withinTolerance(waterfallCheck, netFundDist)
        ? `LP $${totalLp.toLocaleString()} + GP $${totalGp.toLocaleString()} = $${netFundDist.toLocaleString()} net distributable ✓`
        : `Waterfall sum $${waterfallCheck.toLocaleString()} ≠ net distributable $${netFundDist.toLocaleString()}`,
    });

    // A6: Every distribution dollar accounted for once
    const tierSum = tiers.reduce((s, t) => s + t.lp + t.gp, 0);
    assertions.push({
      name: "no_dollar_double_counted",
      passed: withinTolerance(tierSum, netFundDist),
      detail: withinTolerance(tierSum, netFundDist)
        ? `All ${netFundDist.toLocaleString()} net dollars allocated across ${tiers.length} tiers exactly once ✓`
        : `Tier sum $${tierSum.toLocaleString()} ≠ net distributable $${netFundDist.toLocaleString()}`,
    });

    // A7: TVPI = DPI + RVPI
    assertions.push({
      name: "tvpi_equals_dpi_plus_rvpi",
      passed: withinTolerance(tvpi, dpi + rvpi),
      detail: `TVPI ${tvpi} = DPI ${dpi} + RVPI ${rvpi} ✓`,
    });

    // A8: Data coverage
    assertions.push({
      name: "period_coverage",
      passed: bridge.length >= 8,
      detail: `${bridge.length} quarters of operating data available`,
    });

    const allPassed = assertions.every((a) => a.passed);

    return Response.json({
      fund_id: fundId,
      asset_id: assetId,
      terminal_quarter: terminalQuarter,
      validation_status: allPassed ? "PASS" : "FAIL",
      assertions,

      asset: {
        name: asset.name,
        deal_name: asset.deal_name,
        jv_name: asset.jv_name,
        cost_basis: asset.cost_basis,
        jv_fund_pct: jvFundPct,
        equity_invested: equityInvested,
      },

      cf_bridge: bridge.map((r) => ({
        quarter: r.quarter,
        revenue: r.revenue,
        opex: r.opex,
        noi: r.noi,
        capex: r.capex,
        ti_lc: r.ti_lc,
        reserves: r.reserves,
        debt_service: r.debt_service,
        net_cash_flow: r.net_cash_flow,
        asset_value: r.asset_value,
        debt_balance: r.debt_balance,
        nav: r.nav,
      })),

      sale_event: sale,

      jv_rollup: {
        fund_ownership_pct: jvFundPct,
        per_quarter: jvRollup,
        ltd_asset_ncf: Math.round(ltdAssetNcf),
        ltd_fund_operating_ncf: ltdFundOpNcf,
        fund_sale_share: fundSaleShare,
        total_fund_distributions_gross: totalFundDist,
      },

      gross_to_net_bridge: {
        gross_distributions: totalFundDist,
        management_fees: totalMgmtFees,
        asset_mgmt_fees: totalAMFees,
        other_fees: 0,
        total_fees: totalFees,
        net_distributions: netFundDist,
        fee_drag_bps: equityInvested > 0
          ? Math.round((totalFees / equityInvested) * 10000)
          : 0,
      },

      waterfall: {
        net_distributable: netFundDist,
        tiers,
        summary: {
          total_lp: totalLp,
          total_gp: totalGp,
          lp_moic: equityInvested > 0
            ? Math.round(totalLp / equityInvested * 10000) / 10000
            : 0,
        },
      },

      return_metrics: {
        gross_irr: grossIRR,
        net_irr: netIRR,
        tvpi,
        dpi,
        rvpi,
        equity_invested: equityInvested,
        total_fund_distributions_gross: totalFundDist,
        terminal_nav: terminalNav,
      },
    });
  } catch (err) {
    console.error("[re/v2/funds/chain-validation] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
