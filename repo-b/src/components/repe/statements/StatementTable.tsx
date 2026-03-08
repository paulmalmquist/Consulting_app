"use client";

import { useCallback, useEffect, useState } from "react";
import type { ComparisonMode, PeriodType, Scenario, StatementType } from "./StatementToolbar";
import StatementToolbar from "./StatementToolbar";

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */
interface StatementLine {
  line_code: string;
  display_label: string;
  group_label: string;
  sort_order: number;
  is_subtotal: boolean;
  indent_level: number;
  sign_display: number;
  format_type: string;
  amount: number;
  comparison_amount: number | null;
  variance: number | null;
  variance_pct: number | null;
}

interface StatementResponse {
  statement: string;
  period: string;
  period_type: string;
  scenario: string;
  comparison: string;
  lines: StatementLine[];
}

interface Props {
  entityType: "asset" | "investment";
  entityId: string;
  envId: string;
  businessId: string;
  initialQuarter?: string;
  availablePeriods?: string[];
}

/* --------------------------------------------------------------------------
 * Formatting
 * -------------------------------------------------------------------------- */
function fmtValue(value: number, formatType: string, signDisplay: number): string {
  if (value === 0 && formatType === "currency") return "—";
  const displayVal = formatType === "currency" ? value * signDisplay : value;

  switch (formatType) {
    case "currency": {
      const abs = Math.abs(displayVal);
      const sign = displayVal < 0 ? "-" : "";
      if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
      if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
      return `${sign}$${abs.toFixed(0)}`;
    }
    case "percent":
      return `${(displayVal * 100).toFixed(1)}%`;
    case "ratio":
      return `${displayVal.toFixed(2)}x`;
    default:
      return displayVal.toFixed(0);
  }
}

/* --------------------------------------------------------------------------
 * Component
 * -------------------------------------------------------------------------- */
export default function StatementTable({
  entityType,
  entityId,
  envId,
  businessId,
  initialQuarter = "2026Q1",
  availablePeriods,
}: Props) {
  const [statementType, setStatementType] = useState<StatementType>("IS");
  const [periodType, setPeriodType] = useState<PeriodType>("quarterly");
  const [period, setPeriod] = useState(initialQuarter);
  const [scenario, setScenario] = useState<Scenario>("actual");
  const [comparison, setComparison] = useState<ComparisonMode>("none");
  const [data, setData] = useState<StatementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  // Fetch statement data
  useEffect(() => {
    if (!envId || !businessId || !period) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const basePath =
      entityType === "asset"
        ? `/api/re/v2/assets/${entityId}/statements`
        : `/api/re/v2/investments/${entityId}/statements`;

    const params = new URLSearchParams({
      statement: statementType,
      period_type: periodType,
      period,
      scenario,
      comparison,
      env_id: envId,
      business_id: businessId,
    });

    fetch(`${basePath}?${params}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
          setData(null);
        } else {
          setData(json);
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [entityType, entityId, envId, businessId, statementType, periodType, period, scenario, comparison]);

  // Group lines by group_label
  const groups: { label: string; lines: StatementLine[] }[] = [];
  if (data?.lines) {
    let currentGroup = "";
    for (const line of data.lines) {
      if (line.group_label !== currentGroup) {
        currentGroup = line.group_label;
        groups.push({ label: currentGroup, lines: [] });
      }
      groups[groups.length - 1].lines.push(line);
    }
  }

  const hasComparison = data?.lines?.some((l) => l.comparison_amount !== null) ?? false;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <StatementToolbar
        statementType={statementType}
        onStatementTypeChange={setStatementType}
        periodType={periodType}
        onPeriodTypeChange={setPeriodType}
        period={period}
        onPeriodChange={setPeriod}
        scenario={scenario}
        onScenarioChange={setScenario}
        comparison={comparison}
        onComparisonChange={setComparison}
        availablePeriods={availablePeriods}
      />

      {/* Table */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 overflow-hidden">
        {loading && (
          <div className="px-4 py-8 text-center text-sm text-bm-muted2">
            Loading statement...
          </div>
        )}

        {error && (
          <div className="px-4 py-4 text-sm text-red-400">{error}</div>
        )}

        {!loading && !error && data && data.lines.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-bm-muted2">
            No financial data for this period.
          </div>
        )}

        {!loading && !error && data && data.lines.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  <th className="sticky left-0 bg-bm-surface/50 px-4 py-2.5 text-left font-medium min-w-[200px]">
                    Line Item
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium min-w-[120px]">
                    {scenario === "actual" ? "Actual" : scenario === "budget" ? "Budget" : "Pro Forma"}
                  </th>
                  {hasComparison && (
                    <>
                      <th className="px-4 py-2.5 text-right font-medium min-w-[120px]">
                        {comparison === "budget" ? "Budget" : "Prior Year"}
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium min-w-[100px]">
                        Variance
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium min-w-[80px]">
                        Var %
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const isCollapsed = collapsedGroups.has(group.label);
                  // Show group header if there are detail lines (non-subtotal)
                  const detailLines = group.lines.filter((l) => !l.is_subtotal);
                  const subtotalLines = group.lines.filter((l) => l.is_subtotal);
                  const hasDetails = detailLines.length > 0;

                  return (
                    <tbody key={group.label}>
                      {/* Group header */}
                      {hasDetails && (
                        <tr
                          className="cursor-pointer hover:bg-bm-surface/20"
                          onClick={() => toggleGroup(group.label)}
                        >
                          <td
                            colSpan={hasComparison ? 5 : 2}
                            className="sticky left-0 bg-bm-surface/30 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-bm-muted2"
                          >
                            <span className="mr-1.5 text-[10px]">{isCollapsed ? "\u25B6" : "\u25BC"}</span>
                            {group.label}
                          </td>
                        </tr>
                      )}

                      {/* Detail lines */}
                      {!isCollapsed &&
                        detailLines.map((line) => (
                          <tr
                            key={line.line_code}
                            className="border-b border-bm-border/20 hover:bg-bm-surface/10"
                          >
                            <td
                              className="sticky left-0 bg-bm-bg px-4 py-2"
                              style={{ paddingLeft: `${16 + line.indent_level * 16}px` }}
                            >
                              {line.display_label}
                            </td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums">
                              {fmtValue(line.amount, line.format_type, line.sign_display)}
                            </td>
                            {hasComparison && (
                              <>
                                <td className="px-4 py-2 text-right font-mono tabular-nums text-bm-muted2">
                                  {line.comparison_amount !== null
                                    ? fmtValue(line.comparison_amount, line.format_type, line.sign_display)
                                    : "—"}
                                </td>
                                <td
                                  className={`px-4 py-2 text-right font-mono tabular-nums ${
                                    line.variance !== null && line.variance > 0
                                      ? "text-green-400"
                                      : line.variance !== null && line.variance < 0
                                        ? "text-red-400"
                                        : ""
                                  }`}
                                >
                                  {line.variance !== null
                                    ? fmtValue(line.variance, line.format_type, 1)
                                    : "—"}
                                </td>
                                <td
                                  className={`px-4 py-2 text-right font-mono tabular-nums text-xs ${
                                    line.variance_pct !== null && line.variance_pct > 0
                                      ? "text-green-400"
                                      : line.variance_pct !== null && line.variance_pct < 0
                                        ? "text-red-400"
                                        : ""
                                  }`}
                                >
                                  {line.variance_pct !== null
                                    ? `${(line.variance_pct * 100).toFixed(1)}%`
                                    : "—"}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}

                      {/* Subtotal lines */}
                      {subtotalLines.map((line) => (
                        <tr
                          key={line.line_code}
                          className="border-t border-bm-border/50 border-b border-bm-border/30 bg-bm-surface/10"
                        >
                          <td className="sticky left-0 bg-bm-surface/10 px-4 py-2.5 font-semibold">
                            {line.display_label}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                            {fmtValue(line.amount, line.format_type, line.sign_display)}
                          </td>
                          {hasComparison && (
                            <>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-bm-muted2">
                                {line.comparison_amount !== null
                                  ? fmtValue(line.comparison_amount, line.format_type, line.sign_display)
                                  : "—"}
                              </td>
                              <td
                                className={`px-4 py-2.5 text-right font-mono tabular-nums font-semibold ${
                                  line.variance !== null && line.variance > 0 ? "text-green-400" : line.variance !== null && line.variance < 0 ? "text-red-400" : ""
                                }`}
                              >
                                {line.variance !== null ? fmtValue(line.variance, line.format_type, 1) : "—"}
                              </td>
                              <td
                                className={`px-4 py-2.5 text-right font-mono tabular-nums text-xs font-semibold ${
                                  line.variance_pct !== null && line.variance_pct > 0 ? "text-green-400" : line.variance_pct !== null && line.variance_pct < 0 ? "text-red-400" : ""
                                }`}
                              >
                                {line.variance_pct !== null ? `${(line.variance_pct * 100).toFixed(1)}%` : "—"}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
