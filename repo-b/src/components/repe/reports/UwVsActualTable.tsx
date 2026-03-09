"use client";
import React from "react";

/* ── UwVsActualTable ──────────────────────────────────────────────
   Portfolio scorecard table with color-coded deltas.
   Renders: Name | Strategy | UW IRR | Actual IRR | delta IRR |
            UW MOIC | Actual MOIC | delta MOIC | delta NAV
   ────────────────────────────────────────────────────────────────── */

export interface ScorecardRow {
  investment_id: string;
  name: string;
  strategy: string;
  uw_irr: number | null;
  actual_irr: number | null;
  delta_irr: number | null;
  uw_moic: number | null;
  actual_moic: number | null;
  delta_moic: number | null;
  uw_nav: number | null;
  actual_nav: number | null;
  delta_nav: number | null;
}

interface UwVsActualTableProps {
  rows: ScorecardRow[];
  onRowClick: (row: ScorecardRow) => void;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "--";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtMoic(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "--";
  return `${v.toFixed(2)}x`;
}

function fmtNav(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "--";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function deltaColor(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "text-bm-muted2";
  if (val > 0) return "text-emerald-400";
  if (val < 0) return "text-red-400";
  return "text-bm-muted2";
}

function fmtDeltaPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "--";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}

function fmtDeltaMoic(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "--";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}x`;
}

function fmtDeltaNav(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "--";
  const sign = v > 0 ? "+" : "";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${sign}$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(v / 1e3).toFixed(0)}K`;
  return `${sign}$${v.toFixed(0)}`;
}

export default function UwVsActualTable({
  rows,
  onRowClick,
}: UwVsActualTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center text-sm text-bm-muted2">
        No scorecard data available for the selected filters.
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-bm-border/70 overflow-hidden"
      data-testid="uw-vs-actual-table"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Strategy</th>
              <th className="px-4 py-2.5 font-medium text-right">UW IRR</th>
              <th className="px-4 py-2.5 font-medium text-right">
                Actual IRR
              </th>
              <th className="px-4 py-2.5 font-medium text-right">
                Delta IRR
              </th>
              <th className="px-4 py-2.5 font-medium text-right">UW MOIC</th>
              <th className="px-4 py-2.5 font-medium text-right">
                Actual MOIC
              </th>
              <th className="px-4 py-2.5 font-medium text-right">
                Delta MOIC
              </th>
              <th className="px-4 py-2.5 font-medium text-right">
                Delta NAV
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {rows.map((row) => (
              <tr
                key={row.investment_id}
                onClick={() => onRowClick(row)}
                className="cursor-pointer hover:bg-bm-surface/30 transition-colors"
                data-testid={`scorecard-row-${row.investment_id}`}
              >
                <td className="px-4 py-2.5 font-medium">{row.name}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center rounded-full border border-bm-border/70 px-2 py-0.5 text-xs text-bm-muted2">
                    {row.strategy}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {fmtPct(row.uw_irr)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {fmtPct(row.actual_irr)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums font-medium ${deltaColor(row.delta_irr)}`}
                >
                  {fmtDeltaPct(row.delta_irr)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {fmtMoic(row.uw_moic)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {fmtMoic(row.actual_moic)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums font-medium ${deltaColor(row.delta_moic)}`}
                >
                  {fmtDeltaMoic(row.delta_moic)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums font-medium ${deltaColor(row.delta_nav)}`}
                >
                  {fmtDeltaNav(row.delta_nav)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
