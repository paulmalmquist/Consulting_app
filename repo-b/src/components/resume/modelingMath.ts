"use client";

import type { ResumeScenarioInputs } from "@/lib/bos-api";
import type { ResumeModelAssumptions } from "@/lib/resume/workspace";

export type ResumeScenarioOutputs = {
  irr: number;
  tvpi: number;
  equityInvested: number;
  annualCashFlows: Array<{
    year: number;
    noi: number;
    debtService: number;
    cashFlowToEquity: number;
    terminalValue: number;
    netSaleProceeds: number;
  }>;
  waterfall: Array<{
    name: string;
    value: number;
    isTotal?: boolean;
  }>;
  lpDistribution: number;
  gpDistribution: number;
  lpPct: number;
  gpPct: number;
};

export function computeIrr(cashFlows: number[]): number {
  let low = -0.99;
  let high = 2.5;

  const npv = (rate: number) =>
    cashFlows.reduce((sum, cashFlow, index) => sum + cashFlow / Math.pow(1 + rate, index), 0);

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 1e-7) return mid;
    if (value > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

export function computeResumeScenario(
  inputs: ResumeScenarioInputs,
  assumptions: ResumeModelAssumptions,
): ResumeScenarioOutputs {
  const saleYear = inputs.sale_year ?? inputs.hold_period;
  const refiYear = inputs.refi_year ?? null;
  const refiDebtPct = inputs.refi_debt_pct ?? inputs.debt_pct;

  const equityInvested = inputs.purchase_price * (1 - inputs.debt_pct);
  let debtAmount = inputs.purchase_price * inputs.debt_pct;
  const initialNoi = inputs.purchase_price * assumptions.entry_cap_rate;
  let debtService = debtAmount * assumptions.debt_rate;

  const annualCashFlows: ResumeScenarioOutputs["annualCashFlows"] = [];
  const equityCashFlowSeries = [-equityInvested];
  let totalDistributions = 0;

  for (let year = 1; year <= inputs.hold_period; year += 1) {
    // Handle refinance event
    if (refiYear && year === refiYear) {
      debtAmount = inputs.purchase_price * refiDebtPct;
      debtService = debtAmount * assumptions.debt_rate;
    }

    const noi = initialNoi * Math.pow(1 + inputs.noi_growth_pct, year - 1);
    const isSaleYear = year === saleYear;
    const terminalNoi = initialNoi * Math.pow(1 + inputs.noi_growth_pct, year);
    const terminalValue = isSaleYear ? terminalNoi / Math.max(inputs.exit_cap_rate, 0.0001) : 0;
    const netSaleProceeds = isSaleYear
      ? terminalValue * (1 - assumptions.exit_cost_pct) - debtAmount
      : 0;
    const cashFlowToEquity = noi - debtService + netSaleProceeds;

    annualCashFlows.push({
      year,
      noi,
      debtService,
      cashFlowToEquity,
      terminalValue,
      netSaleProceeds,
    });
    totalDistributions += Math.max(0, cashFlowToEquity);
    equityCashFlowSeries.push(cashFlowToEquity);

    // Stop generating cash flows after sale
    if (isSaleYear && year < inputs.hold_period) {
      for (let postYear = year + 1; postYear <= inputs.hold_period; postYear += 1) {
        annualCashFlows.push({
          year: postYear,
          noi: 0,
          debtService: 0,
          cashFlowToEquity: 0,
          terminalValue: 0,
          netSaleProceeds: 0,
        });
        equityCashFlowSeries.push(0);
      }
      break;
    }
  }

  const irr = computeIrr(equityCashFlowSeries);
  const tvpi = totalDistributions / Math.max(equityInvested, 1);

  const lpContribution = equityInvested * assumptions.lp_equity_share;
  const gpContribution = equityInvested * assumptions.gp_equity_share;
  const lpPref = lpContribution * assumptions.pref_rate * saleYear;

  let remaining = totalDistributions;

  const returnOfCapital = Math.min(remaining, equityInvested);
  remaining -= returnOfCapital;

  const preferredReturn = Math.min(remaining, lpPref);
  remaining -= preferredReturn;

  const catchUp = Math.min(remaining, preferredReturn * (assumptions.catch_up_ratio / Math.max(1 - assumptions.catch_up_ratio, 0.01)));
  remaining -= catchUp;

  const residual = Math.max(remaining, 0);
  const lpDistribution =
    returnOfCapital * assumptions.lp_equity_share +
    preferredReturn +
    residual * assumptions.residual_lp_split;
  const gpDistribution =
    returnOfCapital * assumptions.gp_equity_share +
    catchUp +
    residual * assumptions.residual_gp_split;

  return {
    irr,
    tvpi,
    equityInvested,
    annualCashFlows,
    waterfall: [
      { name: "Equity Invested", value: equityInvested },
      { name: "Return of Capital", value: returnOfCapital },
      { name: "LP Pref", value: preferredReturn },
      { name: "GP Catch-Up", value: catchUp },
      { name: "Residual Split", value: residual },
      { name: "Total Value", value: totalDistributions, isTotal: true },
    ],
    lpDistribution,
    gpDistribution,
    lpPct: totalDistributions > 0 ? lpDistribution / totalDistributions : 0,
    gpPct: totalDistributions > 0 ? gpDistribution / totalDistributions : 0,
  };
}
