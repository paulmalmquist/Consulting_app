"use client";
import React, { useMemo, useState } from "react";

import Link from "next/link";
import type { PdsV2PerformanceRow } from "@/lib/bos-api";
import {
  formatCurrency,
  formatPercent,
  signalDotClass,
  toNumber,
} from "@/components/pds-enterprise/pdsEnterprise";
import { PdsRiskBadge, deriveRiskLevel } from "@/components/pds-enterprise/PdsRiskBadge";

type SortKey =
  | "entity_label"
  | "fee_actual"
  | "fee_variance_pct"
  | "ci_actual"
  | "backlog"
  | "forecast"
  | "utilization_pct"
  | "risk_score";

type SortDir = "asc" | "desc";

function variancePct(actual: string | number | undefined, plan: string | number | undefined): number {
  const a = toNumber(actual);
  const p = toNumber(plan);
  if (p === 0) return 0;
  return (a - p) / Math.abs(p);
}

function riskScore(row: PdsV2PerformanceRow): number {
  let score = 0;
  const vPct = variancePct(row.fee_actual, row.fee_plan);
  if (vPct < -0.1) score += 30;
  else if (vPct < -0.03) score += 15;
  score += (row.red_projects || 0) * 10;
  score += (row.client_risk_accounts || 0) * 8;
  const util = toNumber(row.utilization_pct);
  if (util > 0 && util < 0.6) score += 15;
  return Math.min(score, 100);
}

function getSortValue(row: PdsV2PerformanceRow, key: SortKey): string | number {
  switch (key) {
    case "entity_label": return row.entity_label.toLowerCase();
    case "fee_actual": return toNumber(row.fee_actual);
    case "fee_variance_pct": return variancePct(row.fee_actual, row.fee_plan);
    case "ci_actual": return toNumber(row.ci_actual);
    case "backlog": return toNumber(row.backlog);
    case "forecast": return toNumber(row.forecast);
    case "utilization_pct": return toNumber(row.utilization_pct);
    case "risk_score": return riskScore(row);
  }
}

function SortHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className="cursor-pointer select-none pb-2 pr-3 text-right font-medium hover:text-blue-400"
      onClick={() => onSort(sortKey)}
    >
      <span className={active ? "text-blue-400" : ""}>
        {label}
        {active ? (currentDir === "asc" ? " \u25B2" : " \u25BC") : ""}
      </span>
    </th>
  );
}

export function PdsMarketLeaderboard({
  rows,
  filter,
  selectedMarketId,
  onRowClick,
}: {
  rows: PdsV2PerformanceRow[];
  filter?: string;
  selectedMarketId?: string | null;
  onRowClick?: (marketId: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("risk_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "entity_label" ? "asc" : "desc");
    }
  }

  const sorted = useMemo(() => {
    let filtered = rows;
    if (filter) {
      const q = filter.toLowerCase();
      filtered = rows.filter(
        (r) =>
          r.entity_label.toLowerCase().includes(q) ||
          (r.owner_label && r.owner_label.toLowerCase().includes(q))
      );
    }
    return [...filtered].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, filter, sortKey, sortDir]);

  // Identify top 2 worst rows for subtle highlight (only when sorted by risk)
  const highlightIds = useMemo(() => {
    if (sortKey !== "risk_score" || sortDir !== "desc") return new Set<string>();
    return new Set(
      sorted.filter((r) => riskScore(r) >= 30).slice(0, 2).map((r) => r.entity_id)
    );
  }, [sorted, sortKey, sortDir]);

  return (
    <section className="rounded-lg" data-testid="pds-market-leaderboard">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
            <tr className="border-b border-slate-700/30">
              <th className="pb-2 pr-3 font-medium text-left">Market</th>
              <SortHeader label="Revenue" sortKey="fee_actual" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Rev vs Plan" sortKey="fee_variance_pct" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="CI" sortKey="ci_actual" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Backlog" sortKey="backlog" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Forecast" sortKey="forecast" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Util" sortKey="utilization_pct" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Risk" sortKey="risk_score" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const vPct = variancePct(row.fee_actual, row.fee_plan);
              const risk = riskScore(row);
              const riskLvl = deriveRiskLevel(risk);
              return (
                <tr
                  key={row.entity_id}
                  className={`border-b border-slate-700/20 last:border-b-0 hover:bg-slate-700/15 transition ${
                    selectedMarketId === row.entity_id
                      ? "bg-blue-500/[0.06]"
                      : highlightIds.has(row.entity_id)
                        ? "bg-red-500/[0.03]"
                        : ""
                  } ${onRowClick ? "cursor-pointer" : ""}`}
                  onClick={() => onRowClick?.(row.entity_id)}
                >
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${signalDotClass(row.health_status)}`} />
                      {row.href ? (
                        <Link href={row.href} className="font-medium text-bm-text hover:text-blue-400 hover:underline">
                          {row.entity_label}
                        </Link>
                      ) : (
                        <span className="font-medium text-bm-text">{row.entity_label}</span>
                      )}
                    </div>
                    {row.owner_label ? (
                      <p className="ml-4 text-[11px] text-slate-500">{row.owner_label}</p>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCurrency(row.fee_actual)}</td>
                  <td className={`py-2.5 pr-3 text-right tabular-nums font-medium ${vPct < -0.05 ? "text-red-400" : vPct < 0 ? "text-amber-400" : "text-emerald-400"}`}>
                    {vPct >= 0 ? "+" : ""}{formatPercent(vPct, 1)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCurrency(row.ci_actual)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCurrency(row.backlog)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatCurrency(row.forecast)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {toNumber(row.utilization_pct) > 0 ? formatPercent(row.utilization_pct, 0) : "—"}
                  </td>
                  <td className="py-2.5 text-right">
                    <PdsRiskBadge level={riskLvl} />
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sm text-slate-500">
                  No markets match the current filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
