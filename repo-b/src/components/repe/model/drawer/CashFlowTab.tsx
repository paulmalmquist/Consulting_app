"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Loader2 } from "lucide-react";
import type { AssetPreview } from "@/lib/bos-api";

interface CashFlowTabProps {
  scenarioId: string;
  assetId: string;
  preview: AssetPreview | null;
}

function fmtCcy(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function fmtQtr(dateStr: string): string {
  const d = new Date(dateStr);
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `${d.getFullYear()}Q${q}`;
}

/**
 * Interpolate quarterly cashflows into monthly periods.
 * Each quarterly value is divided by 3 for monthly distribution.
 */
function interpolateMonthly(cashflows: AssetPreview["cashflows"]) {
  const months: Array<{
    period_label: string;
    period_date: string;
    gross_rent: number;
    other_income: number;
    vacancy_loss: number;
    operating_expenses: number;
    noi: number;
    debt_service: number;
    capex: number;
    equity_cash_flow: number;
  }> = [];

  for (const qCf of cashflows) {
    const qDate = new Date(qCf.period_date);
    const qMonth = qDate.getMonth(); // 0-indexed start of quarter

    for (let m = 0; m < 3; m++) {
      const mDate = new Date(qDate.getFullYear(), qMonth + m, 1);
      const label = mDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      const gross = qCf.revenue / 3;
      const expenses = qCf.expenses / 3;
      const noi = qCf.noi / 3;

      months.push({
        period_label: label,
        period_date: mDate.toISOString().slice(0, 10),
        gross_rent: gross,
        other_income: 0,
        vacancy_loss: 0,
        operating_expenses: expenses,
        noi,
        debt_service: qCf.debt_service / 3,
        capex: qCf.capex / 3,
        equity_cash_flow: qCf.equity_cash_flow / 3,
      });
    }
  }

  return months;
}

export function CashFlowTab({ scenarioId, assetId, preview }: CashFlowTabProps) {
  const [highlightedRow, setHighlightedRow] = useState<number | null>(null);

  const monthlyData = useMemo(() => {
    if (!preview?.cashflows?.length) return [];
    return interpolateMonthly(preview.cashflows);
  }, [preview]);

  const totals = useMemo(() => {
    if (!monthlyData.length) return null;
    return {
      gross_rent: monthlyData.reduce((s, r) => s + r.gross_rent, 0),
      other_income: monthlyData.reduce((s, r) => s + r.other_income, 0),
      vacancy_loss: monthlyData.reduce((s, r) => s + r.vacancy_loss, 0),
      operating_expenses: monthlyData.reduce((s, r) => s + r.operating_expenses, 0),
      noi: monthlyData.reduce((s, r) => s + r.noi, 0),
      debt_service: monthlyData.reduce((s, r) => s + r.debt_service, 0),
      capex: monthlyData.reduce((s, r) => s + r.capex, 0),
      equity_cash_flow: monthlyData.reduce((s, r) => s + r.equity_cash_flow, 0),
    };
  }, [monthlyData]);

  const chartData = useMemo(() => {
    return monthlyData.map((r) => ({
      label: r.period_label,
      equity_cf: r.equity_cash_flow,
      noi: r.noi,
    }));
  }, [monthlyData]);

  if (!preview) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={18} className="animate-spin text-bm-muted" />
        <span className="ml-2 text-xs text-bm-muted">Loading projections...</span>
      </div>
    );
  }

  if (monthlyData.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-xs text-bm-muted2">No cash flow data available.</p>
        <p className="mt-1 text-[10px] text-bm-muted">Save assumptions and ensure the asset has base period data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Equity Cash Flow Chart ── */}
      <div className="rounded-xl border border-bm-border/50 bg-bm-surface/10 p-4">
        <h4 className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-bm-muted2">
          Equity Cash Flow & NOI Projection
        </h4>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart
            data={chartData}
            onMouseMove={(e) => {
              if (e?.activeTooltipIndex != null) setHighlightedRow(e.activeTooltipIndex);
            }}
            onMouseLeave={() => setHighlightedRow(null)}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
              interval={Math.max(0, Math.floor(chartData.length / 12) - 1)}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
              tickFormatter={(v) => fmtCcy(v)}
              width={60}
            />
            <Tooltip
              contentStyle={{
                background: "#1a1a2e",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(v: number, name: string) => [fmtCcy(v), name === "equity_cf" ? "Equity CF" : "NOI"]}
            />
            <Line type="monotone" dataKey="noi" stroke="#10b981" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="equity_cf" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            {highlightedRow != null && chartData[highlightedRow] && (
              <ReferenceLine
                x={chartData[highlightedRow].label}
                stroke="rgba(255,255,255,0.2)"
                strokeDasharray="3 3"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Monthly Cash Flow Grid ── */}
      <div className="rounded-xl border border-bm-border/50 bg-bm-surface/10">
        <div className="px-4 py-2 border-b border-bm-border/30">
          <h4 className="text-[10px] font-medium uppercase tracking-[0.12em] text-bm-muted2">
            Monthly Cash Flow Detail
          </h4>
          <span className="text-[9px] text-bm-muted">{monthlyData.length} months</span>
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 z-10 bg-bm-surface/30">
              <tr className="border-b border-bm-border/30 text-[9px] uppercase tracking-[0.1em] text-bm-muted">
                <th className="sticky left-0 z-20 bg-bm-surface/30 px-3 py-1.5 text-left font-medium">Month</th>
                <th className="px-3 py-1.5 text-right font-medium">Gross Rent</th>
                <th className="px-3 py-1.5 text-right font-medium">Other Income</th>
                <th className="px-3 py-1.5 text-right font-medium">Vacancy</th>
                <th className="px-3 py-1.5 text-right font-medium">OpEx</th>
                <th className="px-3 py-1.5 text-right font-medium whitespace-nowrap">NOI</th>
                <th className="px-3 py-1.5 text-right font-medium">Debt Service</th>
                <th className="px-3 py-1.5 text-right font-medium">Capex</th>
                <th className="px-3 py-1.5 text-right font-medium">Equity CF</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((row, i) => (
                <tr
                  key={row.period_date}
                  className={`border-b border-bm-border/10 transition-colors ${
                    highlightedRow === i ? "bg-bm-accent/10" : "hover:bg-bm-surface/15"
                  }`}
                  onMouseEnter={() => setHighlightedRow(i)}
                  onMouseLeave={() => setHighlightedRow(null)}
                >
                  <td className="sticky left-0 z-10 bg-bm-surface/20 px-3 py-1.5 text-left text-bm-muted2 whitespace-nowrap">
                    {row.period_label}
                  </td>
                  <CfCell value={row.gross_rent} />
                  <CfCell value={row.other_income} />
                  <CfCell value={row.vacancy_loss} />
                  <CfCell value={row.operating_expenses} negative />
                  <td className="px-3 py-1.5 text-right font-medium text-bm-text">{fmtCcy(row.noi)}</td>
                  <CfCell value={row.debt_service} negative />
                  <CfCell value={row.capex} negative />
                  <td className={`px-3 py-1.5 text-right font-medium ${
                    row.equity_cash_flow < 0 ? "text-red-400" : "text-emerald-400"
                  }`}>
                    {fmtCcy(row.equity_cash_flow)}
                  </td>
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot className="sticky bottom-0 bg-bm-surface/30">
                <tr className="border-t-2 border-bm-border/40 font-medium text-bm-text">
                  <td className="sticky left-0 z-10 bg-bm-surface/30 px-3 py-2 text-left text-[10px] uppercase tracking-wide">Total</td>
                  <td className="px-3 py-2 text-right">{fmtCcy(totals.gross_rent)}</td>
                  <td className="px-3 py-2 text-right">{fmtCcy(totals.other_income)}</td>
                  <td className="px-3 py-2 text-right">{fmtCcy(totals.vacancy_loss)}</td>
                  <td className="px-3 py-2 text-right">{fmtCcy(totals.operating_expenses)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmtCcy(totals.noi)}</td>
                  <td className="px-3 py-2 text-right">{fmtCcy(totals.debt_service)}</td>
                  <td className="px-3 py-2 text-right">{fmtCcy(totals.capex)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${
                    totals.equity_cash_flow < 0 ? "text-red-400" : "text-emerald-400"
                  }`}>
                    {fmtCcy(totals.equity_cash_flow)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function CfCell({ value, negative }: { value: number; negative?: boolean }) {
  const isNeg = value < 0 || (negative && value > 0);
  return (
    <td className={`px-3 py-1.5 text-right ${isNeg ? "text-red-400" : "text-bm-muted2"}`}>
      {fmtCcy(negative ? -Math.abs(value) : value)}
    </td>
  );
}
