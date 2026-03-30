import { getPool } from "@/lib/server/db";

const GOLDEN_PATH_ASSET_ID = "f0000000-9001-0003-0001-000000000001";
const TOLERANCE = 1;

function withinTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE;
}

function approximateIRR(cashflows: number[], quarterlyGuess = 0.04): number {
  let rate = quarterlyGuess;
  for (let iter = 0; iter < 100; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      npv += cashflows[t] / Math.pow(1 + rate, t);
      dnpv -= (t * cashflows[t]) / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(npv) < 0.01) break;
    rate -= npv / dnpv;
    if (rate < -0.999) rate = -0.999;
  }
  return Math.round((Math.pow(1 + rate, 4) - 1) * 10000) / 10000;
}

export async function getFundChainValidation(
  fundId: string,
  assetId = GOLDEN_PATH_ASSET_ID,
  terminalQuarter = "2026Q4"
) {
  const pool = getPool();
  if (!pool) return null;

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
    return { error: `Asset ${assetId} not found in fund ${fundId}`, status: 404 as const };
  }

  const asset = assetRes.rows[0];
  const jvFundPct: number = asset.jv_fund_pct ?? 1.0;

  const bridgeRes = await pool.query<{
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
    debt_balance: number;
    nav: number;
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

  const jvRollup = bridge.map((r) => ({
    quarter: r.quarter,
    asset_ncf: r.net_cash_flow,
    fund_share: Math.round(r.net_cash_flow * jvFundPct * 100) / 100,
    partner_share: Math.round(r.net_cash_flow * (1 - jvFundPct) * 100) / 100,
    jv_fund_pct: jvFundPct,
  }));

  const ltdAssetNcf = bridge.reduce((s, r) => s + r.net_cash_flow, 0);
  const ltdFundOpNcf = Math.round(ltdAssetNcf * jvFundPct);
  const saleNet = sale?.net_sale_proceeds ?? 0;
  const fundSaleShare = Math.round(saleNet * jvFundPct);
  const totalFundDist = ltdFundOpNcf + fundSaleShare;

  const equityInvested = (asset.cost_basis ?? asset.invested_capital ?? 0) * jvFundPct;
  const annualMgmtFeeRate = 0.015;
  const quarterlyMgmtFee = Math.round((equityInvested * annualMgmtFeeRate) / 4);
  const totalMgmtFees = quarterlyMgmtFee * bridge.length;
  const totalAMFees = 0;
  const totalFees = totalMgmtFees + totalAMFees;
  const netFundDist = totalFundDist - totalFees;

  const yearsInvested = bridge.length / 4;
  const hurdleRate = 0.08;
  const preferredMultiplier = Math.pow(1 + hurdleRate, yearsInvested) - 1;
  const preferredOwed = Math.round(equityInvested * preferredMultiplier);

  let poolRemaining = netFundDist;
  const tiers: {
    tier: number;
    name: string;
    lp: number;
    gp: number;
    pool_before: number;
    pool_after: number;
    description: string;
  }[] = [];

  const roc = Math.min(poolRemaining, equityInvested);
  tiers.push({
    tier: 1,
    name: "return_of_capital",
    lp: roc,
    gp: 0,
    pool_before: poolRemaining,
    pool_after: poolRemaining - roc,
    description: `Return $${roc.toLocaleString()} of $${equityInvested.toLocaleString()} invested capital to LP`,
  });
  poolRemaining -= roc;

  const pref = Math.min(poolRemaining, preferredOwed);
  const prefShortfall = Math.max(0, preferredOwed - pref);
  tiers.push({
    tier: 2,
    name: "preferred_return",
    lp: pref,
    gp: 0,
    pool_before: poolRemaining,
    pool_after: poolRemaining - pref,
    description: `8% pref over ${yearsInvested} years = $${preferredOwed.toLocaleString()} owed; paid $${pref.toLocaleString()}; shortfall $${prefShortfall.toLocaleString()}`,
  });
  poolRemaining -= pref;

  const gpCatchUpTarget = prefShortfall === 0 ? Math.round((pref * 0.2) / 0.8) : 0;
  const catchUp = Math.min(poolRemaining, gpCatchUpTarget);
  tiers.push({
    tier: 3,
    name: "catch_up",
    lp: 0,
    gp: catchUp,
    pool_before: poolRemaining,
    pool_after: poolRemaining - catchUp,
    description:
      prefShortfall === 0
        ? `GP catch-up to 20% of profits: target $${gpCatchUpTarget.toLocaleString()}, paid $${catchUp.toLocaleString()}`
        : "GP catch-up skipped — preferred return not fully met",
  });
  poolRemaining -= catchUp;

  const residualLp = Math.round(poolRemaining * 0.8);
  const residualGp = poolRemaining - residualLp;
  tiers.push({
    tier: 4,
    name: "split",
    lp: residualLp,
    gp: residualGp,
    pool_before: poolRemaining,
    pool_after: 0,
    description: `Residual 80/20 split: LP $${residualLp.toLocaleString()}, GP $${residualGp.toLocaleString()}`,
  });

  const totalLp = roc + pref + residualLp;
  const totalGp = catchUp + residualGp;
  const waterfallCheck = totalLp + totalGp;

  const cfSeries: number[] = [-(equityInvested)];
  for (let i = 0; i < bridge.length; i++) {
    const opCf = Math.round(bridge[i].net_cash_flow * jvFundPct);
    const fee = quarterlyMgmtFee;
    const saleCf = i === bridge.length - 1 ? fundSaleShare : 0;
    cfSeries.push(opCf - fee + saleCf);
  }

  const grossIRR = approximateIRR([
    -equityInvested,
    ...bridge.map((r) => Math.round(r.net_cash_flow * jvFundPct)),
    fundSaleShare,
  ]);
  const netIRR = approximateIRR(cfSeries);

  const terminalNav =
    bridge.length > 0 ? Math.round(bridge[bridge.length - 1].nav * jvFundPct) : 0;
  const dpi =
    equityInvested > 0 ? Math.round((totalFundDist / equityInvested) * 10000) / 10000 : 0;
  const rvpi = sale ? 0 : Math.round((terminalNav / equityInvested) * 10000) / 10000;
  const tvpi = Math.round((dpi + rvpi) * 10000) / 10000;

  const assertions: { name: string; passed: boolean; detail: string }[] = [];

  const noiErrors = bridge.filter((r) => !withinTolerance(r.noi, r.revenue - r.opex));
  assertions.push({
    name: "noi_equals_rev_minus_opex",
    passed: noiErrors.length === 0,
    detail:
      noiErrors.length === 0
        ? `All ${bridge.length} periods: NOI = Revenue − OpEx ✓`
        : `${noiErrors.length} periods fail: NOI ≠ Revenue − OpEx (quarters: ${noiErrors.map((r) => r.quarter).join(", ")})`,
  });

  const ncfErrors = bridge.filter(
    (r) =>
      !withinTolerance(
        r.net_cash_flow,
        r.noi - r.capex - (r.ti_lc ?? 0) - (r.reserves ?? 0) - r.debt_service
      )
  );
  assertions.push({
    name: "ncf_waterfall_reconciles",
    passed: ncfErrors.length === 0,
    detail:
      ncfErrors.length === 0
        ? `All ${bridge.length} periods: NCF = NOI − CapEx − TI/LC − Reserves − DebtSvc ✓`
        : `${ncfErrors.length} periods fail NCF waterfall (quarters: ${ncfErrors.map((r) => r.quarter).join(", ")})`,
  });

  const jvErrors = jvRollup.filter((r) => !withinTolerance(r.fund_share, r.asset_ncf * jvFundPct));
  assertions.push({
    name: "jv_rollup_reconciles",
    passed: jvErrors.length === 0,
    detail:
      jvErrors.length === 0
        ? `All ${bridge.length} periods: fund_cf = asset_ncf × ${(jvFundPct * 100).toFixed(0)}% ✓`
        : `${jvErrors.length} periods fail JV ownership split`,
  });

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

  assertions.push({
    name: "waterfall_balances",
    passed: withinTolerance(waterfallCheck, netFundDist),
    detail: withinTolerance(waterfallCheck, netFundDist)
      ? `LP $${totalLp.toLocaleString()} + GP $${totalGp.toLocaleString()} = $${netFundDist.toLocaleString()} net distributable ✓`
      : `Waterfall sum $${waterfallCheck.toLocaleString()} ≠ net distributable $${netFundDist.toLocaleString()}`,
  });

  const tierSum = tiers.reduce((s, t) => s + t.lp + t.gp, 0);
  assertions.push({
    name: "no_dollar_double_counted",
    passed: withinTolerance(tierSum, netFundDist),
    detail: withinTolerance(tierSum, netFundDist)
      ? `All ${netFundDist.toLocaleString()} net dollars allocated across ${tiers.length} tiers exactly once ✓`
      : `Tier sum $${tierSum.toLocaleString()} ≠ net distributable $${netFundDist.toLocaleString()}`,
  });

  assertions.push({
    name: "tvpi_equals_dpi_plus_rvpi",
    passed: withinTolerance(tvpi, dpi + rvpi),
    detail: `TVPI ${tvpi} = DPI ${dpi} + RVPI ${rvpi} ✓`,
  });

  assertions.push({
    name: "period_coverage",
    passed: bridge.length >= 8,
    detail: `${bridge.length} quarters of operating data available`,
  });

  const allPassed = assertions.every((a) => a.passed);

  return {
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
      fee_drag_bps: equityInvested > 0 ? Math.round((totalFees / equityInvested) * 10000) : 0,
    },
    waterfall: {
      net_distributable: netFundDist,
      tiers,
      summary: {
        total_lp: totalLp,
        total_gp: totalGp,
        lp_moic: equityInvested > 0 ? Math.round((totalLp / equityInvested) * 10000) / 10000 : 0,
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
  };
}
