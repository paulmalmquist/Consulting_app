"use client";

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
import { getMockLoanDetails } from "./mock-data";

interface Props {
  financialState: ReV2AssetQuarterState | null;
  periods: ReV2AssetPeriod[];
}

export default function DebtSection({ financialState, periods }: Props) {
  const debtTrendData = periods
    .filter((p) => p.debt_balance != null)
    .map((p) => ({
      quarter: p.quarter,
      debt_balance: Number(p.debt_balance ?? 0),
    }));

  const loan = getMockLoanDetails();

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
    </div>
  );
}
