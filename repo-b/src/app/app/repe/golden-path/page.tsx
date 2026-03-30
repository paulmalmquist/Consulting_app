"use client";

import { useMemo } from "react";
import {
  buildGoldenPathData,
  FUND_TERMS,
  INVESTMENT_TERMS,
  WATERFALL_TERMS,
} from "@/lib/repe/golden-path-data";
import {
  computeAssetCashFlows,
  rollToInvestment,
  rollToFund,
  applyFees,
  computeWaterfall,
  computeReturns,
  computeReturnsFromWaterfall,
} from "@/lib/repe/cash-flow-engine";
import {
  buildReconciliationTable,
  buildLTDSummary,
  buildGrossToNetBridge,
  buildWaterfallTierAudit,
  formatMoney,
  formatPct,
} from "@/lib/repe/reconciliation-report";

// ─── Assertion runner ──────────────────────────────────────────────────────

type AssertionResult = {
  label: string;
  pass: boolean;
  actual: string;
  expected: string;
};

function assertNum(
  label: string,
  actual: number,
  expected: number,
  tol = 0.02
): AssertionResult {
  const pass = Math.abs(actual - expected) <= tol;
  return { label, pass, actual: actual.toFixed(4), expected: expected.toFixed(4) };
}

function assertBool(label: string, pass: boolean, note = ""): AssertionResult {
  return { label, pass, actual: pass ? "true" : "false", expected: note || "true" };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-widest text-[#aaa]">
      {children}
    </h2>
  );
}

function PassBadge({ pass }: { pass: boolean }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${pass ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}`}>
      {pass ? "PASS" : "FAIL"}
    </span>
  );
}

export default function GoldenPathPage() {
  const result = useMemo(() => {
    const data = buildGoldenPathData();
    const { periods, saleEvent } = data;

    const assetCFs = computeAssetCashFlows(periods, saleEvent);
    const investmentCFs = rollToInvestment(assetCFs, INVESTMENT_TERMS);
    const fundGrossCFs = rollToFund([investmentCFs]);
    // Charge fees on deployed capital (fund equity) for single-deal harness
    const fundNetCFs = applyFees(fundGrossCFs, {
      managementFeePct: FUND_TERMS.managementFeePct,
      committedCapital: INVESTMENT_TERMS.fundEquity,
    });

    const lpEquity = INVESTMENT_TERMS.fundEquity * 0.9;
    const gpEquity = INVESTMENT_TERMS.fundEquity * 0.1;

    const waterfallPeriods = computeWaterfall(
      fundNetCFs,
      { lpEquity, gpEquity },
      WATERFALL_TERMS
    );

    const grossCFs = fundGrossCFs.map((cf) => ({
      ...cf,
      managementFee: 0,
      netCashFlow: cf.grossCashFlow,
    }));
    const grossReturns = computeReturns(grossCFs, INVESTMENT_TERMS.fundEquity, saleEvent.quarter.label);
    const netReturns = computeReturns(fundNetCFs, INVESTMENT_TERMS.fundEquity, saleEvent.quarter.label);
    const wfReturns = computeReturnsFromWaterfall(waterfallPeriods, lpEquity, gpEquity);

    const rows = buildReconciliationTable(assetCFs, investmentCFs, fundNetCFs, waterfallPeriods);
    const ltd = buildLTDSummary(rows);
    const totalFees = fundNetCFs.reduce((s, cf) => s + cf.managementFee, 0);
    const bridge = buildGrossToNetBridge(grossReturns, netReturns, totalFees);
    const tierAudit = buildWaterfallTierAudit(waterfallPeriods);

    // Assertions
    const assertions: AssertionResult[] = [];
    assertions.push(assertBool("20 operating periods (Q1 2022–Q4 2026)", periods.length === 20));
    assertions.push(assertBool("First 8 quarters IO (zero principal)", periods.slice(0, 8).every((p) => p.principalPayment === 0)));
    assertions.push(assertBool("Principal begins quarter 9", periods[8].principalPayment > 0));

    for (const p of periods) {
      assertions.push(assertNum(`[${p.quarter.label}] NOI = Revenue − OpEx`, p.noi, p.grossRevenue - p.opex, 0.05));
    }

    for (let i = 0; i < assetCFs.length; i++) {
      const cf = assetCFs[i];
      const p = periods[i];
      assertions.push(assertNum(`[${cf.quarterLabel}] CTE = NOI − CapEx − DebtSvc`, cf.operatingCashToEquity, p.noi - p.capex - p.debtService, 0.05));
    }

    for (let i = 0; i < investmentCFs.length; i++) {
      assertions.push(assertNum(`[${assetCFs[i].quarterLabel}] JV: fund+co-invest = total`, investmentCFs[i].fundShare + investmentCFs[i].coInvestShare, assetCFs[i].totalCashToEquity, 0.05));
    }

    const expectedQtrFee = INVESTMENT_TERMS.fundEquity * FUND_TERMS.managementFeePct / 4;
    assertions.push(assertNum("Mgmt fee = 1.5%/yr on fund equity / 4", fundNetCFs[0].managementFee, expectedQtrFee, 1));

    for (const wp of waterfallPeriods) {
      if (wp.distributable <= 0) continue;
      assertions.push(assertNum(`[${wp.quarterLabel}] LP + GP = distributable`, wp.lpShare + wp.gpShare, wp.distributable, 1));
    }

    assertions.push(assertBool("Total LP > Total GP", ltd.totalLpDistributed > ltd.totalGpDistributed));
    assertions.push(assertBool("Net TVPI > 1.0", netReturns.tvpi > 1.0, "> 1.0"));
    assertions.push(assertBool("Net IRR > 8% (beats pref)", netReturns.irr > 0.08, "> 0.08"));
    assertions.push(assertBool("Waterfall checksum < $1", tierAudit.checksum < 1.0, "< $1"));
    assertions.push(assertNum("Fund + co-invest equity = total", INVESTMENT_TERMS.fundEquity + INVESTMENT_TERMS.coInvestEquity, INVESTMENT_TERMS.totalEquity, 1));

    return {
      data, assetCFs, investmentCFs, fundGrossCFs, fundNetCFs,
      waterfallPeriods, grossReturns, netReturns, wfReturns,
      rows, ltd, bridge, tierAudit, assertions, lpEquity, gpEquity,
    };
  }, []);

  const allPass = result.assertions.every((a) => a.pass);
  const passCount = result.assertions.filter((a) => a.pass).length;
  const failCount = result.assertions.length - passCount;

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#e0e0e0] font-mono p-6 text-xs">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6 border-b border-[#222] pb-4">
          <h1 className="text-lg font-bold text-white">REPE Golden-Path Waterfall Validation</h1>
          <p className="mt-1 text-[#666]">
            {FUND_TERMS.name} · {INVESTMENT_TERMS.name} · {result.data.assetTerms.name}
          </p>
          <div className={`mt-3 inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-bold ${allPass ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}`}>
            {allPass ? "ALL ASSERTIONS PASS" : `${failCount} FAILING`}
            <span className="text-[10px] font-normal opacity-70">{passCount}/{result.assertions.length}</span>
          </div>
        </div>

        {/* Return Summary */}
        <SectionTitle>Return Summary</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            ["Gross IRR", formatPct(result.grossReturns.irr)],
            ["Net IRR", formatPct(result.netReturns.irr)],
            ["Net TVPI", `${result.netReturns.tvpi.toFixed(2)}×`],
            ["LP IRR", formatPct(result.wfReturns.lp.irr)],
            ["GP IRR", formatPct(result.wfReturns.gp.irr)],
            ["LP TVPI", `${result.wfReturns.lp.tvpi.toFixed(2)}×`],
            ["GP TVPI", `${result.wfReturns.gp.tvpi.toFixed(2)}×`],
            ["Fund Equity", formatMoney(INVESTMENT_TERMS.fundEquity)],
          ].map(([label, value]) => (
            <div key={label} className="rounded border border-[#222] bg-[#111] px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-[#666]">{label}</div>
              <div className="mt-1 text-base font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>

        {/* Gross-to-Net Bridge */}
        <SectionTitle>Gross-to-Net Bridge</SectionTitle>
        <table className="w-full border-collapse mb-4">
          <thead>
            <tr className="border-b border-[#222]">
              <th className="px-2 py-1 text-left text-[10px] uppercase tracking-widest text-[#666]">Line Item</th>
              <th className="px-2 py-1 text-right text-[10px] uppercase tracking-widest text-[#666]">IRR</th>
              <th className="px-2 py-1 text-right text-[10px] uppercase tracking-widest text-[#666]">TVPI</th>
              <th className="px-2 py-1 text-right text-[10px] uppercase tracking-widest text-[#666]">Total Cash</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#1a1a1a]">
              <td className="px-2 py-1">Gross</td>
              <td className="px-2 py-1 text-right tabular-nums">{formatPct(result.bridge.grossIRR)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{result.bridge.grossTVPI.toFixed(2)}×</td>
              <td className="px-2 py-1 text-right tabular-nums">{formatMoney(result.grossReturns.totalDistributed)}</td>
            </tr>
            <tr className="border-b border-[#1a1a1a] text-red-400">
              <td className="px-2 py-1">Management Fee Drag</td>
              <td className="px-2 py-1 text-right tabular-nums">−{formatPct(result.bridge.mgmtFeeIRRDrag)}</td>
              <td className="px-2 py-1 text-right tabular-nums">−{result.bridge.mgmtFeeTVPIDrag.toFixed(3)}×</td>
              <td className="px-2 py-1 text-right tabular-nums">−{formatMoney(result.bridge.totalFeesCharged)}</td>
            </tr>
            <tr className="font-semibold text-white">
              <td className="px-2 py-1">Net</td>
              <td className="px-2 py-1 text-right tabular-nums">{formatPct(result.bridge.netIRR)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{result.bridge.netTVPI.toFixed(2)}×</td>
              <td className="px-2 py-1 text-right tabular-nums">{formatMoney(result.netReturns.totalDistributed)}</td>
            </tr>
          </tbody>
        </table>

        {/* Waterfall Tier Audit */}
        <SectionTitle>Waterfall Tier Audit</SectionTitle>
        <table className="w-full border-collapse mb-4">
          <thead>
            <tr className="border-b border-[#222]">
              <th className="px-2 py-1 text-left text-[10px] uppercase tracking-widest text-[#666]">Tier</th>
              <th className="px-2 py-1 text-right text-[10px] uppercase tracking-widest text-[#666]">LP</th>
              <th className="px-2 py-1 text-right text-[10px] uppercase tracking-widest text-[#666]">GP</th>
              <th className="px-2 py-1 text-right text-[10px] uppercase tracking-widest text-[#666]">Total</th>
            </tr>
          </thead>
          <tbody>
            {([
              ["Return of Capital", result.tierAudit.returnOfCapitalLp, result.tierAudit.returnOfCapitalGp],
              ["8% Preferred Return", result.tierAudit.prefPaidTotal, 0],
              ["GP Catch-Up (50/50)", 0, result.tierAudit.catchUpGpTotal],
              ["Tier 1 Split (80/20)", result.tierAudit.tier1LpTotal, result.tierAudit.tier1GpTotal],
              ["Tier 2 Split (70/30)", result.tierAudit.tier2LpTotal, result.tierAudit.tier2GpTotal],
            ] as [string, number, number][]).map(([label, lp, gp]) => (
              <tr key={label} className="border-b border-[#1a1a1a]">
                <td className="px-2 py-1">{label}</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatMoney(lp)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatMoney(gp)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatMoney(lp + gp)}</td>
              </tr>
            ))}
            <tr className="border-t border-[#333] font-semibold text-white">
              <td className="px-2 py-1">Total</td>
              <td className="px-2 py-1 text-right tabular-nums">{formatMoney(result.tierAudit.grandTotalLp)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{formatMoney(result.tierAudit.grandTotalGp)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{formatMoney(result.tierAudit.grandTotal)}</td>
            </tr>
            <tr>
              <td className="px-2 py-1 text-[#666]">Checksum (≈ 0)</td>
              <td colSpan={2} />
              <td className={`px-2 py-1 text-right tabular-nums ${result.tierAudit.checksum < 1 ? "text-green-500" : "text-red-500"}`}>
                {formatMoney(result.tierAudit.checksum, 2)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Period Reconciliation */}
        <SectionTitle>Period-by-Period Reconciliation</SectionTitle>
        <div className="overflow-x-auto mb-4">
          <table className="border-collapse text-[10px]">
            <thead>
              <tr className="border-b border-[#222]">
                {["Quarter","NOI","CapEx","Debt Svc","CTE Ops","Sale","Asset Total","Fund Share","Mgmt Fee","Fund Net","LP","GP"].map((h) => (
                  <th key={h} className="px-2 py-1 text-right first:text-left text-[10px] uppercase tracking-widest text-[#666] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.quarterLabel} className={`border-b border-[#1a1a1a] ${row.assetSaleProceeds > 0 ? "bg-amber-950/20" : ""}`}>
                  <td className="px-2 py-1 font-semibold whitespace-nowrap">{row.quarterLabel}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatMoney(row.assetNOI)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-red-400">({formatMoney(row.assetCapex)})</td>
                  <td className="px-2 py-1 text-right tabular-nums text-red-400">({formatMoney(row.assetDebtService)})</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatMoney(row.assetCashToEquity)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-amber-400">{row.assetSaleProceeds > 0 ? formatMoney(row.assetSaleProceeds) : "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums font-semibold">{formatMoney(row.assetTotal)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatMoney(row.fundGross)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-red-400">({formatMoney(row.fundMgmtFee)})</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatMoney(row.fundNet)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-blue-400">{formatMoney(row.lpShare)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-purple-400">{formatMoney(row.gpShare)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[#333] font-semibold text-white bg-[#111]">
                <td className="px-2 py-1">LTD</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatMoney(result.ltd.totalAssetNOI)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-red-400">({formatMoney(result.ltd.totalAssetCapex)})</td>
                <td className="px-2 py-1 text-right tabular-nums text-red-400">({formatMoney(result.ltd.totalAssetDebtService)})</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatMoney(result.ltd.totalAssetOperatingCashToEquity)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-amber-400">{formatMoney(result.ltd.totalAssetSaleProceeds)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatMoney(result.ltd.totalAssetCashToEquity)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatMoney(result.ltd.totalFundGross)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-red-400">({formatMoney(result.ltd.totalMgmtFees)})</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatMoney(result.ltd.totalFundNet)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-blue-400">{formatMoney(result.ltd.totalLpDistributed)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-purple-400">{formatMoney(result.ltd.totalGpDistributed)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Sale Event */}
        <SectionTitle>Sale Event — Q4 2026</SectionTitle>
        <div className="rounded border border-[#222] bg-[#111] p-3 text-[10px] space-y-1 mb-4 max-w-sm">
          {[
            ["Trailing LTM NOI", formatMoney(result.data.saleEvent.trailingNOI)],
            ["Exit Cap Rate", formatPct(result.data.saleEvent.exitCapRate)],
            ["Gross Sale Price", formatMoney(result.data.saleEvent.grossSalePrice)],
            ["Selling Costs (1.5%)", `(${formatMoney(result.data.saleEvent.sellingCosts)})`],
            ["Net Sale Price", formatMoney(result.data.saleEvent.netSalePrice)],
            ["Loan Payoff", `(${formatMoney(result.data.saleEvent.loanPayoff)})`],
            ["Net Proceeds to Equity", formatMoney(result.data.saleEvent.netSaleProceeds)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <span className="text-[#666]">{label}</span>
              <span className="tabular-nums text-white">{value}</span>
            </div>
          ))}
        </div>

        {/* Assertions */}
        <SectionTitle>Assertions ({passCount}/{result.assertions.length})</SectionTitle>
        <div className="space-y-0.5 max-h-96 overflow-y-auto">
          {result.assertions.map((a, i) => (
            <div key={i} className={`flex items-center gap-2 rounded px-2 py-1 ${a.pass ? "" : "bg-red-950/30"}`}>
              <PassBadge pass={a.pass} />
              <span className={`flex-1 truncate ${a.pass ? "text-[#666]" : "text-red-300"}`}>{a.label}</span>
              {!a.pass && (
                <span className="shrink-0 text-[10px] text-red-400 tabular-nums">
                  got {a.actual} ≠ {a.expected}
                </span>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
