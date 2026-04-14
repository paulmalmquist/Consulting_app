"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { ReV2FundInvestmentRollupRow } from "@/lib/bos-api";
import { toNumberSafe } from "@/components/repe/workspace/repePortfolioFlags";
import { fmtMoney } from "@/lib/format-utils";

export type TrustState =
  | "Realized"
  | "Modeled"
  | "Stale"
  | "Partial CF"
  | "Terminal-value dominant";

export type PerformanceState = "Performing" | "Watch" | "Underperforming";

export type AssetRow = {
  investmentId: string;
  name: string;
  sector: string | null;
  market: string | null;
  invested: number | null;
  nav: number | null;
  navPct: number | null;
  irr: number | null;
  performance: PerformanceState | null;
  trust: TrustState;
  isArchived?: boolean;
};

type SortKey = "nav" | "irr" | "name";

interface Props {
  rollup: ReV2FundInvestmentRollupRow[];
  totalFundNav?: number | null;
  targetIrr?: number;
  envId: string;
  auditMode?: boolean;
  onRowSelect?: (investmentId: string) => void;
  snapshotVersion?: string | null;
}

const DEFAULT_TARGET_IRR = 0.12;

const PERFORMANCE_BAND_BPS = 0.02;

const PERFORMANCE_STYLE: Record<PerformanceState, string> = {
  Performing: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  Watch: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Underperforming: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const TRUST_STYLE: Record<TrustState, string> = {
  Realized: "bg-slate-200 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200",
  Modeled: "bg-slate-100 text-slate-600 dark:bg-slate-700/30 dark:text-slate-300",
  Stale: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Partial CF": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Terminal-value dominant": "bg-slate-100 text-slate-600 dark:bg-slate-700/30 dark:text-slate-300",
};

function performanceForIrr(irr: number | null, targetIrr: number): PerformanceState | null {
  if (irr === null) return null;
  if (irr >= targetIrr) return "Performing";
  if (irr >= targetIrr - PERFORMANCE_BAND_BPS) return "Watch";
  return "Underperforming";
}

function deriveTrust(row: ReV2FundInvestmentRollupRow): TrustState {
  const nav = toNumberSafe(row.fund_nav_contribution) ?? toNumberSafe(row.nav);
  const stage = row.stage?.toLowerCase() ?? "";
  if (stage.includes("realized") || stage.includes("exited") || stage.includes("sold")) {
    return "Realized";
  }
  if (nav === null || nav === 0) return "Modeled";
  return "Modeled";
}

function dominantSector(mix: Record<string, number> | null | undefined): string | null {
  if (!mix) return null;
  const entries = Object.entries(mix).filter(([, v]) => toNumberSafe(v) !== null);
  entries.sort((a, b) => (toNumberSafe(b[1]) ?? 0) - (toNumberSafe(a[1]) ?? 0));
  return entries[0]?.[0] ?? null;
}

export default function AssetContributionTable({
  rollup,
  totalFundNav,
  targetIrr = DEFAULT_TARGET_IRR,
  envId,
  auditMode = false,
  onRowSelect,
  snapshotVersion,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("nav");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const rows = useMemo<AssetRow[]>(() => {
    const filtered = rollup.filter((row) => {
      if (auditMode) return true;
      const archived = Boolean((row as { is_archived?: boolean }).is_archived);
      const quarantined = Boolean((row as { is_quarantined?: boolean }).is_quarantined);
      return !archived && !quarantined;
    });

    const fundNav =
      toNumberSafe(totalFundNav) ??
      filtered.reduce(
        (sum, row) => sum + Math.max(0, toNumberSafe(row.fund_nav_contribution) ?? toNumberSafe(row.nav) ?? 0),
        0
      );

    return filtered.map((row): AssetRow => {
      const nav = toNumberSafe(row.fund_nav_contribution) ?? toNumberSafe(row.nav) ?? toNumberSafe(row.total_asset_value);
      const invested = toNumberSafe(row.invested_capital) ?? toNumberSafe(row.committed_capital);
      const irr = toNumberSafe(row.gross_irr) ?? toNumberSafe(row.net_irr);
      return {
        investmentId: row.investment_id,
        name: row.name,
        sector: dominantSector(row.sector_mix),
        market: row.primary_market ?? null,
        invested,
        nav,
        navPct: fundNav > 0 && nav !== null ? (nav / fundNav) * 100 : null,
        irr,
        performance: performanceForIrr(irr, targetIrr),
        trust: deriveTrust(row),
        isArchived: Boolean((row as { is_archived?: boolean }).is_archived),
      };
    });
  }, [rollup, totalFundNav, targetIrr, auditMode]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((left, right) => {
      if (sortKey === "name") {
        const cmp = left.name.localeCompare(right.name);
        return sortDir === "desc" ? -cmp : cmp;
      }
      const leftV = sortKey === "nav" ? (left.nav ?? -Infinity) : (left.irr ?? -Infinity);
      const rightV = sortKey === "nav" ? (right.nav ?? -Infinity) : (right.irr ?? -Infinity);
      return sortDir === "desc" ? rightV - leftV : leftV - rightV;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <section
      data-testid="asset-contribution-table"
      aria-label="Asset contribution"
      className="rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-48px_rgba(15,23,42,0.14)] dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.92]"
    >
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-bm-border/[0.08]">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-bm-muted">
            Investments
          </div>
          <h2 className="text-sm font-semibold text-bm-ink">Contribution & performance</h2>
        </div>
        <div className="text-[10px] uppercase tracking-wide text-bm-muted">
          Target IRR <span className="font-mono">{(targetIrr * 100).toFixed(0)}%</span>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-bm-muted dark:border-bm-border/[0.08]">
              <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>
                Asset
              </Th>
              <th className="px-3 py-2 font-medium">Sector / Market</th>
              <th className="px-3 py-2 text-right font-medium">Invested</th>
              <Th onClick={() => toggleSort("nav")} active={sortKey === "nav"} dir={sortDir} align="right">
                NAV
              </Th>
              <th className="px-3 py-2 text-right font-medium">NAV %</th>
              <Th onClick={() => toggleSort("irr")} active={sortKey === "irr"} dir={sortDir} align="right">
                Asset IRR
              </Th>
              <th className="px-3 py-2 text-right font-medium">Contribution (bps)</th>
              <th className="px-3 py-2 text-right font-medium">Realized / Unrealized</th>
              <th className="px-3 py-2 font-medium">Performance</th>
              <th className="px-3 py-2 font-medium">Trust</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-bm-border/[0.06]">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-4 text-sm text-bm-muted">
                  Awaiting investment rollup
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <AssetRowView
                  key={row.investmentId}
                  row={row}
                  envId={envId}
                  onSelect={onRowSelect}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-2 text-[10px] uppercase tracking-wide text-bm-muted dark:border-bm-border/[0.08]">
        <span>
          Contribution & Realized / Unrealized: awaiting attribution engine
        </span>
        {snapshotVersion ? (
          <span className="ml-auto">
            Snapshot <span className="font-mono">{snapshotVersion}</span>
          </span>
        ) : null}
      </footer>
    </section>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  align = "left",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  dir?: "asc" | "desc";
  align?: "left" | "right";
}) {
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 uppercase tracking-wide ${
          active ? "text-bm-ink" : "text-bm-muted"
        }`}
        data-testid={`sort-${String(children).toLowerCase().replace(/[^a-z]/g, "-")}`}
      >
        {children}
        {active ? <span aria-hidden>{dir === "desc" ? "▾" : "▴"}</span> : null}
      </button>
    </th>
  );
}

function AssetRowView({
  row,
  envId,
  onSelect,
}: {
  row: AssetRow;
  envId: string;
  onSelect?: (id: string) => void;
}) {
  const navPctText = row.navPct !== null ? `${row.navPct.toFixed(1)}%` : null;
  const irrText = row.irr !== null ? `${(row.irr * 100).toFixed(1)}%` : null;
  const irrColor =
    row.irr === null
      ? "text-bm-muted"
      : row.performance === "Performing"
        ? "text-emerald-700"
        : row.performance === "Watch"
          ? "text-amber-700"
          : "text-red-700";

  return (
    <tr
      className={`hover:bg-slate-50 dark:hover:bg-bm-surface/[0.06] ${
        row.trust === "Stale" || row.trust === "Partial CF" ? "bg-amber-50/50 dark:bg-amber-950/10" : ""
      }`}
      onClick={() => onSelect?.(row.investmentId)}
      data-trust={row.trust}
      data-performance={row.performance ?? "unknown"}
    >
      <td className="px-3 py-2">
        <Link
          href={`/lab/env/${envId}/re/investments/${row.investmentId}`}
          className="font-medium text-bm-ink hover:text-bm-accent"
          onClick={(e) => e.stopPropagation()}
        >
          {row.name}
        </Link>
      </td>
      <td className="px-3 py-2 text-xs text-bm-muted">
        {row.sector ?? "Unclassified"}
        {row.market ? ` · ${row.market}` : ""}
      </td>
      <td className="px-3 py-2 text-right">
        {row.invested !== null ? fmtMoney(row.invested) : <Unavailable reason="Awaiting invested capital" />}
      </td>
      <td className="px-3 py-2 text-right">
        {row.nav !== null ? fmtMoney(row.nav) : <Unavailable reason="Awaiting NAV" />}
      </td>
      <td className="px-3 py-2 text-right">
        {navPctText ?? <Unavailable reason="Awaiting fund NAV total" />}
      </td>
      <td className={`px-3 py-2 text-right font-semibold ${irrColor}`}>
        {irrText ?? <Unavailable reason="Awaiting IRR" />}
      </td>
      <td className="px-3 py-2 text-right">
        <Unavailable reason="Awaiting attribution engine" />
      </td>
      <td className="px-3 py-2 text-right">
        <Unavailable reason="Awaiting attribution engine" />
      </td>
      <td className="px-3 py-2">
        {row.performance ? (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${PERFORMANCE_STYLE[row.performance]}`}
          >
            {row.performance}
          </span>
        ) : (
          <Unavailable reason="Awaiting IRR" />
        )}
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TRUST_STYLE[row.trust]}`}
          data-testid={`trust-chip-${row.investmentId}`}
        >
          {row.trust}
        </span>
      </td>
    </tr>
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <span
      className="text-xs italic text-bm-muted"
      data-null-reason={reason}
      title={reason}
    >
      {reason}
    </span>
  );
}
