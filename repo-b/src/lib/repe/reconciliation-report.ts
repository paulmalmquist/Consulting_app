// Reconciliation report generators for the golden-path waterfall harness.
// All functions are pure — no side effects, no I/O.

import type { PeriodCashFlow, InvestmentCashFlow, FundCashFlow, WaterfallPeriod, ReturnMetrics } from "./cash-flow-engine";

// ─── Types ─────────────────────────────────────────────────────────────────

export type ReconciliationRow = {
  quarterLabel: string;
  year: number;
  q: number;
  // Asset
  assetNOI: number;
  assetCapex: number;
  assetDebtService: number;
  assetCashToEquity: number;
  assetSaleProceeds: number;
  assetTotal: number;
  // Investment JV
  investmentFundShare: number;
  investmentCoInvestShare: number;
  // Fund gross
  fundGross: number;
  fundMgmtFee: number;
  fundNet: number;
  // Waterfall
  lpShare: number;
  gpShare: number;
  lpPct: number;
  gpPct: number;
};

export type LTDSummary = {
  totalAssetNOI: number;
  totalAssetCapex: number;
  totalAssetDebtService: number;
  totalAssetOperatingCashToEquity: number;
  totalAssetSaleProceeds: number;
  totalAssetCashToEquity: number;
  totalFundGross: number;
  totalMgmtFees: number;
  totalFundNet: number;
  totalLpDistributed: number;
  totalGpDistributed: number;
  totalDistributed: number;
  lpPct: number;
  gpPct: number;
};

export type GrossToNetBridge = {
  grossIRR: number;
  grossTVPI: number;
  mgmtFeeIRRDrag: number;
  mgmtFeeTVPIDrag: number;
  netIRR: number;
  netTVPI: number;
  totalFeesCharged: number;
  feesAssetPctOfGross: number;
};

export type WaterfallTierAudit = {
  returnOfCapitalLp: number;
  returnOfCapitalGp: number;
  totalReturnOfCapital: number;
  prefAccruedTotal: number;
  prefPaidTotal: number;
  prefUnpaid: number;
  catchUpGpTotal: number;
  tier1LpTotal: number;
  tier1GpTotal: number;
  tier2LpTotal: number;
  tier2GpTotal: number;
  tier3LpTotal: number;
  tier3GpTotal: number;
  grandTotalLp: number;
  grandTotalGp: number;
  grandTotal: number;
  checksum: number; // should be ≈ 0 (total - LP - GP)
};

// ─── Period-by-period reconciliation ──────────────────────────────────────

export function buildReconciliationTable(
  assetCFs: PeriodCashFlow[],
  investmentCFs: InvestmentCashFlow[],
  fundCFs: FundCashFlow[],
  waterfallPeriods: WaterfallPeriod[]
): ReconciliationRow[] {
  return assetCFs.map((acf, i) => {
    const inv = investmentCFs[i];
    const fund = fundCFs[i];
    const wf = waterfallPeriods[i];
    const distributable = wf.distributable;
    return {
      quarterLabel: acf.quarterLabel,
      year: acf.year,
      q: acf.q,
      assetNOI: acf.noi,
      assetCapex: acf.capex,
      assetDebtService: acf.debtService,
      assetCashToEquity: acf.operatingCashToEquity,
      assetSaleProceeds: acf.saleProceeds,
      assetTotal: acf.totalCashToEquity,
      investmentFundShare: inv.fundShare,
      investmentCoInvestShare: inv.coInvestShare,
      fundGross: fund.grossCashFlow,
      fundMgmtFee: fund.managementFee,
      fundNet: fund.netCashFlow,
      lpShare: wf.lpShare,
      gpShare: wf.gpShare,
      lpPct: distributable > 0 ? wf.lpShare / distributable : 0,
      gpPct: distributable > 0 ? wf.gpShare / distributable : 0,
    };
  });
}

// ─── LTD summary ──────────────────────────────────────────────────────────

export function buildLTDSummary(rows: ReconciliationRow[]): LTDSummary {
  const sum = (fn: (r: ReconciliationRow) => number) =>
    rows.reduce((acc, r) => acc + fn(r), 0);

  const totalLpDistributed = sum((r) => r.lpShare);
  const totalGpDistributed = sum((r) => r.gpShare);
  const totalDistributed = totalLpDistributed + totalGpDistributed;

  return {
    totalAssetNOI: sum((r) => r.assetNOI),
    totalAssetCapex: sum((r) => r.assetCapex),
    totalAssetDebtService: sum((r) => r.assetDebtService),
    totalAssetOperatingCashToEquity: sum((r) => r.assetCashToEquity),
    totalAssetSaleProceeds: sum((r) => r.assetSaleProceeds),
    totalAssetCashToEquity: sum((r) => r.assetTotal),
    totalFundGross: sum((r) => r.fundGross),
    totalMgmtFees: sum((r) => r.fundMgmtFee),
    totalFundNet: sum((r) => r.fundNet),
    totalLpDistributed,
    totalGpDistributed,
    totalDistributed,
    lpPct: totalDistributed > 0 ? totalLpDistributed / totalDistributed : 0,
    gpPct: totalDistributed > 0 ? totalGpDistributed / totalDistributed : 0,
  };
}

// ─── Gross-to-net bridge ──────────────────────────────────────────────────

export function buildGrossToNetBridge(
  grossReturns: ReturnMetrics,
  netReturns: ReturnMetrics,
  totalFeesCharged: number
): GrossToNetBridge {
  return {
    grossIRR: grossReturns.irr,
    grossTVPI: grossReturns.tvpi,
    mgmtFeeIRRDrag: grossReturns.irr - netReturns.irr,
    mgmtFeeTVPIDrag: grossReturns.tvpi - netReturns.tvpi,
    netIRR: netReturns.irr,
    netTVPI: netReturns.tvpi,
    totalFeesCharged,
    feesAssetPctOfGross: grossReturns.totalDistributed > 0
      ? totalFeesCharged / grossReturns.totalDistributed
      : 0,
  };
}

// ─── Waterfall tier audit ─────────────────────────────────────────────────

export function buildWaterfallTierAudit(wfPeriods: WaterfallPeriod[]): WaterfallTierAudit {
  const sum = (fn: (wp: WaterfallPeriod) => number) =>
    wfPeriods.reduce((acc, wp) => acc + fn(wp), 0);

  const rocLp = sum((wp) => wp.returnOfCapitalLp);
  const rocGp = sum((wp) => wp.returnOfCapitalGp);
  const prefAccrued = sum((wp) => wp.prefAccruedThisPeriod);
  const prefPaid = sum((wp) => wp.prefPaidThisPeriod);
  const catchUp = sum((wp) => wp.catchUpGp);
  const t1Lp = sum((wp) => wp.tier1Lp);
  const t1Gp = sum((wp) => wp.tier1Gp);
  const t2Lp = sum((wp) => wp.tier2Lp);
  const t2Gp = sum((wp) => wp.tier2Gp);
  const t3Lp = sum((wp) => wp.tier3Lp);
  const t3Gp = sum((wp) => wp.tier3Gp);

  const grandTotalLp = rocLp + prefPaid + t1Lp + t2Lp + t3Lp;
  const grandTotalGp = rocGp + catchUp + t1Gp + t2Gp + t3Gp;
  const grandTotal = grandTotalLp + grandTotalGp;
  const totalDistributable = sum((wp) => Math.max(0, wp.distributable));
  const checksum = Math.abs(totalDistributable - grandTotal);

  return {
    returnOfCapitalLp: rocLp,
    returnOfCapitalGp: rocGp,
    totalReturnOfCapital: rocLp + rocGp,
    prefAccruedTotal: prefAccrued,
    prefPaidTotal: prefPaid,
    prefUnpaid: Math.max(0, prefAccrued - prefPaid),
    catchUpGpTotal: catchUp,
    tier1LpTotal: t1Lp,
    tier1GpTotal: t1Gp,
    tier2LpTotal: t2Lp,
    tier2GpTotal: t2Gp,
    tier3LpTotal: t3Lp,
    tier3GpTotal: t3Gp,
    grandTotalLp,
    grandTotalGp,
    grandTotal,
    checksum,
  };
}

// ─── Formatting helpers ────────────────────────────────────────────────────

export function formatMoney(n: number, decimals = 0): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(decimals === 0 ? 1 : decimals)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  }
  return `${sign}$${abs.toFixed(decimals)}`;
}

export function formatPct(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}
