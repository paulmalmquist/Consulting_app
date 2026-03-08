"use client";

import type {
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
} from "@/lib/bos-api";
import { KpiStrip } from "./KpiStrip";
import { TrendLineChart } from "@/components/charts";
import { CHART_COLORS } from "@/components/charts/chart-theme";
import { fmtMoney, fmtPct, fmtX } from "./format-utils";

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

  if (!financialState && debtTrendData.length === 0) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-sm text-bm-muted2">
        No debt data available for this asset.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="asset-debt-section">
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
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-bm-border/70 bg-bm-surface/20 px-4 py-2.5">
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
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
            Debt Balance Trend
          </h3>
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
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">
            Debt Summary
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-bm-muted2">Debt Balance</dt><dd className="font-medium">{fmtMoney(financialState.debt_balance)}</dd></div>
            <div><dt className="text-xs text-bm-muted2">Debt Service</dt><dd className="font-medium">{fmtMoney(financialState.debt_service)}</dd></div>
            <div><dt className="text-xs text-bm-muted2">LTV</dt><dd className="font-medium">{fmtPct(financialState.ltv)}</dd></div>
            <div><dt className="text-xs text-bm-muted2">DSCR</dt><dd className="font-medium">{fmtX(financialState.dscr)}</dd></div>
          </dl>
        </div>
      )}

      {/* Placeholder for future enrichment */}
      <div className="rounded-xl border border-dashed border-bm-border/50 bg-bm-surface/10 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">
          Loan Details
        </h3>
        <p className="mt-2 text-sm text-bm-muted2">
          Lender, interest rate, maturity date, and amortization schedule will appear here once loan documents are uploaded.
        </p>
      </div>
    </div>
  );
}
