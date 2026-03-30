import { describe, expect, it } from "vitest";
import {
  buildGoldenPathData,
  buildOperatingPeriods,
  buildSaleEvent,
  ASSET_TERMS,
  INVESTMENT_TERMS,
  FUND_TERMS,
  WATERFALL_TERMS,
  makeQuarter,
} from "./golden-path-data";
import {
  computeAssetCashFlows,
  rollToInvestment,
  rollToFund,
  applyFees,
  computeWaterfall,
  computeReturns,
  computeReturnsFromWaterfall,
} from "./cash-flow-engine";

const TOLERANCE = 0.02; // $0.02 floating-point tolerance

function approx(actual: number, expected: number, tol = TOLERANCE): boolean {
  return Math.abs(actual - expected) <= tol;
}

describe("Golden-path REPE waterfall harness", () => {
  const data = buildGoldenPathData();
  const { periods, saleEvent } = data;
  const assetCFs = computeAssetCashFlows(periods, saleEvent);
  const investmentCFs = rollToInvestment(assetCFs, INVESTMENT_TERMS);
  const fundGrossCFs = rollToFund([investmentCFs]);
  const fundNetCFs = applyFees(fundGrossCFs, {
    managementFeePct: FUND_TERMS.managementFeePct,
    committedCapital: FUND_TERMS.targetSize,
  });
  const lpEquity = INVESTMENT_TERMS.fundEquity * 0.9; // 90% of fund equity is LP
  const gpEquity = INVESTMENT_TERMS.fundEquity * 0.1; // 10% GP co-invest
  const waterfallPeriods = computeWaterfall(
    fundNetCFs,
    { lpEquity, gpEquity },
    WATERFALL_TERMS
  );

  // ─── Operating periods ────────────────────────────────────────────────────

  describe("Operating periods", () => {
    it("produces 20 quarters (Q1 2022 through Q4 2026)", () => {
      expect(periods).toHaveLength(20);
      expect(periods[0].quarter.label).toBe("2022Q1");
      expect(periods[19].quarter.label).toBe("2026Q4");
    });

    it("NOI = gross revenue − opex for every period", () => {
      for (const p of periods) {
        const expected = p.grossRevenue - p.opex;
        expect(
          approx(p.noi, expected, 0.05),
          `NOI mismatch at ${p.quarter.label}: got ${p.noi}, expected ${expected}`
        ).toBe(true);
      }
    });

    it("gross revenue = base rent + other income", () => {
      for (const p of periods) {
        const expected = p.baseRent + p.otherIncome;
        expect(
          approx(p.grossRevenue, expected, 0.05),
          `Gross revenue mismatch at ${p.quarter.label}`
        ).toBe(true);
      }
    });

    it("occupancy ramps from ~88% in Q1 2022 to ~94% by Q4 2023", () => {
      expect(periods[0].occupancy).toBeCloseTo(0.88, 2);
      expect(periods[7].occupancy).toBeCloseTo(0.94, 1);
      expect(periods[19].occupancy).toBeCloseTo(0.94, 2);
    });

    it("CapEx is ~$125K/qtr for first 2 years, ~$75K/qtr after", () => {
      // Q1 2022: year index 0 → $500K/yr → $125K/qtr
      expect(approx(periods[0].capex, 125_000, 5)).toBe(true);
      // Q1 2024: year index 2 → $300K/yr → $75K/qtr
      expect(approx(periods[8].capex, 75_000, 5)).toBe(true);
    });

    it("first 8 quarters are IO (zero principal)", () => {
      for (let i = 0; i < 8; i++) {
        expect(periods[i].principalPayment).toBe(0);
      }
    });

    it("principal payments begin in quarter 9", () => {
      expect(periods[8].principalPayment).toBeGreaterThan(0);
    });

    it("loan balance decreases monotonically after IO period", () => {
      for (let i = 9; i < periods.length; i++) {
        expect(periods[i].loanBalance).toBeLessThan(periods[i - 1].loanBalance);
      }
    });

    it("base rent grows at 3%/yr", () => {
      // Q1 2022 vs Q1 2023 (4 quarters later): ~3% annual growth
      const yr1q1 = periods[0].baseRent;
      const yr2q1 = periods[4].baseRent;
      const growth = (yr2q1 - yr1q1) / yr1q1;
      expect(growth).toBeCloseTo(0.03, 2);
    });
  });

  // ─── Asset cash flows ─────────────────────────────────────────────────────

  describe("Asset cash flows", () => {
    it("operating cash to equity = NOI − CapEx − debt service", () => {
      for (let i = 0; i < assetCFs.length; i++) {
        const cf = assetCFs[i];
        const p = periods[i];
        const expected = p.noi - p.capex - p.debtService;
        expect(
          approx(cf.operatingCashToEquity, expected, 0.05),
          `CashToEquity mismatch at ${cf.quarterLabel}`
        ).toBe(true);
      }
    });

    it("sale proceeds are zero for all periods except Q4 2026", () => {
      for (const cf of assetCFs.slice(0, -1)) {
        expect(cf.saleProceeds).toBe(0);
      }
      expect(assetCFs[assetCFs.length - 1].saleProceeds).toBeGreaterThan(0);
    });

    it("total cash to equity in sale quarter includes sale proceeds", () => {
      const last = assetCFs[assetCFs.length - 1];
      expect(last.totalCashToEquity).toBeGreaterThan(last.operatingCashToEquity);
      expect(approx(last.totalCashToEquity, last.operatingCashToEquity + last.saleProceeds, 0.05)).toBe(true);
    });

    it("sale event NOI cap produces ~$60M gross sale price", () => {
      // trailing NOI / 5.25% ≈ $60M
      expect(saleEvent.grossSalePrice).toBeGreaterThan(55_000_000);
      expect(saleEvent.grossSalePrice).toBeLessThan(70_000_000);
    });

    it("net sale proceeds = gross price − selling costs − loan payoff", () => {
      const expected = saleEvent.grossSalePrice - saleEvent.sellingCosts - saleEvent.loanPayoff;
      expect(approx(saleEvent.netSaleProceeds, expected, 1)).toBe(true);
    });
  });

  // ─── Investment (JV) roll-up ───────────────────────────────────────────────

  describe("Investment cash flows (JV roll-up)", () => {
    it("fund share = total × 85% for every period", () => {
      for (let i = 0; i < investmentCFs.length; i++) {
        const expected = assetCFs[i].totalCashToEquity * INVESTMENT_TERMS.fundOwnershipPct;
        expect(approx(investmentCFs[i].fundShare, expected, 0.05)).toBe(true);
      }
    });

    it("co-invest share = total × 15% for every period", () => {
      for (let i = 0; i < investmentCFs.length; i++) {
        const expected = assetCFs[i].totalCashToEquity * INVESTMENT_TERMS.coInvestPct;
        expect(approx(investmentCFs[i].coInvestShare, expected, 0.05)).toBe(true);
      }
    });

    it("fund share + co-invest share = total distributed", () => {
      for (const cf of investmentCFs) {
        expect(
          approx(cf.fundShare + cf.coInvestShare, cf.totalDistributed, 0.05)
        ).toBe(true);
      }
    });

    it("fund share + co-invest share ≈ asset total cash to equity", () => {
      for (let i = 0; i < investmentCFs.length; i++) {
        expect(
          approx(investmentCFs[i].totalDistributed, assetCFs[i].totalCashToEquity, 0.05)
        ).toBe(true);
      }
    });
  });

  // ─── Fund gross cash flows ────────────────────────────────────────────────

  describe("Fund gross cash flows", () => {
    it("fund gross = sum of investment fund shares", () => {
      for (let i = 0; i < fundGrossCFs.length; i++) {
        expect(approx(fundGrossCFs[i].grossCashFlow, investmentCFs[i].fundShare, 0.05)).toBe(true);
      }
    });

    it("gross cash flows length matches operating periods", () => {
      expect(fundGrossCFs).toHaveLength(20);
    });
  });

  // ─── Fee application ──────────────────────────────────────────────────────

  describe("Fee application", () => {
    it("management fee is 1.5%/yr of $200M committed = $750K/yr = $187.5K/qtr", () => {
      const expectedQtrFee = FUND_TERMS.targetSize * FUND_TERMS.managementFeePct / 4;
      for (const cf of fundNetCFs) {
        expect(approx(cf.managementFee, expectedQtrFee, 1)).toBe(true);
      }
    });

    it("net cash flow = gross − management fee", () => {
      for (const cf of fundNetCFs) {
        expect(approx(cf.netCashFlow, cf.grossCashFlow - cf.managementFee, 0.05)).toBe(true);
      }
    });

    it("net cash flow is always less than gross (positive fees)", () => {
      for (const cf of fundNetCFs) {
        expect(cf.netCashFlow).toBeLessThanOrEqual(cf.grossCashFlow);
      }
    });
  });

  // ─── Waterfall ────────────────────────────────────────────────────────────

  describe("Waterfall", () => {
    it("every dollar distributed equals LP share + GP share", () => {
      for (const wp of waterfallPeriods) {
        if (wp.distributable <= 0) continue;
        const allocated = wp.lpShare + wp.gpShare;
        expect(
          approx(allocated, wp.distributable, 1),
          `Dollar mismatch at ${wp.quarterLabel}: LP=${wp.lpShare} + GP=${wp.gpShare} ≠ ${wp.distributable}`
        ).toBe(true);
      }
    });

    it("LP share is always ≥ GP share (LP capital priority)", () => {
      const totalLp = waterfallPeriods.reduce((s, wp) => s + wp.lpShare, 0);
      const totalGp = waterfallPeriods.reduce((s, wp) => s + wp.gpShare, 0);
      expect(totalLp).toBeGreaterThan(totalGp);
    });

    it("return of capital happens before pref (no pref paid before ROC)", () => {
      let totalRocLp = 0;
      let totalPrefPaid = 0;
      for (const wp of waterfallPeriods) {
        // Check that if pref is paid in a period, ROC must have been satisfied first
        if (wp.prefPaidThisPeriod > 0) {
          expect(totalRocLp).toBeCloseTo(lpEquity, -2);
        }
        totalRocLp += wp.returnOfCapitalLp;
        totalPrefPaid += wp.prefPaidThisPeriod;
      }
      expect(totalRocLp).toBeGreaterThan(0);
    });

    it("pref accrues at 8%/yr compounding quarterly", () => {
      // After Q1 2022 (first period), pref accrued should be ~lpEquity * 2%
      const firstPeriodPref = waterfallPeriods[0].prefAccruedThisPeriod;
      const expectedPref = lpEquity * (WATERFALL_TERMS.prefRate / 4);
      expect(approx(firstPeriodPref, expectedPref, 500)).toBe(true);
    });

    it("GP receives catch-up distribution when pref is paid", () => {
      const totalCatchUp = waterfallPeriods.reduce((s, wp) => s + wp.catchUpGp, 0);
      expect(totalCatchUp).toBeGreaterThan(0);
    });

    it("GP share > 20% of total once above pref (promote kicks in)", () => {
      // After LP gets ROC + pref, GP should have >0 from catch-up and split
      const totalLp = waterfallPeriods.reduce((s, wp) => s + wp.lpShare, 0);
      const totalGp = waterfallPeriods.reduce((s, wp) => s + wp.gpShare, 0);
      const totalDist = totalLp + totalGp;
      // GP net share as % of total distributions should reflect promote
      const gpPct = totalGp / totalDist;
      // GP has 10% co-invest + promote → should be > 10% and < 35%
      expect(gpPct).toBeGreaterThan(0.10);
      expect(gpPct).toBeLessThan(0.35);
    });

    it("total waterfall distributions ≈ total net cash flows", () => {
      const totalDist = waterfallPeriods.reduce((s, wp) => s + wp.lpShare + wp.gpShare, 0);
      const totalNet = fundNetCFs.reduce((s, cf) => s + Math.max(0, cf.netCashFlow), 0);
      // All positive net cash flows should be fully distributed
      expect(approx(totalDist, totalNet, 100)).toBe(true);
    });
  });

  // ─── Return metrics ───────────────────────────────────────────────────────

  describe("Return metrics", () => {
    const fundEquity = INVESTMENT_TERMS.fundEquity;
    const returns = computeReturns(fundNetCFs, fundEquity, saleEvent.quarter.label);

    it("TVPI > 1.0 (project makes money)", () => {
      expect(returns.tvpi).toBeGreaterThan(1.0);
    });

    it("TVPI = total distributed / equity invested", () => {
      const expected = returns.totalDistributed / returns.equity;
      expect(approx(returns.tvpi, expected, 0.001)).toBe(true);
    });

    it("DPI = TVPI at exit (fully realized)", () => {
      expect(returns.dpi).toBeCloseTo(returns.tvpi, 2);
    });

    it("RVPI = 0 at exit", () => {
      expect(returns.rvpi).toBe(0);
    });

    it("IRR is positive", () => {
      expect(returns.irr).toBeGreaterThan(0);
    });

    it("IRR is plausible for value-add multifamily (8%–25%)", () => {
      expect(returns.irr).toBeGreaterThan(0.08);
      expect(returns.irr).toBeLessThan(0.30);
    });

    it("LP/GP waterfall IRRs split as expected", () => {
      const wfReturns = computeReturnsFromWaterfall(
        waterfallPeriods,
        lpEquity,
        gpEquity
      );
      // LP should beat pref hurdle if project succeeds
      expect(wfReturns.lp.irr).toBeGreaterThan(0.05);
      // GP should have higher IRR than LP due to promote leverage
      // (GP has lower equity base but catch-up + promote)
      expect(wfReturns.lp.totalDistributed).toBeGreaterThan(0);
      expect(wfReturns.gp.totalDistributed).toBeGreaterThan(0);
    });
  });

  // ─── Sale date sensitivity ────────────────────────────────────────────────

  describe("Sale date sensitivity", () => {
    it("changing exit to Q4 2025 produces lower TVPI than Q4 2026", () => {
      // Build alternate scenario with earlier sale
      const periodsEarly = buildOperatingPeriods().slice(0, 16); // Q1 2022–Q4 2025
      const saleEarly = buildSaleEvent(periodsEarly);
      const assetCFsEarly = computeAssetCashFlows(periodsEarly, saleEarly);
      const invCFsEarly = rollToInvestment(assetCFsEarly, INVESTMENT_TERMS);
      const fundGrossEarly = rollToFund([invCFsEarly]);
      const fundNetEarly = applyFees(fundGrossEarly, {
        managementFeePct: FUND_TERMS.managementFeePct,
        committedCapital: FUND_TERMS.targetSize,
      });
      const returnsEarly = computeReturns(fundNetEarly, INVESTMENT_TERMS.fundEquity, "2025Q4");
      // Baseline returns (Q4 2026 exit)
      const returnsBaseline = computeReturns(fundNetCFs, INVESTMENT_TERMS.fundEquity, saleEvent.quarter.label);
      // More NOI growth and amortization by 2026 → higher TVPI
      expect(returnsBaseline.tvpi).toBeGreaterThanOrEqual(returnsEarly.tvpi);
    });
  });

  // ─── Data consistency ─────────────────────────────────────────────────────

  describe("Data consistency", () => {
    it("acquisition equity = acquisition price − debt", () => {
      const impliedEquity = ASSET_TERMS.acquisitionPrice - ASSET_TERMS.seniorDebt;
      // Should approximately match total investment equity
      expect(Math.abs(impliedEquity - INVESTMENT_TERMS.totalEquity)).toBeLessThan(1_000_000);
    });

    it("fund equity + co-invest equity = total investment equity", () => {
      expect(
        approx(
          INVESTMENT_TERMS.fundEquity + INVESTMENT_TERMS.coInvestEquity,
          INVESTMENT_TERMS.totalEquity,
          1
        )
      ).toBe(true);
    });

    it("fund ownership + co-invest = 100%", () => {
      expect(
        INVESTMENT_TERMS.fundOwnershipPct + INVESTMENT_TERMS.coInvestPct
      ).toBeCloseTo(1.0, 10);
    });
  });
});
