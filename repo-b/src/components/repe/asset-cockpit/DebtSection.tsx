"use client";

import { useEffect, useState } from "react";
import type {
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
} from "@/lib/bos-api";
import { KpiStrip } from "./KpiStrip";
import { TrendLineChart } from "@/components/charts";
import { CHART_COLORS } from "@/components/charts/chart-theme";
import { fmtMoney, fmtPct, fmtX } from "./format-utils";
import SectionHeader from "./shared/SectionHeader";
import SecondaryMetric from "./shared/SecondaryMetric";
import { BRIEFING_CONTAINER, BRIEFING_CARD } from "./shared/briefing-colors";

interface CovenantDef {
  covenant_type: string;
  threshold: number;
  comparator: string;
}

interface CovenantResult {
  dscr: number | null;
  ltv: number | null;
  debt_yield: number | null;
  pass: boolean;
  headroom: number | null;
  breached: boolean;
  quarter: string;
}

interface LoanCovenant {
  loan_id: string;
  loan_name: string;
  upb: number;
  rate: number;
  maturity_date: string | null;
  covenants: CovenantDef[];
  latest_result: CovenantResult | null;
}

interface CovenantData {
  asset_id: string;
  loans: LoanCovenant[];
}

interface Props {
  financialState: ReV2AssetQuarterState | null;
  periods: ReV2AssetPeriod[];
  assetId?: string;
}

export default function DebtSection({ financialState, periods, assetId }: Props) {
  const [covenantData, setCovenantData] = useState<CovenantData | null>(null);

  useEffect(() => {
    if (!assetId) return;
    fetch(`/api/re/v2/assets/${assetId}/covenants`)
      .then((r) => r.json())
      .then(setCovenantData)
      .catch(() => {});
  }, [assetId]);

  const debtTrendData = (periods ?? [])
    .filter((p) => p.debt_balance != null)
    .map((p) => ({
      quarter: p.quarter,
      debt_balance: Number(p.debt_balance ?? 0),
    }));

  // Use real covenant data only — no mock fallback
  const primaryLoan = covenantData?.loans?.[0];
  const loan = primaryLoan
    ? {
        lender: primaryLoan.loan_name,
        rate: primaryLoan.rate,
        maturity: primaryLoan.maturity_date
          ? new Date(primaryLoan.maturity_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })
          : "—",
        amortization: "—",
        loan_type: "—",
      }
    : null;

  // Maturity warning: flag loans maturing within 18 months
  const maturityWarnings: { loanName: string; monthsLeft: number }[] = [];
  if (covenantData?.loans) {
    const now = Date.now();
    for (const ln of covenantData.loans) {
      if (ln.maturity_date) {
        const matMs = new Date(ln.maturity_date).getTime();
        const monthsLeft = Math.round((matMs - now) / (1000 * 60 * 60 * 24 * 30.44));
        if (monthsLeft > 0 && monthsLeft <= 18) {
          maturityWarnings.push({ loanName: ln.loan_name, monthsLeft });
        }
      }
    }
  }

  if (!financialState && debtTrendData.length === 0) {
    return (
      <div className={`${BRIEFING_CONTAINER} text-sm text-bm-muted2`}>
        No debt data available for this asset.
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="asset-debt-section">
      <SectionHeader eyebrow="DEBT STRUCTURE" title="Capital Stack & Loan Health" />

      {/* Debt KPI Strip */}
      {financialState && (
        <KpiStrip
          kpis={[
            { label: "Debt Balance", value: fmtMoney(financialState.debt_balance) },
            { label: "Debt Service", value: fmtMoney(financialState.debt_service) },
            {
              label: "DSCR",
              value: fmtX(financialState.dscr),
              ...(financialState.dscr ? {
                delta: {
                  value: Number(financialState.dscr) >= 1.25 ? "Healthy" : Number(financialState.dscr) >= 1.0 ? "Watch" : "Stress",
                  tone: (Number(financialState.dscr) >= 1.25 ? "positive" : Number(financialState.dscr) >= 1.0 ? "neutral" : "negative") as "positive" | "neutral" | "negative",
                },
              } : {}),
            },
            {
              label: "LTV",
              value: fmtPct(financialState.ltv),
              ...(financialState.ltv ? {
                delta: {
                  value: Number(financialState.ltv) <= 0.65 ? "Conservative" : Number(financialState.ltv) <= 0.75 ? "Moderate" : "High",
                  tone: (Number(financialState.ltv) <= 0.65 ? "positive" : Number(financialState.ltv) <= 0.75 ? "neutral" : "negative") as "positive" | "neutral" | "negative",
                },
              } : {}),
            },
            {
              label: "Debt Yield",
              value: financialState.debt_yield
                ? `${(Number(financialState.debt_yield) * 100).toFixed(1)}%`
                : "—",
            },
          ]}
        />
      )}

      {/* Loan Health Indicators */}
      {financialState && (financialState.dscr || financialState.ltv || financialState.debt_yield) && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.02]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2 mr-2">Loan Health</span>
          {financialState.dscr && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              Number(financialState.dscr) >= 1.25 ? "bg-green-500/10 text-green-400" : Number(financialState.dscr) >= 1.0 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${Number(financialState.dscr) >= 1.25 ? "bg-green-400" : Number(financialState.dscr) >= 1.0 ? "bg-amber-400" : "bg-red-400"}`} />
              DSCR {fmtX(financialState.dscr)}
            </span>
          )}
          {financialState.ltv && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              Number(financialState.ltv) <= 0.65 ? "bg-green-500/10 text-green-400" : Number(financialState.ltv) <= 0.75 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${Number(financialState.ltv) <= 0.65 ? "bg-green-400" : Number(financialState.ltv) <= 0.75 ? "bg-amber-400" : "bg-red-400"}`} />
              LTV {fmtPct(financialState.ltv)}
            </span>
          )}
          {financialState.debt_yield && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              Number(financialState.debt_yield) >= 0.10 ? "bg-green-500/10 text-green-400" : Number(financialState.debt_yield) >= 0.08 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${Number(financialState.debt_yield) >= 0.10 ? "bg-green-400" : Number(financialState.debt_yield) >= 0.08 ? "bg-amber-400" : "bg-red-400"}`} />
              Debt Yield {`${(Number(financialState.debt_yield) * 100).toFixed(1)}%`}
            </span>
          )}
        </div>
      )}

      {/* Debt Balance Trend */}
      {debtTrendData.length > 0 && (
        <div className={BRIEFING_CARD}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2 mb-3">
            Debt Balance Trend
          </p>
          <TrendLineChart
            data={debtTrendData}
            lines={[{ key: "debt_balance", label: "Debt Balance", color: CHART_COLORS.opex }]}
            format="dollar"
            height={260}
            showLegend={false}
          />
        </div>
      )}

      {/* Debt Detail Summary */}
      {financialState && (
        <div className={BRIEFING_CARD}>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Debt Summary
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-bm-muted2">Debt Balance</dt><dd className="font-medium text-bm-text">{fmtMoney(financialState.debt_balance)}</dd></div>
            <div><dt className="text-xs text-bm-muted2">Debt Service</dt><dd className="font-medium text-bm-text">{fmtMoney(financialState.debt_service)}</dd></div>
            <div><dt className="text-xs text-bm-muted2">LTV</dt><dd className="font-medium text-bm-text">{fmtPct(financialState.ltv)}</dd></div>
            <div><dt className="text-xs text-bm-muted2">DSCR</dt><dd className="font-medium text-bm-text">{fmtX(financialState.dscr)}</dd></div>
          </dl>
        </div>
      )}

      {/* Loan Details */}
      {loan && (
        <div className={BRIEFING_CONTAINER}>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Loan Details
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SecondaryMetric label="Lender" value={loan.lender} />
            <SecondaryMetric label="Interest Rate" value={`${loan.rate.toFixed(2)}%`} />
            <SecondaryMetric label="Maturity" value={loan.maturity} />
            <SecondaryMetric label="Amortization" value={loan.amortization} />
            <SecondaryMetric label="Loan Type" value={loan.loan_type} />
          </div>
        </div>
      )}

      {/* Maturity & Covenant Alerts */}
      {maturityWarnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {maturityWarnings.map((w) => (
            <div key={w.loanName} className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-2.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-xs font-medium text-amber-300">
                {w.loanName}: matures in {w.monthsLeft} month{w.monthsLeft !== 1 ? "s" : ""} — refinancing review recommended
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Covenant Status Panel */}
      {covenantData && covenantData.loans.length > 0 && (
        <div className={BRIEFING_CARD}>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2 mb-3">
            Covenant Status
          </h3>
          <div className="space-y-3">
            {covenantData.loans.map((ln) => (
              <div key={ln.loan_id} className="rounded-lg border border-slate-200 dark:border-white/10 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-bm-text">{ln.loan_name}</span>
                  {ln.latest_result && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                      ln.latest_result.breached
                        ? "bg-red-500/10 text-red-400"
                        : "bg-green-500/10 text-green-400"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${ln.latest_result.breached ? "bg-red-400" : "bg-green-400"}`} />
                      {ln.latest_result.breached ? "BREACH" : "PASS"}
                    </span>
                  )}
                </div>
                {ln.covenants.length > 0 && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-bm-muted2">
                        <th className="text-left py-1">Metric</th>
                        <th className="text-right py-1">Threshold</th>
                        <th className="text-right py-1">Current</th>
                        <th className="text-right py-1">Headroom</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ln.covenants.map((cov) => {
                        const r = ln.latest_result;
                        let current: number | null = null;
                        if (r) {
                          if (cov.covenant_type === "DSCR") current = r.dscr;
                          else if (cov.covenant_type === "LTV") current = r.ltv;
                          else if (cov.covenant_type === "DEBT_YIELD") current = r.debt_yield;
                        }
                        const headroom = current != null ? current - cov.threshold : null;
                        const isBreached = headroom != null && (
                          (cov.comparator === ">=" && headroom < 0) ||
                          (cov.comparator === "<=" && headroom > 0)
                        );
                        return (
                          <tr key={cov.covenant_type} className="border-t border-slate-100 dark:border-white/5">
                            <td className="py-1.5 text-bm-text">{cov.covenant_type}</td>
                            <td className="py-1.5 text-right text-bm-muted2">
                              {cov.comparator} {cov.covenant_type === "LTV" ? `${(cov.threshold * 100).toFixed(1)}%` : cov.threshold.toFixed(2)}
                            </td>
                            <td className={`py-1.5 text-right font-medium ${isBreached ? "text-red-400" : "text-bm-text"}`}>
                              {current != null
                                ? cov.covenant_type === "LTV"
                                  ? `${(current * 100).toFixed(1)}%`
                                  : current.toFixed(2)
                                : "—"}
                            </td>
                            <td className={`py-1.5 text-right ${isBreached ? "text-red-400" : headroom != null && Math.abs(headroom) < cov.threshold * 0.1 ? "text-amber-400" : "text-green-400"}`}>
                              {headroom != null
                                ? cov.covenant_type === "LTV"
                                  ? `${(headroom * 100).toFixed(1)}%`
                                  : headroom.toFixed(2)
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {ln.latest_result?.quarter && (
                  <p className="mt-1.5 text-[10px] text-bm-muted2">
                    Last tested: {ln.latest_result.quarter}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
