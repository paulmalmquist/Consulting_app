/**
 * Pure, stateless valuation math for RE assets.
 * Port of backend/app/services/re_math.py — same semantics, same outputs.
 * All monetary values are plain numbers (float64). No side effects.
 */

// ---------------------------------------------------------------------------
// Direct Cap
// ---------------------------------------------------------------------------

export function calculateValueDirectCap(forwardNoi: number, capRate: number): number {
  if (capRate <= 0) throw new Error(`Cap rate must be positive, got ${capRate}`);
  return forwardNoi / capRate;
}

// ---------------------------------------------------------------------------
// DCF
// ---------------------------------------------------------------------------

export function calculateValueDcf(
  baseNoi: number,
  rentGrowth: number,
  expenseGrowth: number,
  vacancyAssumption: number,
  exitCapRate: number,
  discountRate: number,
  holdYears = 10,
  capexReservePct = 0,
  baseExpenses?: number,
  baseGpr?: number,
): number {
  if (exitCapRate <= 0) throw new Error(`Exit cap rate must be positive, got ${exitCapRate}`);
  if (discountRate <= 0) throw new Error(`Discount rate must be positive, got ${discountRate}`);

  let pvTotal = 0;
  let terminalNoi: number;

  if (baseGpr != null && baseExpenses != null) {
    let gpr = baseGpr;
    let expenses = baseExpenses;
    for (let year = 1; year <= holdYears; year++) {
      gpr *= 1 + rentGrowth;
      expenses *= 1 + expenseGrowth;
      const egi = gpr * (1 - vacancyAssumption);
      const noi = egi - expenses;
      const capex = noi * capexReservePct;
      const cf = noi - capex;
      pvTotal += cf / Math.pow(1 + discountRate, year);
    }
    terminalNoi = gpr * (1 + rentGrowth) * (1 - vacancyAssumption) - expenses * (1 + expenseGrowth);
  } else {
    let noi = baseNoi;
    for (let year = 1; year <= holdYears; year++) {
      noi *= 1 + rentGrowth;
      const capex = noi * capexReservePct;
      const cf = noi - capex;
      pvTotal += cf / Math.pow(1 + discountRate, year);
    }
    terminalNoi = noi * (1 + rentGrowth);
  }

  const terminalValue = terminalNoi / exitCapRate;
  pvTotal += terminalValue / Math.pow(1 + discountRate, holdYears);

  return pvTotal;
}

// ---------------------------------------------------------------------------
// Blended
// ---------------------------------------------------------------------------

export function calculateValueBlended(
  valueCap: number,
  valueDcf: number,
  weightCap: number,
  weightDcf: number,
): number {
  const totalWeight = weightCap + weightDcf;
  if (totalWeight <= 0) throw new Error("Method weights must sum to positive");
  return (valueCap * weightCap + valueDcf * weightDcf) / totalWeight;
}

// ---------------------------------------------------------------------------
// Equity & debt metrics
// ---------------------------------------------------------------------------

export function calculateEquityValue(grossValue: number, loanBalance: number): number {
  return grossValue - loanBalance;
}

export function calculateLtv(loanBalance: number, grossValue: number): number {
  if (grossValue <= 0) throw new Error(`Gross value must be positive, got ${grossValue}`);
  return loanBalance / grossValue;
}

export function calculateDscr(noi: number, debtService: number): number {
  if (debtService <= 0) throw new Error(`Debt service must be positive, got ${debtService}`);
  return noi / debtService;
}

export function calculateDebtYield(noi: number, loanBalance: number): number {
  if (loanBalance <= 0) throw new Error(`Loan balance must be positive, got ${loanBalance}`);
  return noi / loanBalance;
}

// ---------------------------------------------------------------------------
// Cap rate sensitivity
// ---------------------------------------------------------------------------

export type CapRateSensitivityRow = {
  cap_rate_delta_bps: number;
  cap_rate: number;
  implied_value: number;
  equity_value: number;
  ltv: number;
};

export function computeCapRateSensitivity(
  forwardNoi: number,
  loanBalance: number,
  debtService: number,
  baseCapRate: number,
): CapRateSensitivityRow[] {
  const rows: CapRateSensitivityRow[] = [];
  for (const deltaBps of [-100, -50, -25, 0, 25, 50, 100]) {
    const shockedCap = baseCapRate + deltaBps / 10000;
    if (shockedCap <= 0) continue;
    const val = calculateValueDirectCap(forwardNoi, shockedCap);
    const eq = calculateEquityValue(val, loanBalance);
    const ltv = calculateLtv(loanBalance, val);
    rows.push({
      cap_rate_delta_bps: deltaBps,
      cap_rate: shockedCap,
      implied_value: val,
      equity_value: eq,
      ltv,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Input hashing for reproducibility
// ---------------------------------------------------------------------------

export async function computeInputHash(data: Record<string, unknown>): Promise<string> {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Full valuation computation from inputs
// ---------------------------------------------------------------------------

export type ValuationInputs = {
  cap_rate: number;
  exit_cap_rate?: number;
  discount_rate?: number;
  rent_growth?: number;
  expense_growth?: number;
  vacancy?: number;
  weight_direct_cap?: number;
  weight_dcf?: number;
  forward_noi_override?: number;
  hold_years?: number;
};

export type ValuationResult = {
  forward_noi: number;
  value_direct_cap: number;
  value_dcf: number | null;
  value_blended: number;
  equity_value: number;
  ltv: number | null;
  dscr: number | null;
  debt_yield: number | null;
  sensitivity: CapRateSensitivityRow[];
  valuation_method: string;
};

export function computeFullValuation(
  inputs: ValuationInputs,
  currentNoi: number,
  debtBalance: number,
  debtService: number,
): ValuationResult {
  const forwardNoi = inputs.forward_noi_override ?? currentNoi * 4; // annualize quarterly NOI
  const capRate = inputs.cap_rate;
  const exitCap = inputs.exit_cap_rate ?? capRate + 0.005;
  const discountRate = inputs.discount_rate ?? 0.09;
  const rentGrowth = inputs.rent_growth ?? 0.025;
  const expenseGrowth = inputs.expense_growth ?? 0.02;
  const vacancy = inputs.vacancy ?? 0.05;
  const weightCap = inputs.weight_direct_cap ?? 0.5;
  const weightDcf = inputs.weight_dcf ?? 0.5;
  const holdYears = inputs.hold_years ?? 10;

  const valueDirectCap = calculateValueDirectCap(forwardNoi, capRate);

  let valueDcf: number | null = null;
  let valueBlended = valueDirectCap;
  let valuationMethod = "direct_cap";

  if (weightDcf > 0) {
    valueDcf = calculateValueDcf(
      forwardNoi,
      rentGrowth,
      expenseGrowth,
      vacancy,
      exitCap,
      discountRate,
      holdYears,
    );
    valueBlended = calculateValueBlended(valueDirectCap, valueDcf, weightCap, weightDcf);
    valuationMethod = weightCap > 0 && weightDcf > 0 ? "blended" : "dcf";
  }

  const equityValue = calculateEquityValue(valueBlended, debtBalance);
  const ltv = valueBlended > 0 ? calculateLtv(debtBalance, valueBlended) : null;
  const dscr = debtService > 0 ? calculateDscr(forwardNoi, debtService * 4) : null; // annualize
  const debtYield = debtBalance > 0 ? calculateDebtYield(forwardNoi, debtBalance) : null;

  const sensitivity = computeCapRateSensitivity(forwardNoi, debtBalance, debtService, capRate);

  return {
    forward_noi: forwardNoi,
    value_direct_cap: valueDirectCap,
    value_dcf: valueDcf,
    value_blended: valueBlended,
    equity_value: equityValue,
    ltv,
    dscr,
    debt_yield: debtYield,
    sensitivity,
    valuation_method: valuationMethod,
  };
}
