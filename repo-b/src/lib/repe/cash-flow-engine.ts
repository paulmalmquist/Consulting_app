// Pure, deterministic cash-flow engine for the REPE golden-path harness.
// No side effects. No I/O. No randomness.

import type {
  OperatingPeriod,
  SaleEvent,
  FundTerms,
  InvestmentTerms,
  WaterfallTerms,
} from "./golden-path-data";

// ─── Types ─────────────────────────────────────────────────────────────────

export type PeriodCashFlow = {
  quarterLabel: string;
  year: number;
  q: number;
  // Asset level
  noi: number;
  capex: number;
  debtService: number;
  operatingCashToEquity: number; // noi - capex - debtService
  saleProceeds: number;          // 0 except sale quarter
  totalCashToEquity: number;     // operating + sale
};

export type InvestmentCashFlow = {
  quarterLabel: string;
  year: number;
  q: number;
  fundShare: number;      // totalCashToEquity × fundOwnershipPct
  coInvestShare: number;  // totalCashToEquity × coInvestPct
  totalDistributed: number;
};

export type FundCashFlow = {
  quarterLabel: string;
  year: number;
  q: number;
  grossCashFlow: number;     // sum across all investments
  managementFee: number;     // negative
  netCashFlow: number;       // gross - fees
};

export type WaterfallPeriod = {
  quarterLabel: string;
  year: number;
  q: number;
  distributable: number;
  lpShare: number;
  gpShare: number;
  // tier breakdown
  returnOfCapitalLp: number;
  returnOfCapitalGp: number;
  prefAccruedThisPeriod: number;
  prefPaidThisPeriod: number;
  catchUpGp: number;
  tier1Lp: number;
  tier1Gp: number;
  tier2Lp: number;
  tier2Gp: number;
  tier3Lp: number;
  tier3Gp: number;
};

export type ReturnMetrics = {
  irr: number;         // annualized
  tvpi: number;        // total value / paid-in
  dpi: number;         // distributions / paid-in (realized)
  rvpi: number;        // residual value / paid-in (unrealized, 0 at exit)
  moic: number;        // same as tvpi
  equity: number;      // total equity invested
  totalDistributed: number;
};

export type FeeSchedule = {
  managementFeePct: number;  // annual % of committed capital
  committedCapital: number;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function r(v: number): number {
  return Math.round(v * 100) / 100;
}

// Newton-Raphson IRR solver on quarterly cash flows; returns annual IRR
function solveIRR(quarterlyFlows: number[]): number {
  let rate = 0.02; // initial guess: 2% per quarter
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < quarterlyFlows.length; t++) {
      const factor = Math.pow(1 + rate, t);
      npv += quarterlyFlows[t] / factor;
      dnpv -= t * quarterlyFlows[t] / (factor * (1 + rate));
    }
    if (Math.abs(dnpv) < 1e-12) break;
    const delta = npv / dnpv;
    rate -= delta;
    if (Math.abs(delta) < 1e-10) break;
  }
  // Convert quarterly rate to annual
  return Math.pow(1 + rate, 4) - 1;
}

// ─── Step 1: Asset cash flows ──────────────────────────────────────────────

export function computeAssetCashFlows(
  periods: OperatingPeriod[],
  saleEvent: SaleEvent
): PeriodCashFlow[] {
  return periods.map((p) => {
    const isSalePeriod = p.quarter.label === saleEvent.quarter.label;
    const saleProceeds = isSalePeriod ? saleEvent.netSaleProceeds : 0;
    const operatingCashToEquity = r(p.noi - p.capex - p.debtService);
    const totalCashToEquity = r(operatingCashToEquity + saleProceeds);

    return {
      quarterLabel: p.quarter.label,
      year: p.quarter.year,
      q: p.quarter.q,
      noi: r(p.noi),
      capex: r(p.capex),
      debtService: r(p.debtService),
      operatingCashToEquity,
      saleProceeds: r(saleProceeds),
      totalCashToEquity,
    };
  });
}

// ─── Step 2: Roll to investment (JV) level ─────────────────────────────────

export function rollToInvestment(
  assetCFs: PeriodCashFlow[],
  investment: InvestmentTerms
): InvestmentCashFlow[] {
  return assetCFs.map((cf) => {
    const fundShare = r(cf.totalCashToEquity * investment.fundOwnershipPct);
    const coInvestShare = r(cf.totalCashToEquity * investment.coInvestPct);
    return {
      quarterLabel: cf.quarterLabel,
      year: cf.year,
      q: cf.q,
      fundShare,
      coInvestShare,
      totalDistributed: r(fundShare + coInvestShare),
    };
  });
}

// ─── Step 3: Roll to fund level (gross) ────────────────────────────────────
// In a multi-asset fund this sums across investments. Here we have one investment.

export function rollToFund(
  investmentCFs: InvestmentCashFlow[][]
): { quarterLabel: string; year: number; q: number; grossCashFlow: number }[] {
  // Assumes all arrays have same length and quarter alignment
  const template = investmentCFs[0];
  return template.map((_, i) => {
    const grossCashFlow = r(
      investmentCFs.reduce((sum, inv) => sum + inv[i].fundShare, 0)
    );
    return {
      quarterLabel: template[i].quarterLabel,
      year: template[i].year,
      q: template[i].q,
      grossCashFlow,
    };
  });
}

// ─── Step 4: Apply management fees ────────────────────────────────────────

export function applyFees(
  grossCFs: { quarterLabel: string; year: number; q: number; grossCashFlow: number }[],
  feeSchedule: FeeSchedule
): FundCashFlow[] {
  const quarterlyFee = r(
    feeSchedule.committedCapital * feeSchedule.managementFeePct / 4
  );
  return grossCFs.map((cf) => {
    const managementFee = quarterlyFee; // constant for simplicity
    const netCashFlow = r(cf.grossCashFlow - managementFee);
    return {
      quarterLabel: cf.quarterLabel,
      year: cf.year,
      q: cf.q,
      grossCashFlow: cf.grossCashFlow,
      managementFee: r(managementFee),
      netCashFlow,
    };
  });
}

// ─── Step 5: Waterfall ─────────────────────────────────────────────────────
// Full LP/GP waterfall with compounding pref, 50/50 catch-up, tiered splits.
// Applied to each period's distributable cash cumulatively.

type WaterfallState = {
  lpCapitalOutstanding: number; // LP capital not yet returned
  gpCapitalOutstanding: number;
  prefAccrued: number;          // cumulative pref owed to LP, compounding quarterly
  catchUpOwed: number;          // GP catch-up remaining
};

export function computeWaterfall(
  fundCFs: FundCashFlow[],
  investedEquity: { lpEquity: number; gpEquity: number },
  terms: WaterfallTerms
): WaterfallPeriod[] {
  const state: WaterfallState = {
    lpCapitalOutstanding: investedEquity.lpEquity,
    gpCapitalOutstanding: investedEquity.gpEquity,
    prefAccrued: 0,
    catchUpOwed: 0,
  };

  const quarterlyPrefRate = terms.prefRate / 4;

  return fundCFs.map((cf) => {
    // Accrue quarterly pref on LP capital outstanding
    const prefAccruedThisPeriod = r(
      (state.lpCapitalOutstanding + state.prefAccrued) * quarterlyPrefRate
    );
    state.prefAccrued = r(state.prefAccrued + prefAccruedThisPeriod);

    let distributable = cf.netCashFlow;
    if (distributable <= 0) {
      return {
        quarterLabel: cf.quarterLabel,
        year: cf.year,
        q: cf.q,
        distributable: 0,
        lpShare: 0,
        gpShare: 0,
        returnOfCapitalLp: 0,
        returnOfCapitalGp: 0,
        prefAccruedThisPeriod,
        prefPaidThisPeriod: 0,
        catchUpGp: 0,
        tier1Lp: 0,
        tier1Gp: 0,
        tier2Lp: 0,
        tier2Gp: 0,
        tier3Lp: 0,
        tier3Gp: 0,
      };
    }

    let returnOfCapitalLp = 0;
    let returnOfCapitalGp = 0;
    let prefPaidThisPeriod = 0;
    let catchUpGp = 0;
    let tier1Lp = 0;
    let tier1Gp = 0;
    let tier2Lp = 0;
    let tier2Gp = 0;
    let tier3Lp = 0;
    let tier3Gp = 0;

    // Tier 0: Return of LP capital
    if (distributable > 0 && state.lpCapitalOutstanding > 0) {
      const pay = Math.min(distributable, state.lpCapitalOutstanding);
      returnOfCapitalLp = r(pay);
      state.lpCapitalOutstanding = r(state.lpCapitalOutstanding - pay);
      distributable = r(distributable - pay);
    }

    // Tier 0b: Return of GP capital
    if (distributable > 0 && state.gpCapitalOutstanding > 0) {
      const pay = Math.min(distributable, state.gpCapitalOutstanding);
      returnOfCapitalGp = r(pay);
      state.gpCapitalOutstanding = r(state.gpCapitalOutstanding - pay);
      distributable = r(distributable - pay);
    }

    // Tier 1: Preferred return to LP (8% compounding)
    if (distributable > 0 && state.prefAccrued > 0) {
      const pay = Math.min(distributable, state.prefAccrued);
      prefPaidThisPeriod = r(pay);
      state.prefAccrued = r(state.prefAccrued - pay);
      distributable = r(distributable - pay);
    }

    // Tier 2: GP catch-up (50/50 split until GP is whole on promote)
    // Catch-up target: GP needs (gpSplit/lpSplit) × prefPaid to be caught up
    if (distributable > 0 && prefPaidThisPeriod > 0) {
      const catchUpTarget = r(prefPaidThisPeriod * (terms.tier1SplitGp / terms.tier1SplitLp));
      state.catchUpOwed = r(state.catchUpOwed + catchUpTarget);
      const pay = Math.min(distributable, state.catchUpOwed);
      catchUpGp = r(pay * terms.catchUpGpPct);
      const catchUpLpAmount = r(pay * (1 - terms.catchUpGpPct));
      tier1Lp += catchUpLpAmount;
      state.catchUpOwed = r(state.catchUpOwed - pay);
      distributable = r(distributable - pay);
    }

    // Tier 3: 80/20 LP/GP split on remaining residual
    if (distributable > 0) {
      const gpAmount = r(distributable * terms.tier1SplitGp);
      const lpAmount = r(distributable - gpAmount);
      tier1Lp += lpAmount;
      tier1Gp = r(tier1Gp + gpAmount);
      distributable = 0;
    }

    const lpShare = r(returnOfCapitalLp + prefPaidThisPeriod + tier1Lp + tier2Lp + tier3Lp);
    const gpShare = r(returnOfCapitalGp + catchUpGp + tier1Gp + tier2Gp + tier3Gp);

    return {
      quarterLabel: cf.quarterLabel,
      year: cf.year,
      q: cf.q,
      distributable: cf.netCashFlow,
      lpShare,
      gpShare,
      returnOfCapitalLp,
      returnOfCapitalGp,
      prefAccruedThisPeriod,
      prefPaidThisPeriod,
      catchUpGp,
      tier1Lp,
      tier1Gp,
      tier2Lp,
      tier2Gp,
      tier3Lp,
      tier3Gp,
    };
  });
}

// ─── Step 6: Return metrics ────────────────────────────────────────────────

export function computeReturns(
  cashFlows: FundCashFlow[],
  investedEquity: number,
  saleQuarterLabel: string
): ReturnMetrics {
  // Build quarterly cash flow series for IRR
  // t=0: -investedEquity
  // t=1..n: netCashFlow per quarter
  const quarterlyFlows: number[] = [-investedEquity];
  for (const cf of cashFlows) {
    quarterlyFlows.push(cf.netCashFlow);
  }

  const irr = solveIRR(quarterlyFlows);
  const totalDistributed = r(cashFlows.reduce((sum, cf) => sum + cf.netCashFlow, 0));
  const tvpi = r(totalDistributed / investedEquity);
  const dpi = tvpi; // fully realized at exit
  const rvpi = 0;

  return {
    irr,
    tvpi,
    dpi,
    rvpi,
    moic: tvpi,
    equity: investedEquity,
    totalDistributed,
  };
}

export function computeReturnsFromWaterfall(
  waterfallPeriods: WaterfallPeriod[],
  lpEquity: number,
  gpEquity: number
): { lp: ReturnMetrics; gp: ReturnMetrics } {
  const lpFlows: number[] = [-lpEquity];
  const gpFlows: number[] = [-gpEquity];

  for (const wp of waterfallPeriods) {
    lpFlows.push(wp.lpShare);
    gpFlows.push(wp.gpShare);
  }

  const lpIrr = solveIRR(lpFlows);
  const gpIrr = solveIRR(gpFlows);

  const lpDist = r(waterfallPeriods.reduce((sum, wp) => sum + wp.lpShare, 0));
  const gpDist = r(waterfallPeriods.reduce((sum, wp) => sum + wp.gpShare, 0));

  return {
    lp: {
      irr: lpIrr,
      tvpi: r(lpDist / lpEquity),
      dpi: r(lpDist / lpEquity),
      rvpi: 0,
      moic: r(lpDist / lpEquity),
      equity: lpEquity,
      totalDistributed: lpDist,
    },
    gp: {
      irr: gpIrr,
      tvpi: r(gpDist / gpEquity),
      dpi: r(gpDist / gpEquity),
      rvpi: 0,
      moic: r(gpDist / gpEquity),
      equity: gpEquity,
      totalDistributed: gpDist,
    },
  };
}
