// Golden-path deterministic test data for REPE waterfall validation harness.
// All numbers are fixed — no randomness, no external dependencies.

export type Quarter = {
  label: string; // e.g. "2022Q1"
  year: number;
  q: number;
};

export type OperatingPeriod = {
  quarter: Quarter;
  occupancy: number;
  baseRent: number;      // quarterly
  otherIncome: number;   // quarterly
  grossRevenue: number;  // quarterly
  opex: number;          // quarterly
  noi: number;           // quarterly
  capex: number;         // quarterly
  debtService: number;   // quarterly (interest + principal)
  interestPayment: number;
  principalPayment: number;
  loanBalance: number;   // balance at end of period
  cashToEquity: number;  // quarterly (noi - capex - debtService)
};

export type SaleEvent = {
  quarter: Quarter;
  trailingNOI: number;   // LTM NOI used to size exit cap
  exitCapRate: number;
  grossSalePrice: number;
  sellingCosts: number;  // 1.5% of gross
  netSalePrice: number;
  loanPayoff: number;
  netSaleProceeds: number; // to equity
};

export type FundTerms = {
  name: string;
  targetSize: number;
  vintageStart: number;
  vintageEnd: number;
  prefRate: number;        // 8% annual, compounding quarterly
  promoteRate: number;     // 20% above pref
  managementFeePct: number; // 1.5% of committed per year
  catchUpPct: number;       // 50% catch-up split (GP gets 50% until caught up)
};

export type InvestmentTerms = {
  name: string;
  fundOwnershipPct: number;   // 85%
  coInvestPct: number;        // 15%
  totalEquity: number;        // $28M
  fundEquity: number;
  coInvestEquity: number;
};

export type AssetTerms = {
  name: string;
  location: string;
  units: number;
  acquisitionPrice: number;
  acquisitionQuarter: Quarter;
  seniorDebt: number;
  debtRate: number;           // 4.5%
  debtIoPeriods: number;      // first 8 quarters IO
  debtAmortYears: number;     // 25yr amort after IO
  baseRentAnnual: number;     // starting rent roll (annual)
  rentGrowthRate: number;     // 3% per year
  otherIncomeAnnual: number;
  expenseRatio: number;       // 42%
  capexYears1to2: number;     // annual
  capexYearsAfter: number;    // annual
};

export type WaterfallTerms = {
  prefRate: number;              // 8% annual compounding quarterly
  catchUpGpPct: number;          // GP share during catch-up = 50%
  tier1SplitGp: number;          // 20% GP above 8% hurdle
  tier1SplitLp: number;
  tier2HurdleIrr: number;        // 12% IRR
  tier2SplitGp: number;          // 30% GP above 12%
  tier2SplitLp: number;
  tier3HurdleIrr: number;        // 18% IRR
  tier3SplitGp: number;          // 30% GP above 18%
  tier3SplitLp: number;
};

// ─── Constant definitions ──────────────────────────────────────────────────

export const FUND_TERMS: FundTerms = {
  name: "Meridian Value-Add Fund III",
  targetSize: 200_000_000,
  vintageStart: 2022,
  vintageEnd: 2029,
  prefRate: 0.08,
  promoteRate: 0.20,
  managementFeePct: 0.015,
  catchUpPct: 0.50,
};

export const INVESTMENT_TERMS: InvestmentTerms = {
  name: "Palmetto Gardens JV",
  fundOwnershipPct: 0.85,
  coInvestPct: 0.15,
  totalEquity: 28_000_000,
  fundEquity: 28_000_000 * 0.85,    // $23,800,000
  coInvestEquity: 28_000_000 * 0.15, // $4,200,000
};

export const ASSET_TERMS: AssetTerms = {
  name: "Palmetto Gardens Apartments",
  location: "West Palm Beach, FL",
  units: 240,
  acquisitionPrice: 45_000_000,
  acquisitionQuarter: { label: "2022Q1", year: 2022, q: 1 },
  seniorDebt: 32_000_000,
  debtRate: 0.045,
  debtIoPeriods: 8, // first 8 quarters (2yr IO)
  debtAmortYears: 25,
  baseRentAnnual: 4_800_000,
  rentGrowthRate: 0.03,
  otherIncomeAnnual: 200_000,
  expenseRatio: 0.42,
  capexYears1to2: 500_000,
  capexYearsAfter: 300_000,
};

export const WATERFALL_TERMS: WaterfallTerms = {
  prefRate: 0.08,
  catchUpGpPct: 0.50,
  tier1SplitGp: 0.20,
  tier1SplitLp: 0.80,
  tier2HurdleIrr: 0.12,
  tier2SplitGp: 0.30,
  tier2SplitLp: 0.70,
  tier3HurdleIrr: 0.18,
  tier3SplitGp: 0.30,
  tier3SplitLp: 0.70,
};

export const SALE_EXIT_CAP_RATE = 0.0525;
export const SELLING_COST_PCT = 0.015;

// ─── Quarter helpers ───────────────────────────────────────────────────────

export function makeQuarter(year: number, q: number): Quarter {
  return { label: `${year}Q${q}`, year, q };
}

export function quartersBetween(start: Quarter, end: Quarter): Quarter[] {
  const quarters: Quarter[] = [];
  let y = start.year;
  let q = start.q;
  while (y < end.year || (y === end.year && q <= end.q)) {
    quarters.push(makeQuarter(y, q));
    q++;
    if (q > 4) { q = 1; y++; }
  }
  return quarters;
}

export function quarterIndex(period: Quarter, start: Quarter): number {
  return (period.year - start.year) * 4 + (period.q - start.q);
}

// ─── Debt schedule ─────────────────────────────────────────────────────────

function quarterlyAmortPayment(principal: number, annualRate: number, amortYears: number): number {
  const r = annualRate / 4;
  const n = amortYears * 4;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// ─── Operating period generator ────────────────────────────────────────────

export function buildOperatingPeriods(): OperatingPeriod[] {
  const start = makeQuarter(2022, 1);
  const end = makeQuarter(2026, 4);
  const allQuarters = quartersBetween(start, end);

  const quarterlyAmort = quarterlyAmortPayment(
    ASSET_TERMS.seniorDebt,
    ASSET_TERMS.debtRate,
    ASSET_TERMS.debtAmortYears
  );
  const quarterlyInterestIO = (ASSET_TERMS.seniorDebt * ASSET_TERMS.debtRate) / 4;

  let loanBalance = ASSET_TERMS.seniorDebt;
  const periods: OperatingPeriod[] = [];

  for (const quarter of allQuarters) {
    const qi = quarterIndex(quarter, start); // 0-based
    const yearIndex = Math.floor(qi / 4);    // 0-based year

    // Occupancy: ramps from 88% to 94% over first 8 quarters, stable after
    const occupancy = qi < 8
      ? 0.88 + (0.94 - 0.88) * (qi / 7)
      : 0.94;

    // Rent growth: 3%/yr compounding
    const annualRent = ASSET_TERMS.baseRentAnnual * Math.pow(1 + ASSET_TERMS.rentGrowthRate, yearIndex);
    const quarterlyRent = annualRent / 4;
    const quarterlyOtherIncome = ASSET_TERMS.otherIncomeAnnual / 4;
    const grossRevenue = quarterlyRent + quarterlyOtherIncome;
    const opex = grossRevenue * ASSET_TERMS.expenseRatio;
    const noi = grossRevenue - opex;

    // CapEx: $500K/yr first 2 years, $300K/yr after
    const annualCapex = yearIndex < 2 ? ASSET_TERMS.capexYears1to2 : ASSET_TERMS.capexYearsAfter;
    const capex = annualCapex / 4;

    // Debt service
    let interestPayment: number;
    let principalPayment: number;
    if (qi < ASSET_TERMS.debtIoPeriods) {
      interestPayment = quarterlyInterestIO;
      principalPayment = 0;
    } else {
      interestPayment = loanBalance * (ASSET_TERMS.debtRate / 4);
      principalPayment = quarterlyAmort - interestPayment;
    }
    const debtService = interestPayment + principalPayment;
    loanBalance = Math.max(0, loanBalance - principalPayment);

    const cashToEquity = noi - capex - debtService;

    periods.push({
      quarter,
      occupancy,
      baseRent: quarterlyRent,
      otherIncome: quarterlyOtherIncome,
      grossRevenue,
      opex,
      noi,
      capex,
      debtService,
      interestPayment,
      principalPayment,
      loanBalance,
      cashToEquity,
    });
  }

  return periods;
}

// ─── Sale event ─────────────────────────────────────────────────────────────

export function buildSaleEvent(periods: OperatingPeriod[]): SaleEvent {
  const saleQuarter = makeQuarter(2026, 4);

  // Trailing 4-quarter NOI (LTM)
  const last4 = periods.slice(-4);
  const trailingNOI = last4.reduce((sum, p) => sum + p.noi, 0);

  const grossSalePrice = trailingNOI / SALE_EXIT_CAP_RATE;
  const sellingCosts = grossSalePrice * SELLING_COST_PCT;
  const netSalePrice = grossSalePrice - sellingCosts;

  // Loan payoff = last loanBalance in last period
  const loanPayoff = periods[periods.length - 1].loanBalance;
  const netSaleProceeds = netSalePrice - loanPayoff;

  return {
    quarter: saleQuarter,
    trailingNOI,
    exitCapRate: SALE_EXIT_CAP_RATE,
    grossSalePrice,
    sellingCosts,
    netSalePrice,
    loanPayoff,
    netSaleProceeds,
  };
}

// ─── Pre-built data export ───────────────────────────────────────────────────

export type GoldenPathData = {
  fundTerms: FundTerms;
  investmentTerms: InvestmentTerms;
  assetTerms: AssetTerms;
  waterfallTerms: WaterfallTerms;
  periods: OperatingPeriod[];
  saleEvent: SaleEvent;
};

export function buildGoldenPathData(): GoldenPathData {
  const periods = buildOperatingPeriods();
  const saleEvent = buildSaleEvent(periods);
  return {
    fundTerms: FUND_TERMS,
    investmentTerms: INVESTMENT_TERMS,
    assetTerms: ASSET_TERMS,
    waterfallTerms: WATERFALL_TERMS,
    periods,
    saleEvent,
  };
}
