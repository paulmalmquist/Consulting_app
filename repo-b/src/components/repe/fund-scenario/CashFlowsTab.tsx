"use client";

import { useState } from "react";
import { Loader2, DollarSign, ArrowUpDown } from "lucide-react";
import { fmtMoney, fmtPct, fmtMultiple } from "@/lib/format-utils";
import { useQuarterlyTimeline } from "./useQuarterlyTimeline";
import type { QuarterlyTimelineRow } from "@/lib/bos-api";

const RANGE_OPTIONS = [
  { label: "4Q", value: 4 },
  { label: "8Q", value: 8 },
  { label: "12Q", value: 12 },
  { label: "20Q", value: 20 },
];

function MiniLineChart({
  data,
  color,
  height = 60,
  width = "100%",
}: {
  data: { label: string; value: number }[];
  color: string;
  height?: number;
  width?: string | number;
}) {
  if (data.length < 2) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const svgW = 400;
  const step = svgW / (data.length - 1);

  const pathD = data
    .map((d, i) => {
      const x = i * step;
      const y = height - ((d.value - min) / range) * (height - 8) - 4;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${svgW} ${height}`} style={{ width, height }} preserveAspectRatio="none">
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CashFlowStackedBar({
  rows,
  height = 120,
}: {
  rows: QuarterlyTimelineRow[];
  height?: number;
}) {
  if (rows.length === 0) return null;

  const maxVal = Math.max(
    ...rows.map((r) => Math.max(r.contributions, r.distributions, r.fees_and_expenses)),
    1
  );

  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
      <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted mb-3">
        Quarterly Cash Flows
      </h3>
      <div className="flex items-end gap-1" style={{ height }}>
        {rows.map((row) => {
          const contribH = (row.contributions / maxVal) * height * 0.9;
          const distH = (row.distributions / maxVal) * height * 0.9;
          return (
            <div key={row.quarter} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex flex-col items-center gap-0.5" style={{ height: height * 0.9 }}>
                <div className="w-full flex flex-col justify-end flex-1">
                  {contribH > 0 && (
                    <div
                      className="w-full bg-blue-500/70 rounded-t-sm"
                      style={{ height: contribH }}
                      title={`Contributions: ${fmtMoney(row.contributions)}`}
                    />
                  )}
                  {distH > 0 && (
                    <div
                      className="w-full bg-emerald-500/70 rounded-b-sm mt-0.5"
                      style={{ height: distH }}
                      title={`Distributions: ${fmtMoney(row.distributions)}`}
                    />
                  )}
                </div>
              </div>
              <span className="text-[8px] text-bm-muted truncate w-full text-center">
                {row.quarter.slice(-2)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-2 text-[10px] text-bm-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-blue-500/70" /> Contributions</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/70" /> Distributions</span>
      </div>
    </div>
  );
}

function QuarterlyDetailTable({ rows }: { rows: QuarterlyTimelineRow[] }) {
  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
      <div className="px-4 py-3 border-b border-bm-border/30">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
          Quarterly Detail
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-bm-muted border-b border-bm-border/20">
              <th className="text-left font-medium py-2 pl-4 sticky left-0 bg-bm-surface/10">Quarter</th>
              <th className="text-right font-medium py-2">Contributions</th>
              <th className="text-right font-medium py-2">Distributions</th>
              <th className="text-right font-medium py-2">Fees</th>
              <th className="text-right font-medium py-2">NAV</th>
              <th className="text-right font-medium py-2">Gross IRR</th>
              <th className="text-right font-medium py-2">Net IRR</th>
              <th className="text-right font-medium py-2">TVPI</th>
              <th className="text-right font-medium py-2">DPI</th>
              <th className="text-right font-medium py-2 pr-4">RVPI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.quarter} className="border-t border-bm-border/10 hover:bg-bm-surface/20">
                <td className="py-2 pl-4 font-medium text-bm-text sticky left-0 bg-inherit">{row.quarter}</td>
                <td className="text-right text-bm-muted2">{fmtMoney(row.contributions)}</td>
                <td className="text-right text-bm-muted2">{fmtMoney(row.distributions)}</td>
                <td className="text-right text-bm-muted2">{fmtMoney(row.fees_and_expenses)}</td>
                <td className="text-right font-medium text-bm-text">{fmtMoney(row.portfolio_nav)}</td>
                <td className="text-right text-bm-muted2">{row.gross_irr != null ? fmtPct(row.gross_irr) : "—"}</td>
                <td className="text-right text-bm-muted2">{row.net_irr != null ? fmtPct(row.net_irr) : "—"}</td>
                <td className="text-right text-bm-muted2">{row.tvpi != null ? fmtMultiple(row.tvpi) : "—"}</td>
                <td className="text-right text-bm-muted2">{row.dpi != null ? fmtMultiple(row.dpi) : "—"}</td>
                <td className="text-right text-bm-muted2 pr-4">{row.rvpi != null ? fmtMultiple(row.rvpi) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-bm-border/30">
              <td className="py-2 pl-4 font-medium text-bm-text sticky left-0 bg-inherit">Total</td>
              <td className="text-right font-medium text-bm-text">{fmtMoney(rows.reduce((s, r) => s + r.contributions, 0))}</td>
              <td className="text-right font-medium text-bm-text">{fmtMoney(rows.reduce((s, r) => s + r.distributions, 0))}</td>
              <td className="text-right font-medium text-bm-text">{fmtMoney(rows.reduce((s, r) => s + r.fees_and_expenses, 0))}</td>
              <td colSpan={6} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function GrossNetBridgeTable({ rows }: { rows: QuarterlyTimelineRow[] }) {
  const bridgeRows = rows.filter((r) => r.gross_return !== 0 || r.net_return !== 0);
  if (bridgeRows.length === 0) return null;

  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
      <div className="px-4 py-3 border-b border-bm-border/30">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
          Gross-to-Net Bridge
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-bm-muted border-b border-bm-border/20">
              <th className="text-left font-medium py-2 pl-4">Quarter</th>
              <th className="text-right font-medium py-2">Gross Return</th>
              <th className="text-right font-medium py-2">Mgmt Fees</th>
              <th className="text-right font-medium py-2">Fund Expenses</th>
              <th className="text-right font-medium py-2 pr-4">Net Return</th>
            </tr>
          </thead>
          <tbody>
            {bridgeRows.map((row) => (
              <tr key={row.quarter} className="border-t border-bm-border/10">
                <td className="py-2 pl-4 font-medium text-bm-text">{row.quarter}</td>
                <td className="text-right text-bm-muted2">{fmtMoney(row.gross_return)}</td>
                <td className="text-right text-red-400">{fmtMoney(row.mgmt_fees)}</td>
                <td className="text-right text-red-400">{fmtMoney(row.fund_expenses)}</td>
                <td className="text-right font-medium text-bm-text pr-4">{fmtMoney(row.net_return)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CashFlowsTab({
  fundId,
  quarter,
  scenarioId,
}: {
  fundId: string | null;
  quarter: string;
  scenarioId?: string | null;
}) {
  const [rangeQ, setRangeQ] = useState(8);
  const { data, loading, error } = useQuarterlyTimeline(fundId, quarter, rangeQ, scenarioId);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-bm-muted" />
        <span className="ml-2 text-sm text-bm-muted">Loading quarterly timeline...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-bm-border/30 bg-bm-surface/5">
        <div className="text-center">
          <DollarSign size={24} className="mx-auto mb-2 text-bm-muted" />
          <p className="text-sm text-bm-muted2">No quarterly data available for this period.</p>
        </div>
      </div>
    );
  }

  const rows = data.rows;
  const irrData = rows.filter((r) => r.gross_irr != null).map((r) => ({ label: r.quarter, value: r.gross_irr! }));
  const tvpiData = rows.filter((r) => r.tvpi != null).map((r) => ({ label: r.quarter, value: r.tvpi! }));
  const navData = rows.map((r) => ({ label: r.quarter, value: r.portfolio_nav }));

  return (
    <div className="space-y-5">
      {/* Range selector */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-bm-muted2">
          {data.from_quarter} &mdash; {data.to_quarter} ({rows.length} quarter{rows.length !== 1 ? "s" : ""})
        </span>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRangeQ(opt.value)}
              className={`rounded-lg px-3 py-1.5 text-xs transition ${
                rangeQ === opt.value
                  ? "bg-bm-surface/50 text-bm-text font-medium"
                  : "text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics evolution charts */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
          <div className="text-[10px] uppercase text-bm-muted mb-2">Gross IRR Evolution</div>
          <MiniLineChart data={irrData} color="#60a5fa" height={60} />
          {irrData.length > 0 && (
            <div className="mt-1 text-xs font-medium text-bm-text">{fmtPct(irrData.at(-1)!.value)}</div>
          )}
        </div>
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
          <div className="text-[10px] uppercase text-bm-muted mb-2">TVPI Evolution</div>
          <MiniLineChart data={tvpiData} color="#34d399" height={60} />
          {tvpiData.length > 0 && (
            <div className="mt-1 text-xs font-medium text-bm-text">{fmtMultiple(tvpiData.at(-1)!.value)}</div>
          )}
        </div>
        <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
          <div className="text-[10px] uppercase text-bm-muted mb-2">NAV Evolution</div>
          <MiniLineChart data={navData} color="#a78bfa" height={60} />
          {navData.length > 0 && (
            <div className="mt-1 text-xs font-medium text-bm-text">{fmtMoney(navData.at(-1)!.value)}</div>
          )}
        </div>
      </div>

      {/* Cash flow stacked bar */}
      <CashFlowStackedBar rows={rows} />

      {/* Quarterly detail table */}
      <QuarterlyDetailTable rows={rows} />

      {/* Gross-net bridge */}
      <GrossNetBridgeTable rows={rows} />
    </div>
  );
}
