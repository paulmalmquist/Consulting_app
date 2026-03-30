import type { ResumeScenarioInputs } from "@/lib/bos-api";
import type { ResumeModelAssumptions } from "@/lib/resume/workspace";
import type { ResumeScenarioOutputs } from "./modelingMath";

export type ModelingEvent = {
  event_id: string;
  year: number;
  type: "acquisition" | "distribution" | "refi" | "sale";
  label: string;
  amount: number;
  details: Record<string, number>;
};

export function buildEventTimeline(
  inputs: ResumeScenarioInputs,
  assumptions: ResumeModelAssumptions,
  outputs: ResumeScenarioOutputs,
): ModelingEvent[] {
  const events: ModelingEvent[] = [];
  const saleYear = inputs.sale_year ?? inputs.hold_period;
  const refiYear = inputs.refi_year ?? null;

  const debtAmount = inputs.purchase_price * inputs.debt_pct;
  events.push({
    event_id: "acquisition",
    year: 0,
    type: "acquisition",
    label: "Acquisition",
    amount: -inputs.purchase_price,
    details: {
      equity: outputs.equityInvested,
      debt: debtAmount,
      purchase_price: inputs.purchase_price,
    },
  });

  for (const row of outputs.annualCashFlows) {
    if (row.year > saleYear) break;
    if (row.cashFlowToEquity > 0 && row.netSaleProceeds === 0) {
      events.push({
        event_id: `dist-yr-${row.year}`,
        year: row.year,
        type: "distribution",
        label: `Year ${row.year} Cash Flow`,
        amount: row.cashFlowToEquity,
        details: {
          noi: row.noi,
          debt_service: row.debtService,
          net: row.cashFlowToEquity,
        },
      });
    }
  }

  if (refiYear && refiYear <= saleYear) {
    const refiDebtPct = inputs.refi_debt_pct ?? inputs.debt_pct;
    const newDebt = inputs.purchase_price * refiDebtPct;
    events.push({
      event_id: "refi",
      year: refiYear,
      type: "refi",
      label: "Refinance",
      amount: newDebt - debtAmount,
      details: {
        old_debt: debtAmount,
        new_debt: newDebt,
        proceeds: newDebt - debtAmount,
      },
    });
  }

  const saleRow = outputs.annualCashFlows.find((r) => r.year === saleYear);
  if (saleRow && saleRow.terminalValue > 0) {
    events.push({
      event_id: "sale",
      year: saleYear,
      type: "sale",
      label: "Disposition",
      amount: saleRow.netSaleProceeds,
      details: {
        terminal_value: saleRow.terminalValue,
        net_proceeds: saleRow.netSaleProceeds,
        debt_payoff: inputs.purchase_price * (inputs.refi_debt_pct ?? inputs.debt_pct),
      },
    });
  }

  return events.sort((a, b) => a.year - b.year);
}

export type EquityPositionPoint = {
  year: number;
  cumulative: number;
};

export function buildEquityPositionSeries(outputs: ResumeScenarioOutputs): EquityPositionPoint[] {
  let cumulative = -outputs.equityInvested;
  const points: EquityPositionPoint[] = [{ year: 0, cumulative }];

  for (const row of outputs.annualCashFlows) {
    cumulative += row.cashFlowToEquity;
    points.push({ year: row.year, cumulative });
  }

  return points;
}
