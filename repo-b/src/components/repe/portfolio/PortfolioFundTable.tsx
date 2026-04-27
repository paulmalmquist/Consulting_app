"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown } from "lucide-react";
import {
  type FundTableRow,
  type ReV2AuthoritativeState,
} from "@/lib/bos-api";
import { useRepeBasePath } from "@/lib/repe-context";
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
import { TrustChip } from "@/components/re/TrustChip";
import { ScopeBadge, type ScopeMetadata } from "@/components/re/ScopeBadge";
import { UnavailableCell } from "@/components/re/UnavailableTile";
import type { LockState } from "@/hooks/useAuthoritativeState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortDir = "asc" | "desc";
type EnrichedRow = FundTableRow & { auth: ReV2AuthoritativeState | null };

interface ColumnDef {
  key: string;
  label: string;
  align: "left" | "right";
  sortable: boolean;
  format: (row: EnrichedRow) => React.ReactNode;
  sortValue: (row: EnrichedRow) => number | string;
  hasInlineBar?: boolean;
  barValue?: (row: EnrichedRow) => number | null;
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

// ---------------------------------------------------------------------------
// Auth-state helpers (mirror /lab/env/[envId]/re/page.tsx pattern)
// ---------------------------------------------------------------------------

function isReleased(fund: EnrichedRow): boolean {
  const a = fund.auth;
  return Boolean(
    a
      && a.promotion_state === "released"
      && a.state_origin === "authoritative"
      && a.period_exact === true,
  );
}

function authNumeric(fund: EnrichedRow, field: string): number | null {
  if (!isReleased(fund)) return null;
  const cm = fund.auth?.state?.canonical_metrics as Record<string, unknown> | undefined;
  const v = cm?.[field];
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function authNullReason(fund: EnrichedRow, field: string): string {
  const reasons = fund.auth?.null_reasons as Record<string, unknown> | undefined;
  const r = reasons?.[field];
  if (typeof r === "string" && r) return r;
  if (!isReleased(fund)) return "authoritative_state_not_released";
  return `missing:${field}`;
}

function authScopeMeta(fund: EnrichedRow): ScopeMetadata | null {
  const cm = fund.auth?.state?.canonical_metrics as Record<string, unknown> | undefined;
  const scope = cm?.scope;
  if (!scope || typeof scope !== "object") return null;
  const s = scope as Record<string, unknown>;
  return {
    investment_count: typeof s.investment_count === "number" ? s.investment_count : null,
    expected_investment_count:
      typeof s.expected_investment_count === "number" ? s.expected_investment_count : null,
    scope_completeness: typeof s.scope_completeness === "string" ? s.scope_completeness : null,
    scope_contract_version:
      typeof s.scope_contract_version === "string" ? s.scope_contract_version : null,
  };
}

function lockStateOf(fund: EnrichedRow): LockState {
  const a = fund.auth;
  if (!a) return "not_found";
  if (a.null_reason === "authoritative_state_not_released") return "not_released";
  if (a.null_reason === "authoritative_state_not_found") return "not_found";
  if (a.null_reason) return "not_released";
  if (!a.period_exact) return "period_drift";
  if (a.state_origin !== "authoritative") return "period_drift";
  if (a.promotion_state === "released") return "released";
  if (a.promotion_state === "verified") return "verified";
  return "not_released";
}

function bridgeTooltip(fund: EnrichedRow): string {
  const cm = (fund.auth?.state?.canonical_metrics ?? {}) as Record<string, unknown>;
  const bridge = fund.auth?.state?.gross_to_net_bridge;
  const lines: string[] = [];
  if (cm.net_irr != null) lines.push(`Net IRR: ${fmtPctFromDecimal(String(cm.net_irr))}`);
  if (cm.gross_irr != null) lines.push(`Gross IRR: ${fmtPctFromDecimal(String(cm.gross_irr))}`);
  if (bridge?.management_fees != null) lines.push(`– Management fees: ${fmtMoney(String(bridge.management_fees))}`);
  if (bridge?.fund_expenses != null) lines.push(`– Fund expenses: ${fmtMoney(String(bridge.fund_expenses))}`);
  if (bridge?.gross_return_amount != null) lines.push(`Gross return: ${fmtMoney(String(bridge.gross_return_amount))}`);
  if (bridge?.net_return_amount != null) lines.push(`Net return: ${fmtMoney(String(bridge.net_return_amount))}`);
  if (!bridge) lines.push("Gross-to-net bridge unavailable in this snapshot.");
  return lines.join("\n");
}

function masterTargetSize(row: FundTableRow): number | null {
  if (!row.target_size) return null;
  const n = parseFloat(row.target_size);
  return Number.isFinite(n) ? n : null;
}

function pctBar(val: number | null, max: number): number | null {
  if (val === null || max <= 0) return null;
  const barPct = Math.min(Math.max((val / max) * 100, 0), 100);
  return barPct;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface PortfolioFundTableProps {
  rows: FundTableRow[];
  authStatesByFundId: Map<string, ReV2AuthoritativeState>;
  loading: boolean;
  error: string | null;
  quarter: string;
}

export function PortfolioFundTable({
  rows,
  authStatesByFundId,
  loading,
  error,
}: PortfolioFundTableProps) {
  const basePath = useRepeBasePath();
  const { filters, ui } = usePortfolioFilters();

  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const enrichedRows = useMemo<EnrichedRow[]>(
    () => rows.map((r) => ({ ...r, auth: authStatesByFundId.get(r.fund_id) ?? null })),
    [rows, authStatesByFundId],
  );

  const columns = useMemo<ColumnDef[]>(() => {
    const irrValues = enrichedRows
      .map((r) => authNumeric(r, "gross_irr"))
      .filter((v): v is number => v !== null);
    const maxIrr = Math.max(...irrValues.map((v) => Math.abs(v)), 0.01);

    const tvpiValues = enrichedRows
      .map((r) => authNumeric(r, "tvpi"))
      .filter((v): v is number => v !== null);
    const maxTvpi = Math.max(...tvpiValues, 0.01);

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
            <div className="mt-1 flex items-center gap-1.5">
              <TrustChip
                lockState={lockStateOf(r)}
                snapshotVersion={r.auth?.snapshot_version ?? null}
                trustStatus={r.auth?.trust_status ?? null}
              />
              <ScopeBadge scope={authScopeMeta(r)} />
            </div>
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
        format: (r) => {
          const auth = authNumeric(r, "total_committed");
          if (auth !== null) {
            return <span data-metric="aum">{fmtMoney(String(auth))}</span>;
          }
          const target = masterTargetSize(r);
          if (target !== null) {
            return (
              <span data-metric="aum" data-source="target">
                {fmtMoney(String(target))}
                <span
                  className="ml-1.5 inline-block rounded px-1 py-0 text-[9px] uppercase tracking-wide text-bm-muted2/80 border border-bm-muted2/30"
                  title="Target size — pre-release commitment estimate"
                >
                  target
                </span>
              </span>
            );
          }
          return <UnavailableCell nullReason="missing_commitment" />;
        },
        sortValue: (r) => authNumeric(r, "total_committed") ?? masterTargetSize(r) ?? -Infinity,
      },
      {
        key: "nav",
        label: "NAV",
        align: "right",
        sortable: true,
        format: (r) => {
          const v = authNumeric(r, "ending_nav");
          if (v === null) return <UnavailableCell nullReason={authNullReason(r, "ending_nav")} />;
          return <span data-metric="nav">{fmtMoney(String(v))}</span>;
        },
        sortValue: (r) => authNumeric(r, "ending_nav") ?? -Infinity,
      },
      {
        key: "gross_irr",
        label: "Gross IRR",
        align: "right",
        sortable: true,
        hasInlineBar: true,
        barValue: (r) => {
          const v = authNumeric(r, "gross_irr");
          if (v === null) return null;
          return pctBar(Math.abs(v) * 100, maxIrr * 100);
        },
        format: (r) => {
          const v = authNumeric(r, "gross_irr");
          if (v === null) return <UnavailableCell nullReason={authNullReason(r, "gross_irr")} />;
          return <span data-metric="gross_irr">{fmtPctFromDecimal(String(v))}</span>;
        },
        sortValue: (r) => authNumeric(r, "gross_irr") ?? -Infinity,
      },
      {
        key: "net_irr",
        label: "Net IRR",
        align: "right",
        sortable: true,
        format: (r) => {
          const reasons = r.auth?.null_reasons as Record<string, unknown> | undefined;
          const reason = reasons?.net_irr;
          if (typeof reason === "string" && reason === "out_of_scope_requires_waterfall") {
            return <UnavailableCell nullReason="out_of_scope_requires_waterfall" />;
          }
          const v = authNumeric(r, "net_irr");
          if (v === null) return <UnavailableCell nullReason={authNullReason(r, "net_irr")} />;
          return (
            <span
              data-metric="net_irr"
              title={bridgeTooltip(r)}
              className="cursor-help underline decoration-dotted decoration-bm-muted2/40 underline-offset-2"
            >
              {fmtPctFromDecimal(String(v))}
            </span>
          );
        },
        sortValue: (r) => authNumeric(r, "net_irr") ?? -Infinity,
      },
      {
        key: "dpi",
        label: "DPI",
        align: "right",
        sortable: true,
        format: (r) => {
          const v = authNumeric(r, "dpi");
          if (v === null) return <UnavailableCell nullReason={authNullReason(r, "dpi")} />;
          return <span data-metric="dpi">{`${v.toFixed(2)}x`}</span>;
        },
        sortValue: (r) => authNumeric(r, "dpi") ?? -Infinity,
      },
      {
        key: "tvpi_gross",
        label: "Gross TVPI",
        align: "right",
        sortable: true,
        hasInlineBar: true,
        barValue: (r) => {
          const v = authNumeric(r, "tvpi");
          return pctBar(v, maxTvpi);
        },
        format: (r) => {
          const v = authNumeric(r, "tvpi");
          if (v === null) return <UnavailableCell nullReason={authNullReason(r, "tvpi")} />;
          return <span data-metric="gross_tvpi">{`${v.toFixed(2)}x`}</span>;
        },
        sortValue: (r) => authNumeric(r, "tvpi") ?? -Infinity,
      },
      {
        key: "tvpi_net",
        label: "Net TVPI",
        align: "right",
        sortable: true,
        format: (r) => {
          const v = authNumeric(r, "net_tvpi");
          if (v === null) return <UnavailableCell nullReason={authNullReason(r, "net_tvpi")} />;
          return <span data-metric="net_tvpi">{`${v.toFixed(2)}x`}</span>;
        },
        sortValue: (r) => authNumeric(r, "net_tvpi") ?? -Infinity,
      },
      {
        key: "pct_invested",
        label: "% Invested",
        align: "right",
        sortable: true,
        hasInlineBar: true,
        barValue: (r) => {
          if (!isReleased(r)) return null;
          const committed = authNumeric(r, "total_committed");
          const called = authNumeric(r, "total_called");
          if (committed === null || called === null || committed <= 0) return null;
          return Math.min(Math.max((called / committed) * 100, 0), 100);
        },
        format: (r) => {
          if (!isReleased(r)) {
            return <UnavailableCell nullReason="authoritative_state_not_released" />;
          }
          const committed = authNumeric(r, "total_committed");
          const called = authNumeric(r, "total_called");
          if (committed === null || committed <= 0 || called === null) {
            const reasons = r.auth?.null_reasons as Record<string, unknown> | undefined;
            const reason =
              (typeof reasons?.total_called === "string" && reasons.total_called) ||
              (typeof reasons?.total_committed === "string" && reasons.total_committed) ||
              "missing_pct_invested_inputs";
            return <UnavailableCell nullReason={reason} />;
          }
          return <span data-metric="pct_invested">{fmtPct(called / committed)}</span>;
        },
        sortValue: (r) => {
          const committed = authNumeric(r, "total_committed");
          const called = authNumeric(r, "total_called");
          if (committed === null || called === null || committed <= 0) return -Infinity;
          return called / committed;
        },
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
  }, [enrichedRows, basePath]);

  const filteredRows = useMemo(() => {
    return enrichedRows.filter((r) => {
      if (filters.strategy && r.strategy !== filters.strategy) return false;
      if (filters.vintage && String(r.vintage_year) !== filters.vintage) return false;
      if (filters.status && r.status !== filters.status) return false;

      for (const mf of filters.metricFilters) {
        const val = authNumeric(r, mf.field);
        if (val === null) continue;
        switch (mf.operator) {
          case "<": if (!(val < mf.value)) return false; break;
          case ">": if (!(val > mf.value)) return false; break;
          case "<=": if (!(val <= mf.value)) return false; break;
          case ">=": if (!(val >= mf.value)) return false; break;
          case "=": if (!(Math.abs(val - mf.value) < 0.0001)) return false; break;
        }
      }

      if (ui.chartSelection?.dimension === "fund" && r.fund_id !== ui.chartSelection.value) {
        return false;
      }

      if (ui.signalScope) {
        const overrides = ui.signalScope.filterOverrides;
        if (overrides.dscr_max) {
          const dscr = authNumeric(r, "weighted_dscr");
          if (dscr !== null && dscr > parseFloat(overrides.dscr_max)) return false;
        }
      }

      return true;
    });
  }, [enrichedRows, filters, ui.chartSelection, ui.signalScope]);

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
        <table className={`${reIndexTableClass} min-w-[1200px]`}>
          <thead className="sticky top-0 z-10 bg-bm-bg">
            <tr className={reIndexTableHeadRowClass}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 font-semibold text-[10px] uppercase tracking-[0.17em] ${
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
                  {columns.map((col) => {
                    const barWidth = col.hasInlineBar && col.barValue ? col.barValue(fund) : null;
                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-3 align-middle ${col.align === "right" ? reIndexNumericCellClass : "text-[13px] text-slate-600"} relative`}
                      >
                        {barWidth !== null && (
                          <div
                            className="absolute inset-y-0 left-0 bg-bm-accent/8 pointer-events-none"
                            style={{ width: `${barWidth}%` }}
                          />
                        )}
                        <span className="relative z-[1]">{col.format(fund)}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
