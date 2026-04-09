"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trash2, ChevronUp, ChevronDown, Filter } from "lucide-react";
import { getFundTableRows, type FundTableRow } from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { usePortfolioFilters } from "./PortfolioFilterContext";
import { StateCard } from "@/components/ui/StateCard";
import { fmtMoney, fmtPct, fmtPctFromDecimal } from "@/lib/format-utils";
import {
  reIndexTableShellClass,
  reIndexTableClass,
  reIndexTableHeadRowClass,
  reIndexTableBodyClass,
  reIndexTableRowClass,
  reIndexPrimaryCellClass,
  reIndexSecondaryCellClass,
  reIndexNumericCellClass,
} from "@/components/repe/RepeIndexScaffold";

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

type SortDir = "asc" | "desc";

interface ColumnDef {
  key: string;
  label: string;
  align: "left" | "right";
  sortable: boolean;
  format: (row: FundTableRow) => React.ReactNode;
  sortValue: (row: FundTableRow) => number | string;
  hasInlineBar?: boolean;
  barValue?: (row: FundTableRow) => number | null;
  testId?: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  fundraising: { bg: "bg-bm-accent/20", text: "text-bm-accent", dot: "bg-bm-accent" },
  investing: { bg: "bg-blue-500/15", text: "text-blue-400", dot: "bg-blue-400" },
  harvesting: { bg: "bg-amber-500/15", text: "text-amber-400", dot: "bg-amber-400" },
  closed: { bg: "bg-bm-muted2/10", text: "text-bm-muted2", dot: "bg-bm-muted2" },
};

const FUND_TYPE_LABELS: Record<string, string> = {
  closed_end: "Closed-End",
  open_end: "Open-End",
  sma: "SMA",
  co_invest: "Co-Invest",
};

const STATUS_ORDER: Record<string, number> = {
  fundraising: 0, investing: 1, harvesting: 2, closed: 3,
};

function numVal(s: string | null | undefined): number {
  if (!s) return -Infinity;
  const n = parseFloat(s);
  return isNaN(n) ? -Infinity : n;
}

function pctBar(val: number | null, max: number): number {
  if (val === null || max <= 0) return 0;
  return Math.min(Math.max((val / max) * 100, 0), 100);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PortfolioFundTableProps {
  onDeleteFund?: (fund: FundTableRow) => void;
}

export function PortfolioFundTable({ onDeleteFund }: PortfolioFundTableProps) {
  const { businessId, environmentId } = useRepeContext();
  const basePath = useRepeBasePath();
  const { filters, ui, setChartSelection } = usePortfolioFilters();

  const [rows, setRows] = useState<FundTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Fetch data
  useEffect(() => {
    if (!environmentId) return;
    setLoading(true);
    getFundTableRows(environmentId, filters.quarter, filters.activeModelId || undefined)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load fund data"))
      .finally(() => setLoading(false));
  }, [environmentId, filters.quarter, filters.activeModelId]);

  // Column definitions
  const columns = useMemo<ColumnDef[]>(() => {
    const maxIrr = Math.max(...rows.map((r) => Math.abs(numVal(r.gross_irr))).filter((v) => v > 0), 0.01);
    const maxTvpi = Math.max(...rows.map((r) => numVal(r.tvpi)).filter((v) => v > 0), 0.01);

    return [
      {
        key: "name",
        label: "Fund",
        align: "left",
        sortable: true,
        format: (r) => (
          <div>
            <Link href={`${basePath}/funds/${r.fund_id}`} className={reIndexPrimaryCellClass}>
              {r.name}
            </Link>
            <p className={`mt-0.5 ${reIndexSecondaryCellClass}`}>
              {r.strategy && <span className="capitalize">{r.strategy}</span>}
              {r.strategy && r.fund_type && " · "}
              {r.fund_type && (FUND_TYPE_LABELS[r.fund_type] || r.fund_type)}
            </p>
          </div>
        ),
        sortValue: (r) => r.name.toLowerCase(),
      },
      {
        key: "vintage",
        label: "Vintage",
        align: "left",
        sortable: true,
        format: (r) => <span className={reIndexSecondaryCellClass}>{r.vintage_year || "—"}</span>,
        sortValue: (r) => r.vintage_year || 0,
      },
      {
        key: "aum",
        label: "AUM",
        align: "right",
        sortable: true,
        format: (r) => fmtMoney(r.target_size),
        sortValue: (r) => numVal(r.target_size),
      },
      {
        key: "nav",
        label: "NAV",
        align: "right",
        sortable: true,
        format: (r) => fmtMoney(r.portfolio_nav),
        sortValue: (r) => numVal(r.portfolio_nav),
      },
      {
        key: "gross_irr",
        label: "Gross IRR",
        align: "right",
        sortable: true,
        hasInlineBar: true,
        barValue: (r) => {
          const v = numVal(r.gross_irr);
          return v > -Infinity ? pctBar(Math.abs(v * 100), maxIrr * 100) : null;
        },
        format: (r) => (
          <span data-metric="gross_irr">{fmtPctFromDecimal(r.gross_irr)}</span>
        ),
        sortValue: (r) => numVal(r.gross_irr),
      },
      {
        key: "net_irr",
        label: "Net IRR",
        align: "right",
        sortable: true,
        format: (r) => fmtPctFromDecimal(r.net_irr),
        sortValue: (r) => numVal(r.net_irr),
      },
      {
        key: "dpi",
        label: "DPI",
        align: "right",
        sortable: true,
        format: (r) => r.dpi ? `${parseFloat(r.dpi).toFixed(2)}x` : "—",
        sortValue: (r) => numVal(r.dpi),
      },
      {
        key: "tvpi",
        label: "TVPI",
        align: "right",
        sortable: true,
        hasInlineBar: true,
        barValue: (r) => {
          const v = numVal(r.tvpi);
          return v > -Infinity ? pctBar(v, maxTvpi) : null;
        },
        format: (r) => (
          <span data-metric="tvpi">{r.tvpi ? `${parseFloat(r.tvpi).toFixed(2)}x` : "—"}</span>
        ),
        sortValue: (r) => numVal(r.tvpi),
      },
      {
        key: "pct_invested",
        label: "% Invested",
        align: "right",
        sortable: true,
        hasInlineBar: true,
        barValue: (r) => {
          const v = numVal(r.pct_invested);
          return v > -Infinity ? v * 100 : null;
        },
        format: (r) => fmtPctFromDecimal(r.pct_invested),
        sortValue: (r) => numVal(r.pct_invested),
      },
      {
        key: "status",
        label: "Status",
        align: "left",
        sortable: true,
        format: (r) => {
          const colors = STATUS_COLORS[r.status] || STATUS_COLORS.closed;
          return (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] capitalize ${colors.bg} ${colors.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
              {r.status}
            </span>
          );
        },
        sortValue: (r) => STATUS_ORDER[r.status] ?? 99,
      },
    ];
  }, [rows, basePath]);

  // Filter rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filters.strategy && r.strategy !== filters.strategy) return false;
      if (filters.vintage && String(r.vintage_year) !== filters.vintage) return false;
      if (filters.status && r.status !== filters.status) return false;

      // Metric filters
      for (const mf of filters.metricFilters) {
        const val = numVal((r as unknown as Record<string, string | null>)[mf.field]);
        if (val === -Infinity) continue;
        switch (mf.operator) {
          case "<": if (!(val < mf.value)) return false; break;
          case ">": if (!(val > mf.value)) return false; break;
          case "<=": if (!(val <= mf.value)) return false; break;
          case ">=": if (!(val >= mf.value)) return false; break;
          case "=": if (!(Math.abs(val - mf.value) < 0.0001)) return false; break;
        }
      }

      // Chart selection filter
      if (ui.chartSelection?.dimension === "fund" && r.fund_id !== ui.chartSelection.value) {
        return false;
      }

      // Signal scope filter overrides
      if (ui.signalScope) {
        const overrides = ui.signalScope.filterOverrides;
        if (overrides.dscr_max && r.weighted_dscr) {
          if (numVal(r.weighted_dscr) > parseFloat(overrides.dscr_max)) return false;
        }
      }

      return true;
    });
  }, [rows, filters, ui.chartSelection, ui.signalScope]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortCol) return filteredRows;
    const col = columns.find((c) => c.key === sortCol);
    if (!col) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const va = col.sortValue(a);
      const vb = col.sortValue(b);
      let cmp: number;
      if (typeof va === "string" && typeof vb === "string") {
        cmp = va.localeCompare(vb);
      } else {
        cmp = (va as number) - (vb as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortCol, sortDir, columns]);

  const handleSort = useCallback((key: string) => {
    if (sortCol === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(key);
      setSortDir("desc");
    }
  }, [sortCol]);

  // Highlight logic
  const highlightedFundIds = useMemo(() => {
    const ids = new Set<string>();
    if (ui.hoveredFundId) ids.add(ui.hoveredFundId);
    return ids;
  }, [ui.hoveredFundId]);

  if (loading) {
    return <StateCard state="loading" />;
  }

  if (error) {
    return <StateCard state="error" title="Failed to load fund data" message={error} />;
  }

  if (sortedRows.length === 0) {
    if (rows.length > 0) {
      return (
        <div className="rounded-lg border border-bm-border/20 p-4 text-center text-sm text-bm-muted2">
          No funds match the current filters.
        </div>
      );
    }
    return (
      <StateCard
        state="empty"
        title="No funds yet"
        description="Create your first fund to get started with the portfolio."
      />
    );
  }

  return (
    <section data-testid="re-funds-list">
      <div className={reIndexTableShellClass}>
        <table className={`${reIndexTableClass} min-w-[1100px]`}>
          <thead className="sticky top-0 z-10 bg-bm-bg">
            <tr className={reIndexTableHeadRowClass}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 font-medium text-[11px] uppercase tracking-wider ${
                    col.align === "right" ? "text-right" : "text-left"
                  } ${col.sortable ? "cursor-pointer select-none hover:text-bm-text transition-colors" : ""}`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortCol === col.key && (
                      sortDir === "asc"
                        ? <ChevronUp className="h-3 w-3" />
                        : <ChevronDown className="h-3 w-3" />
                    )}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2.5 w-8"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className={reIndexTableBodyClass}>
            {sortedRows.map((fund) => {
              const isHighlighted = highlightedFundIds.has(fund.fund_id);
              return (
                <tr
                  key={fund.fund_id}
                  data-testid={`fund-row-${fund.fund_id}`}
                  className={`${reIndexTableRowClass} ${isHighlighted ? "bg-bm-accent/5 ring-1 ring-inset ring-bm-accent/20" : ""}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-3 align-middle ${col.align === "right" ? reIndexNumericCellClass : ""} relative`}
                    >
                      {col.hasInlineBar && col.barValue && (
                        <div
                          className="absolute inset-y-0 left-0 bg-bm-accent/8 pointer-events-none"
                          style={{ width: `${col.barValue(fund) ?? 0}%` }}
                        />
                      )}
                      <span className="relative z-[1]">{col.format(fund)}</span>
                    </td>
                  ))}
                  <td className="px-3 py-3 align-middle text-right">
                    {onDeleteFund && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDeleteFund(fund); }}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-bm-muted2 transition-colors hover:bg-bm-danger/10 hover:text-bm-danger"
                        data-testid={`delete-fund-${fund.fund_id}`}
                        title="Delete fund"
                      >
                        <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
