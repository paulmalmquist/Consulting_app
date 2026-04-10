"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronDown, GitBranch, MoreHorizontal, Sparkles } from "lucide-react";
import {
  getReV2FundQuarterState,
  getReV2Investment,
  getReV2InvestmentAssets,
  getReV2InvestmentHistory,
  getReV2InvestmentLineage,
  getReV2InvestmentQuarterState,
  getRepeFund,
  listReV2Jvs,
  ReV2EntityLineageResponse,
  ReV2FundQuarterState,
  ReV2Investment,
  ReV2InvestmentAsset,
  ReV2InvestmentHistory,
  ReV2InvestmentHistoryPoint,
  ReV2InvestmentQuarterState,
  ReV2Jv,
  RepeFundDetail,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import {
  isLockStateRenderable,
  useAuthoritativeState,
} from "@/hooks/useAuthoritativeState";
import { AuditDrawer } from "@/components/re/AuditDrawer";
import { TrustChip } from "@/components/re/TrustChip";
import { EntityLineagePanel } from "@/components/repe/EntityLineagePanel";
import RepeEntityDocuments from "@/components/repe/RepeEntityDocuments";
import TrendLineChart from "@/components/charts/TrendLineChart";
import QuarterlyBarChart from "@/components/charts/QuarterlyBarChart";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import StatementTable from "@/components/repe/statements/StatementTable";

import { fmtDate, fmtMoney, fmtPct } from "@/lib/format-utils";
type AnalysisPeriod = "quarterly" | "ttm" | "annual";
type ComparisonMode = "yoy" | "budget" | "scenario";
type SupportingTab = "assets" | "documents" | "logs" | "attachments";
type TrendDirection = "up" | "down" | "flat";
type MetricTone = "positive" | "caution" | "negative" | "neutral";

type DerivedSeriesPoint = {
  quarter: string;
  noi: number;
  revenue: number;
  opex: number;
  occupancy: number | null;
  asset_value: number;
  debt_balance: number;
  plan_noi?: number | null;
  variance_to_plan?: number | null;
  comparison_noi?: number | null;
};

type MetricChange = {
  badge: string;
  note: string;
  direction: TrendDirection;
  tone: MetricTone;
};

type InsightDescriptor = {
  title: string;
  body: string;
  tone: MetricTone;
};

type ChartHighlight = {
  quarter: string;
  value: number;
  label?: string;
  color?: string;
};

const BRIEFING_COLORS = {
  performance: "#2EB67D",
  capital: "#C8A23A",
  structure: "#1F2A44",
  label: "#6B7280",
  risk: "#F2A900",
  lineMuted: "#94A3B8",
} as const;

const SECTION_ORDER = {
  outcome: "INVESTMENT OUTCOME",
  operations: "OPERATING PERFORMANCE",
  portfolio: "PORTFOLIO EXPOSURE",
  supporting: "SUPPORTING DETAIL",
} as const;

const STAGE_LABELS: Record<string, string> = {
  sourcing: "Sourced",
  underwriting: "Underwriting",
  ic: "IC",
  closing: "Closing",
  operating: "Hold",
  exited: "Exited",
};

function fmtX(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}x`;
}

function holdPeriodLabel(acquisitionDate?: string | null): string {
  if (!acquisitionDate) return "—";
  const acquired = new Date(acquisitionDate);
  if (Number.isNaN(acquired.getTime())) return "—";
  const now = new Date();
  const months =
    (now.getUTCFullYear() - acquired.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - acquired.getUTCMonth());
  if (months <= 0) return "0 mo";
  if (months < 12) return `${months} mo`;
  return `${(months / 12).toFixed(1)} yrs`;
}

function parseQuarter(quarter: string): { year: number; quarter: number } | null {
  const match = quarter.match(/^(\d{4})Q([1-4])$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    quarter: Number(match[2]),
  };
}

function compareQuarter(a: string, b: string): number {
  const pa = parseQuarter(a);
  const pb = parseQuarter(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.quarter - pb.quarter;
}

function formatQuarterLabel(quarter: string): string {
  const parsed = parseQuarter(quarter);
  if (!parsed) return quarter;
  return `${parsed.year} Q${parsed.quarter}`;
}

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function pickPrimaryLabel(values: Array<{ label: string; value: number }>): string {
  const sorted = [...values].sort((a, b) => b.value - a.value);
  return sorted[0]?.label || "—";
}

function aggregateAnnual(points: ReV2InvestmentHistoryPoint[]): DerivedSeriesPoint[] {
  const grouped = new Map<string, ReV2InvestmentHistoryPoint[]>();
  for (const point of points) {
    const year = point.quarter.slice(0, 4);
    grouped.set(year, [...(grouped.get(year) || []), point]);
  }
  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, rows]) => {
      const latest = [...rows].sort((a, b) => compareQuarter(a.quarter, b.quarter)).at(-1);
      const occupancyRows = rows.filter((row) => row.occupancy != null);
      return {
        quarter: year,
        noi: rows.reduce((sum, row) => sum + Number(row.noi || 0), 0),
        revenue: rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0),
        opex: rows.reduce((sum, row) => sum + Number(row.opex || 0), 0),
        occupancy: occupancyRows.length
          ? occupancyRows.reduce((sum, row) => sum + Number(row.occupancy || 0), 0) / occupancyRows.length
          : null,
        asset_value: Number(latest?.asset_value || 0),
        debt_balance: Number(latest?.debt_balance || 0),
      };
    });
}

function aggregateTtm(points: ReV2InvestmentHistoryPoint[]): DerivedSeriesPoint[] {
  const sorted = [...points].sort((a, b) => compareQuarter(a.quarter, b.quarter));
  if (sorted.length < 4) {
    return sorted.map((point) => ({
      quarter: formatQuarterLabel(point.quarter),
      noi: Number(point.noi || 0),
      revenue: Number(point.revenue || 0),
      opex: Number(point.opex || 0),
      occupancy: point.occupancy != null ? Number(point.occupancy) : null,
      asset_value: Number(point.asset_value || 0),
      debt_balance: Number(point.debt_balance || 0),
    }));
  }
  const rows: DerivedSeriesPoint[] = [];
  for (let i = 3; i < sorted.length; i += 1) {
    const window = sorted.slice(i - 3, i + 1);
    const latest = window.at(-1);
    const occupancyRows = window.filter((row) => row.occupancy != null);
    rows.push({
      quarter: `TTM ${formatQuarterLabel(latest?.quarter || "")}`,
      noi: window.reduce((sum, row) => sum + Number(row.noi || 0), 0),
      revenue: window.reduce((sum, row) => sum + Number(row.revenue || 0), 0),
      opex: window.reduce((sum, row) => sum + Number(row.opex || 0), 0),
      occupancy: occupancyRows.length
        ? occupancyRows.reduce((sum, row) => sum + Number(row.occupancy || 0), 0) / occupancyRows.length
        : null,
      asset_value: Number(latest?.asset_value || 0),
      debt_balance: Number(latest?.debt_balance || 0),
    });
  }
  return rows;
}

function buildOperatingSeries(
  history: ReV2InvestmentHistoryPoint[],
  period: AnalysisPeriod,
  comparison: ComparisonMode
): DerivedSeriesPoint[] {
  const sorted = [...history].sort((a, b) => compareQuarter(a.quarter, b.quarter));
  const baseRows: DerivedSeriesPoint[] =
    period === "annual"
      ? aggregateAnnual(sorted)
      : period === "ttm"
        ? aggregateTtm(sorted)
        : sorted.map((point) => ({
            quarter: formatQuarterLabel(point.quarter),
            noi: Number(point.noi || 0),
            revenue: Number(point.revenue || 0),
            opex: Number(point.opex || 0),
            occupancy: point.occupancy != null ? Number(point.occupancy) : null,
            asset_value: Number(point.asset_value || 0),
            debt_balance: Number(point.debt_balance || 0),
          }));

  const rowsWithPlan = baseRows.map((row, index) => {
    const planWindow = baseRows.slice(Math.max(0, index - 4), index);
    const planNoi = planWindow.length
      ? planWindow.reduce((sum, point) => sum + Number(point.noi || 0), 0) / planWindow.length
      : null;
    return {
      ...row,
      plan_noi: planNoi,
      variance_to_plan: planNoi != null && planNoi !== 0 ? (row.noi - planNoi) / planNoi : null,
    };
  });

  return rowsWithPlan.map((row, index) => {
    const comparisonRow =
      period === "annual"
        ? rowsWithPlan[index - 1]
        : rowsWithPlan[index - 4];
    return {
      ...row,
      comparison_noi: comparison === "yoy" ? comparisonRow?.noi ?? null : null,
    };
  });
}

function latestComparableDelta(rows: DerivedSeriesPoint[]): number | null {
  const latest = rows.at(-1);
  if (!latest || latest.comparison_noi == null || latest.comparison_noi === 0) return null;
  return (latest.noi - latest.comparison_noi) / latest.comparison_noi;
}

function latestPlanVariance(rows: DerivedSeriesPoint[]): number | null {
  const latest = rows.at(-1);
  if (!latest || latest.plan_noi == null || latest.plan_noi === 0) return null;
  return (latest.noi - latest.plan_noi) / latest.plan_noi;
}

function buildReturnsLogRows(history: ReV2InvestmentHistoryPoint[]) {
  return [...history].sort((a, b) => compareQuarter(a.quarter, b.quarter)).reverse();
}

function selectQuarterPair<T extends { quarter: string }>(
  points: T[],
  targetQuarter: string
): { current: T | null; prior: T | null } {
  const sorted = [...points].sort((a, b) => compareQuarter(a.quarter, b.quarter));
  if (!sorted.length) return { current: null, prior: null };
  const resolvedIndex = targetQuarter
    ? sorted.findIndex((point) => point.quarter === targetQuarter)
    : sorted.length - 1;
  const currentIndex = resolvedIndex >= 0 ? resolvedIndex : sorted.length - 1;
  return {
    current: sorted[currentIndex] || null,
    prior: currentIndex > 0 ? sorted[currentIndex - 1] : null,
  };
}

function findComparableQuarterDelta(
  points: ReV2InvestmentHistoryPoint[],
  targetQuarter: string
): number | null {
  const sorted = [...points].sort((a, b) => compareQuarter(a.quarter, b.quarter));
  const current =
    sorted.find((point) => point.quarter === targetQuarter) ||
    sorted.at(-1);
  const parsed = current ? parseQuarter(current.quarter) : null;
  if (!current || !parsed) return null;
  const comparableQuarter = `${parsed.year - 1}Q${parsed.quarter}`;
  const comparable = sorted.find((point) => point.quarter === comparableQuarter);
  const currentNoi = asNumber(current.noi);
  const comparableNoi = asNumber(comparable?.noi);
  if (currentNoi == null || comparableNoi == null || comparableNoi === 0) return null;
  return (currentNoi - comparableNoi) / comparableNoi;
}

function trendArrow(direction: TrendDirection): string {
  switch (direction) {
    case "up":
      return "↑";
    case "down":
      return "↓";
    default:
      return "→";
  }
}

function signedText(value: number, suffix = "", decimals = 1): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(decimals)}${suffix}`;
}

function formatSignedMoney(delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return `${sign}${fmtMoney(Math.abs(delta))}`;
}

function formatSignedBps(delta: number): string {
  return signedText(delta * 10000, " bps", 0);
}

function formatSignedMultiple(delta: number): string {
  return signedText(delta, "x", 2);
}

function formatSignedRatioPercent(delta: number): string {
  return signedText(delta * 100, "%", 1);
}

function classifyChange(direction: TrendDirection, inverse = false): MetricTone {
  if (direction === "flat") return "neutral";
  const improving = inverse ? direction === "down" : direction === "up";
  return improving ? "positive" : "caution";
}

function buildChange(
  current: number | null,
  prior: number | null,
  priorQuarter: string | null | undefined,
  formatter: (delta: number, prior: number) => string,
  options?: { inverse?: boolean; flatThreshold?: number }
): MetricChange | null {
  if (current == null || prior == null) return null;
  const delta = current - prior;
  const flatThreshold = options?.flatThreshold ?? 0.0001;
  const direction: TrendDirection =
    Math.abs(delta) <= flatThreshold ? "flat" : delta > 0 ? "up" : "down";
  return {
    badge: formatter(delta, prior),
    note: `vs ${priorQuarter ? formatQuarterLabel(priorQuarter) : "prior period"}`,
    direction,
    tone: classifyChange(direction, options?.inverse),
  };
}

function buildMoneyChange(
  current: number | null,
  prior: number | null,
  priorQuarter: string | null | undefined,
  options?: { inverse?: boolean }
): MetricChange | null {
  return buildChange(current, prior, priorQuarter, (delta) => formatSignedMoney(delta), {
    inverse: options?.inverse,
    flatThreshold: 10,
  });
}

function buildRatioPercentChange(
  current: number | null,
  prior: number | null,
  priorQuarter: string | null | undefined,
  options?: { inverse?: boolean }
): MetricChange | null {
  if (prior == null || prior === 0) return null;
  return buildChange(
    current,
    prior,
    priorQuarter,
    (delta, base) => formatSignedRatioPercent(delta / Math.abs(base)),
    {
      inverse: options?.inverse,
      flatThreshold: Math.abs(prior) * 0.001,
    }
  );
}

function buildBpsChange(
  current: number | null,
  prior: number | null,
  priorQuarter: string | null | undefined,
  options?: { inverse?: boolean }
): MetricChange | null {
  return buildChange(current, prior, priorQuarter, (delta) => formatSignedBps(delta), {
    inverse: options?.inverse,
    flatThreshold: 0.0005,
  });
}

function buildMultipleChange(
  current: number | null,
  prior: number | null,
  priorQuarter: string | null | undefined
): MetricChange | null {
  return buildChange(current, prior, priorQuarter, (delta) => formatSignedMultiple(delta), {
    flatThreshold: 0.005,
  });
}

function buildInsightDescriptor({
  grossIrr,
  moic,
  noiComparableDelta,
  ltv,
  currentValue,
}: {
  grossIrr: number | null;
  moic: number | null;
  noiComparableDelta: number | null;
  ltv: number | null;
  currentValue: number | null;
}): InsightDescriptor {
  if (grossIrr != null && moic != null && noiComparableDelta != null) {
    if (noiComparableDelta >= 0.08 && grossIrr >= 0.1) {
      return {
        title: "Strong performance",
        body: `Gross IRR is ${fmtPct(grossIrr)}, MOIC is ${fmtX(moic)}, and NOI is up ${fmtPct(noiComparableDelta)} versus the comparable prior period.`,
        tone: "positive",
      };
    }

    if (noiComparableDelta <= -0.04 || (ltv != null && ltv >= 0.65)) {
      return {
        title: "Pressure building",
        body: `Gross IRR is ${fmtPct(grossIrr)}, but NOI is down ${fmtPct(Math.abs(noiComparableDelta))} year over year and leverage is sitting at ${fmtPct(ltv)} LTV.`,
        tone: "caution",
      };
    }
  }

  if (currentValue != null && ltv != null) {
    return {
      title: "Performance is stable",
      body: `Current value stands at ${fmtMoney(currentValue)} with leverage holding at ${fmtPct(ltv)} LTV.`,
      tone: "neutral",
    };
  }

  return {
    title: "Investment update",
    body: "Key return and operating signals will summarize here as more quarter states become available.",
    tone: "neutral",
  };
}

function buildNoiHighlights(rows: DerivedSeriesPoint[]): ChartHighlight[] {
  const anomalies = rows
    .filter(
      (row) =>
        row.plan_noi != null &&
        row.plan_noi !== 0 &&
        row.variance_to_plan != null &&
        Math.abs(row.variance_to_plan) >= 0.05
    )
    .map((row) => ({
      quarter: row.quarter,
      value: row.noi,
      label: `${row.variance_to_plan! >= 0 ? "Ahead" : "Below"} ${formatSignedRatioPercent(row.variance_to_plan!)}`,
      color: row.variance_to_plan! >= 0 ? BRIEFING_COLORS.performance : "#D97706",
      magnitude: Math.abs(row.variance_to_plan!),
    }));

  if (!anomalies.length) return [];

  const latest = anomalies[anomalies.length - 1];
  const largest = [...anomalies].sort((a, b) => b.magnitude - a.magnitude)[0];
  const selected = [largest, latest].filter(
    (item, index, all) => all.findIndex((candidate) => candidate.quarter === item.quarter) === index
  );

  return selected.map(({ magnitude, ...highlight }) => highlight);
}

function SegmentToggle<T extends string>({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <span className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{label}</span>
      <div className="flex rounded-full border border-slate-200 bg-white p-1 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-[0_8px_18px_-16px_rgba(15,23,42,0.95)]">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                  : "text-bm-muted2 hover:text-bm-text"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TrendPill({ change }: { change: MetricChange | null }) {
  if (!change) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2 dark:bg-white/[0.06]">
        No prior period
      </span>
    );
  }

  const toneClass =
    change.tone === "positive"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-200"
      : change.tone === "caution"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/12 dark:text-amber-200"
        : change.tone === "negative"
          ? "bg-rose-50 text-rose-700 dark:bg-rose-500/12 dark:text-rose-200"
          : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${toneClass}`}>
      {trendArrow(change.direction)} {change.badge}
    </span>
  );
}

function MetricCard({
  label,
  value,
  change,
  supportingText,
  variant = "default",
  tone = "neutral",
  testId,
}: {
  label: string;
  value: string;
  change?: MetricChange | null;
  supportingText?: string;
  variant?: "default" | "hero";
  tone?: MetricTone;
  testId?: string;
}) {
  const resolvedTone = change?.tone ?? tone;
  const palette =
    resolvedTone === "positive"
      ? "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(236,253,245,0.95))] dark:border-emerald-500/20 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(16,185,129,0.12))]"
      : resolvedTone === "caution"
        ? "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,251,235,0.95))] dark:border-amber-500/20 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(245,158,11,0.12))]"
        : resolvedTone === "negative"
          ? "border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,241,242,0.95))] dark:border-rose-500/20 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(244,63,94,0.12))]"
          : "border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.96))] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.96))]";

  return (
    <div
      className={`rounded-[24px] border px-4 ${variant === "hero" ? "py-4" : "py-3.5"} shadow-[0_18px_44px_-34px_rgba(15,23,42,0.16)] ${palette}`}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{label}</p>
          <p className={`mt-2 font-semibold tracking-tight text-bm-text tabular-nums ${variant === "hero" ? "text-[2rem]" : "text-[1.7rem]"}`}>
            {value}
          </p>
        </div>
        <TrendPill change={change ?? null} />
      </div>
      <p className="mt-2 text-xs text-bm-muted2">{supportingText || change?.note || "No prior quarter loaded."}</p>
    </div>
  );
}

function MetadataChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/75 px-3 py-1.5 text-sm shadow-[0_10px_24px_-20px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-white/[0.04]">
      <span className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{label}</span>
      <span className="font-medium text-bm-text">{value}</span>
    </div>
  );
}

function InsightBlock({ insight }: { insight: InsightDescriptor }) {
  const Icon = insight.tone === "positive" ? Sparkles : AlertTriangle;
  const palette =
    insight.tone === "positive"
      ? "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-500/20 dark:bg-emerald-500/10"
      : insight.tone === "caution"
        ? "border-amber-200/80 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/10"
        : "border-slate-200 bg-slate-50/90 dark:border-white/10 dark:bg-white/[0.04]";
  const iconColor =
    insight.tone === "positive"
      ? "text-emerald-600 dark:text-emerald-300"
      : insight.tone === "caution"
        ? "text-amber-600 dark:text-amber-300"
        : "text-slate-500 dark:text-slate-300";

  return (
    <div className={`flex items-start gap-3 rounded-[22px] border px-4 py-3.5 ${palette}`} data-testid="hero-insight">
      <div className={`mt-0.5 rounded-full p-2 ${iconColor}`}>
        <Icon className="h-4 w-4" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-bm-text">{insight.title}</p>
        <p className="mt-1 text-sm text-bm-muted2">{insight.body}</p>
      </div>
    </div>
  );
}

function CompositionBar({
  debtPct,
  equityPct,
}: {
  debtPct: number;
  equityPct: number;
}) {
  return (
    <div className="overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex h-10 w-full">
        <div
          className="flex items-center justify-center text-xs font-semibold text-white"
          style={{ width: `${Math.max(debtPct, debtPct > 0 ? 12 : 0)}%`, backgroundColor: BRIEFING_COLORS.structure }}
        >
          Debt {debtPct.toFixed(0)}%
        </div>
        <div
          className="flex items-center justify-center text-xs font-semibold text-slate-950"
          style={{ width: `${Math.max(equityPct, equityPct > 0 ? 12 : 0)}%`, backgroundColor: BRIEFING_COLORS.capital }}
        >
          Equity {equityPct.toFixed(0)}%
        </div>
      </div>
    </div>
  );
}

function HorizontalBar({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-bm-text">{label}</span>
        <span className="text-bm-muted2">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function SupportingTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white dark:border-white/20 dark:bg-white dark:text-slate-950"
          : "border-slate-200 bg-white text-bm-muted2 hover:text-bm-text dark:border-white/10 dark:bg-white/[0.02]"
      }`}
    >
      {children}
    </button>
  );
}

function resolveQuarter(
  quarterParam: string,
  history: ReV2InvestmentHistory | null,
  investment: ReV2Investment | null
): string {
  const available = new Set<string>([
    ...(history?.operating_history || []).map((row) => row.quarter),
    ...(history?.returns_history || []).map((row) => row.quarter),
  ]);
  if (quarterParam && (!available.size || available.has(quarterParam))) {
    return quarterParam;
  }
  return history?.as_of_quarter || investment?.as_of_quarter || "";
}

function InvestmentBriefingPageContent({
  params,
}: {
  params: { envId: string; investmentId: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { businessId } = useReEnv();

  const quarterParam = searchParams.get("quarter") || "";
  const auditMode = searchParams.get("audit_mode") === "1";

  const [period, setPeriod] = useState<AnalysisPeriod>("quarterly");
  const [comparison, setComparison] = useState<ComparisonMode>("budget");
  const [supportingTab, setSupportingTab] = useState<SupportingTab>("assets");

  const [investment, setInvestment] = useState<ReV2Investment | null>(null);
  const [fundDetail, setFundDetail] = useState<RepeFundDetail | null>(null);
  const [fundState, setFundState] = useState<ReV2FundQuarterState | null>(null);
  const [quarterState, setQuarterState] = useState<ReV2InvestmentQuarterState | null>(null);
  const [history, setHistory] = useState<ReV2InvestmentHistory | null>(null);
  const [assets, setAssets] = useState<ReV2InvestmentAsset[]>([]);
  const [jvs, setJvs] = useState<ReV2Jv[]>([]);
  const [lineage, setLineage] = useState<ReV2EntityLineageResponse | null>(null);
  const [resolvedQuarter, setResolvedQuarter] = useState("");
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingQuarter, setLoadingQuarter] = useState(true);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  const setQueryParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) nextParams.set(key, value);
        else nextParams.delete(key);
      }
      const next = nextParams.toString();
      const current = searchParams.toString();
      if (next !== current) {
        router.replace(next ? `?${next}` : "?", { scroll: false });
      }
    },
    [router, searchParams]
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingBase(true);
    setError(null);

    (async () => {
      try {
        const inv = await getReV2Investment(params.investmentId);
        if (cancelled) return;
        setInvestment(inv);

        const results = await Promise.allSettled([
          getRepeFund(inv.fund_id),
          listReV2Jvs(params.investmentId),
          getReV2InvestmentHistory(params.investmentId, {}),
        ]);
        if (cancelled) return;

        setFundDetail(results[0].status === "fulfilled" ? results[0].value : null);
        setJvs(results[1].status === "fulfilled" ? results[1].value : []);
        const nextHistory = results[2].status === "fulfilled" ? results[2].value : null;
        setHistory(nextHistory);

        const quarter = resolveQuarter(quarterParam, nextHistory, inv);
        setResolvedQuarter(quarter);
        if (quarter && quarter !== quarterParam) {
          setQueryParams({ quarter });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load investment");
        }
      } finally {
        if (!cancelled) setLoadingBase(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.investmentId, quarterParam, setQueryParams]);

  useEffect(() => {
    if (!investment?.fund_id || !resolvedQuarter) return;
    let cancelled = false;
    setLoadingQuarter(true);

    (async () => {
      const results = await Promise.allSettled([
        getReV2InvestmentQuarterState(params.investmentId, resolvedQuarter),
        getReV2InvestmentAssets(params.investmentId, resolvedQuarter),
        getReV2InvestmentLineage(params.investmentId, resolvedQuarter),
        getReV2FundQuarterState(investment.fund_id, resolvedQuarter).catch(() => null),
      ]);

      if (cancelled) return;

      setQuarterState(results[0].status === "fulfilled" ? results[0].value : null);
      setAssets(results[1].status === "fulfilled" ? results[1].value : []);
      setLineage(results[2].status === "fulfilled" ? results[2].value : null);
      setFundState(results[3].status === "fulfilled" ? results[3].value : null);
      setLoadingQuarter(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [investment?.fund_id, params.investmentId, resolvedQuarter]);

  // Authoritative State Lockdown — Phase 3
  // Single-fetch authoritative state for the investment's NOI / IRR.
  // Per docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md (Invariants 1-3), the
  // NOI card prefers state.canonical_metrics.fund_attributable_operating_cash_flow
  // for any released period.
  const {
    state: authoritativeInvestmentState,
    lockState: authoritativeInvestmentLockState,
  } = useAuthoritativeState({
    entityType: "investment",
    entityId: params.investmentId,
    quarter: resolvedQuarter || null,
  });
  const authoritativeInvestmentMetrics = (authoritativeInvestmentState?.state?.canonical_metrics ?? {}) as Record<string, unknown>;
  const authoritativeInvestmentRenderable = isLockStateRenderable(authoritativeInvestmentLockState);
  const authoritativeInvestmentNumber = (key: string): number | null => {
    if (!authoritativeInvestmentRenderable) return null;
    const raw = authoritativeInvestmentMetrics[key];
    if (raw == null) return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!actionsMenuRef.current?.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const totalAssetValue = useMemo(
    () => assets.reduce((sum, asset) => sum + Number(asset.asset_value || 0), 0),
    [assets]
  );
  const totalDebt = useMemo(
    () => assets.reduce((sum, asset) => sum + Number(asset.debt_balance || 0), 0),
    [assets]
  );
  const totalNoi = useMemo(
    () => assets.reduce((sum, asset) => sum + Number(asset.noi || 0), 0),
    [assets]
  );
  const totalNav = useMemo(
    () => assets.reduce((sum, asset) => sum + Number(asset.nav || 0), 0),
    [assets]
  );
  const totalCostBasis = useMemo(
    () => assets.reduce((sum, asset) => sum + Number(asset.cost_basis || 0), 0),
    [assets]
  );

  const ltv = useMemo(() => {
    const value = Number(quarterState?.gross_asset_value || totalAssetValue || 0);
    const debt = Number(quarterState?.debt_balance || totalDebt || 0);
    return value > 0 ? debt / value : null;
  }, [quarterState?.debt_balance, quarterState?.gross_asset_value, totalAssetValue, totalDebt]);

  const debtPct = Math.max(0, Math.min(100, (ltv || 0) * 100));
  const equityPct = Math.max(0, 100 - debtPct);

  const sectorExposure = useMemo(() => {
    const totals = new Map<string, number>();
    for (const asset of assets) {
      const key = asset.property_type || asset.asset_type || "Other";
      totals.set(key, (totals.get(key) || 0) + Number(asset.asset_value || 0));
    }
    const total = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
    return Array.from(totals.entries())
      .map(([label, value]) => ({
        label,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [assets]);

  const geographyExposure = useMemo(() => {
    const totals = new Map<string, number>();
    for (const asset of assets) {
      const key =
        asset.msa ||
        asset.market ||
        (asset.city && asset.state ? `${asset.city}, ${asset.state}` : asset.state) ||
        "Unassigned";
      totals.set(key, (totals.get(key) || 0) + Number(asset.asset_value || 0));
    }
    const total = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
    return Array.from(totals.entries())
      .map(([label, value]) => ({
        label,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [assets]);

  const currentValue = Number(quarterState?.gross_asset_value || totalAssetValue || 0);
  const primaryMarket = pickPrimaryLabel(geographyExposure);
  const primaryPropertyType = pickPrimaryLabel(sectorExposure);
  const operatingSeries = useMemo(
    () => buildOperatingSeries(history?.operating_history || [], period, comparison),
    [comparison, history?.operating_history, period]
  );
  const returnsLogRows = useMemo(
    () => buildReturnsLogRows(history?.returns_history || []),
    [history?.returns_history]
  );

  const operatingPair = useMemo(
    () => selectQuarterPair(history?.operating_history || [], resolvedQuarter),
    [history?.operating_history, resolvedQuarter]
  );
  const returnsPair = useMemo(
    () => selectQuarterPair(history?.returns_history || [], resolvedQuarter),
    [history?.returns_history, resolvedQuarter]
  );

  const comparisonDelta = latestComparableDelta(operatingSeries);
  const planVariance = latestPlanVariance(operatingSeries);
  const latestOperatingPoint = operatingSeries.at(-1) || null;
  const noiHighlights = useMemo(() => buildNoiHighlights(operatingSeries), [operatingSeries]);
  const comparableNoiDelta = useMemo(
    () => findComparableQuarterDelta(history?.operating_history || [], resolvedQuarter),
    [history?.operating_history, resolvedQuarter]
  );
  const comparisonSummary =
    comparison === "budget" && planVariance != null
      ? `Latest NOI is ${planVariance >= 0 ? "ahead of" : "below"} the run-rate plan by ${fmtPct(Math.abs(planVariance))}.`
      : comparison === "yoy" && comparisonDelta != null
        ? `Latest NOI is ${comparisonDelta >= 0 ? "up" : "down"} ${fmtPct(Math.abs(comparisonDelta))} versus the comparable prior period.`
      : comparison === "scenario"
        ? "Scenario overlay stays ready for future versioned operating states."
        : undefined;

  const currentFundNav = Number(fundState?.portfolio_nav || 0);
  const fundNavContribution = Number(
    quarterState?.fund_nav_contribution || quarterState?.nav || totalNav || 0
  );
  const fundNavConcentrationPct =
    currentFundNav > 0 ? (fundNavContribution / currentFundNav) * 100 : 0;

  const sustainabilityHref = investment
    ? `/lab/env/${params.envId}/re/sustainability?section=${assets[0] ? "asset-sustainability" : "portfolio-footprint"}&fundId=${investment.fund_id}&investmentId=${investment.investment_id}${assets[0] ? `&assetId=${assets[0].asset_id}` : ""}`
    : `/lab/env/${params.envId}/re/sustainability`;
  const reportHref = `/lab/env/${params.envId}/re/reports/uw-vs-actual/investment/${params.investmentId}?asof=${resolvedQuarter || history?.as_of_quarter || "2026Q1"}&baseline=IO`;
  const priorOperatingQuarter = operatingPair.prior?.quarter || null;
  const priorReturnsQuarter = returnsPair.prior?.quarter || null;
  const priorLtv =
    operatingPair.prior?.asset_value && operatingPair.prior.asset_value > 0
      ? Number(operatingPair.prior.debt_balance || 0) / Number(operatingPair.prior.asset_value)
      : null;
  const heroInsight = buildInsightDescriptor({
    grossIrr: asNumber(quarterState?.gross_irr),
    moic: asNumber(quarterState?.equity_multiple),
    noiComparableDelta: comparableNoiDelta,
    ltv,
    currentValue: currentValue || null,
  });
  const heroMetrics = [
    {
      label: "Gross IRR",
      value: fmtPct(quarterState?.gross_irr),
      change: buildBpsChange(asNumber(quarterState?.gross_irr), asNumber(returnsPair.prior?.gross_irr), priorReturnsQuarter),
      testId: "hero-metric-gross-irr",
    },
    {
      label: "MOIC",
      value: fmtX(quarterState?.equity_multiple),
      change: buildMultipleChange(asNumber(quarterState?.equity_multiple), asNumber(returnsPair.prior?.equity_multiple), priorReturnsQuarter),
      testId: "hero-metric-moic",
    },
    {
      label: "Current Value",
      value: fmtMoney(currentValue),
      change: buildMoneyChange(currentValue || null, asNumber(operatingPair.prior?.asset_value), priorOperatingQuarter),
      testId: "hero-metric-current-value",
    },
  ];
  const dscr =
    quarterState?.debt_service && quarterState.debt_service > 0 && quarterState.noi != null
      ? Number(quarterState.noi) / Number(quarterState.debt_service)
      : null;
  const debtYield =
    quarterState?.debt_balance && quarterState.debt_balance > 0 && quarterState.noi != null
      ? Number(quarterState.noi) / Number(quarterState.debt_balance)
      : null;

  // For debt investments, show debt-specific outcome metrics
  const isDebtInvestment = fundDetail?.fund?.strategy === "debt";
  const outcomeMetrics = isDebtInvestment ? [
    {
      label: "UPB",
      value: fmtMoney(quarterState?.debt_balance ?? totalDebt),
      change: buildMoneyChange(asNumber(quarterState?.debt_balance ?? totalDebt), asNumber(operatingPair.prior?.debt_balance), priorOperatingQuarter, { inverse: true }),
      testId: "outcome-metric-upb",
    },
    {
      label: "Coupon",
      value: fmtPct(quarterState?.debt_balance && quarterState.debt_balance > 0 && quarterState.noi ? Number(quarterState.noi) / Number(quarterState.debt_balance) : null),
      testId: "outcome-metric-coupon",
    },
    {
      label: "Maturity",
      value: investment?.name ? "—" : "—", // Placeholder for maturity date from loan record
      testId: "outcome-metric-maturity",
    },
    {
      label: "DSCR",
      value: fmtX(dscr),
      change: quarterState?.noi != null && operatingPair.prior?.noi != null ? buildBpsChange(asNumber(dscr), asNumber(operatingPair.prior.noi / (quarterState.debt_service || 1)), priorOperatingQuarter) : undefined,
      testId: "outcome-metric-dscr",
    },
    {
      label: "LTV",
      value: fmtPct(ltv),
      change: buildBpsChange(ltv, priorLtv, priorOperatingQuarter, { inverse: true }),
      testId: "outcome-metric-ltv",
    },
  ] : [
    {
      label: "NAV",
      value: fmtMoney(quarterState?.nav ?? fundNavContribution),
      change: buildRatioPercentChange(asNumber(quarterState?.nav ?? fundNavContribution), asNumber(returnsPair.prior?.nav), priorReturnsQuarter),
      testId: "outcome-metric-nav",
    },
    {
      label: "Gross IRR",
      value: fmtPct(quarterState?.gross_irr),
      change: buildBpsChange(asNumber(quarterState?.gross_irr), asNumber(returnsPair.prior?.gross_irr), priorReturnsQuarter),
      testId: "outcome-metric-gross-irr",
    },
    {
      label: "MOIC",
      value: fmtX(quarterState?.equity_multiple),
      change: buildMultipleChange(asNumber(quarterState?.equity_multiple), asNumber(returnsPair.prior?.equity_multiple), priorReturnsQuarter),
      testId: "outcome-metric-moic",
    },
    {
      label: "Gross Value",
      value: fmtMoney(currentValue),
      change: buildMoneyChange(currentValue || null, asNumber(operatingPair.prior?.asset_value), priorOperatingQuarter),
      testId: "outcome-metric-value",
    },
    {
      label: "Debt",
      value: fmtMoney(quarterState?.debt_balance ?? totalDebt),
      change: buildMoneyChange(asNumber(quarterState?.debt_balance ?? totalDebt), asNumber(operatingPair.prior?.debt_balance), priorOperatingQuarter, { inverse: true }),
      testId: "outcome-metric-debt",
    },
    {
      label: "LTV",
      value: fmtPct(ltv),
      change: buildBpsChange(ltv, priorLtv, priorOperatingQuarter, { inverse: true }),
      testId: "outcome-metric-ltv",
    },
  ];
  // Authoritative State Lockdown — Phase 3
  // The verification harness compares this NOI value to the snapshot's
  // canonical_metrics.fund_attributable_operating_cash_flow. When a
  // released snapshot exists, prefer that value over the legacy
  // quarter-state field. See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md.
  const authoritativeInvestmentNoi =
    authoritativeInvestmentNumber("fund_attributable_operating_cash_flow") ??
    authoritativeInvestmentNumber("noi");
  const operatingMetrics = [
    {
      label: "NOI",
      value: fmtMoney(authoritativeInvestmentNoi ?? quarterState?.noi ?? totalNoi),
      change: buildRatioPercentChange(asNumber(authoritativeInvestmentNoi ?? quarterState?.noi ?? totalNoi), asNumber(operatingPair.prior?.noi), priorOperatingQuarter),
      testId: "operating-metric-noi",
      supportingText: comparisonSummary || undefined,
    },
    {
      label: "Revenue",
      value: fmtMoney(operatingPair.current?.revenue),
      change: buildRatioPercentChange(asNumber(operatingPair.current?.revenue), asNumber(operatingPair.prior?.revenue), priorOperatingQuarter),
      testId: "operating-metric-revenue",
    },
    {
      label: "Expenses",
      value: fmtMoney(operatingPair.current?.opex),
      change: buildRatioPercentChange(asNumber(operatingPair.current?.opex), asNumber(operatingPair.prior?.opex), priorOperatingQuarter, { inverse: true }),
      testId: "operating-metric-opex",
    },
    {
      label: "Occupancy",
      value: fmtPct(operatingPair.current?.occupancy),
      change: buildBpsChange(asNumber(operatingPair.current?.occupancy), asNumber(operatingPair.prior?.occupancy), priorOperatingQuarter),
      testId: "operating-metric-occupancy",
      supportingText: operatingPair.current?.occupancy == null ? "Occupancy feed will surface here once direct coverage is available." : undefined,
    },
  ];

  useEffect(() => {
    if (!investment || !resolvedQuarter) return;
    publishAssistantPageContext({
      route: `/lab/env/${params.envId}/re/investments/${params.investmentId}`,
      surface: "investment_detail",
      active_module: "re",
      page_entity_type: "investment",
      page_entity_id: params.investmentId,
      page_entity_name: investment.name,
      selected_entities: [
        { entity_type: "investment", entity_id: params.investmentId, name: investment.name, source: "page" },
        ...(fundDetail?.fund?.fund_id
          ? [{ entity_type: "fund", entity_id: fundDetail.fund.fund_id, name: fundDetail.fund.name, source: "page" as const }]
          : []),
      ],
      visible_data: {
        funds: fundDetail?.fund
          ? [{
              entity_type: "fund",
              entity_id: fundDetail.fund.fund_id,
              name: fundDetail.fund.name,
              status: fundDetail.fund.status,
              metadata: {
                strategy: fundDetail.fund.strategy,
                sub_strategy: fundDetail.fund.sub_strategy,
                vintage_year: fundDetail.fund.vintage_year,
              },
            }]
          : [],
        investments: [{
          entity_type: "investment",
          entity_id: params.investmentId,
          name: investment.name,
          parent_entity_type: "fund",
          parent_entity_id: investment.fund_id,
          status: investment.stage,
          metadata: {
            strategy: fundDetail?.fund?.sub_strategy || fundDetail?.fund?.strategy || null,
            valuation_quarter: resolvedQuarter,
          },
        }],
        assets: assets.map((asset) => ({
          entity_type: "asset",
          entity_id: asset.asset_id,
          name: asset.name,
          parent_entity_type: "investment",
          parent_entity_id: params.investmentId,
          status: asset.jv_id ? "jv" : "direct",
          metadata: {
            property_type: asset.property_type || asset.asset_type,
            market: asset.msa || asset.market || null,
          },
        })),
        metrics: {
          nav: quarterState?.nav ?? fundNavContribution,
          gross_irr: quarterState?.gross_irr ?? null,
          net_irr: quarterState?.net_irr ?? null,
          moic: quarterState?.equity_multiple ?? null,
          noi: quarterState?.noi ?? totalNoi,
          fund_nav_contribution: fundNavContribution,
        },
        notes: [
          `Investment briefing for ${investment.name} in ${fundDetail?.fund?.name || investment.fund_id} as of ${resolvedQuarter}.`,
        ],
      },
    });

    return () => resetAssistantPageContext();
  }, [
    assets,
    fundDetail?.fund,
    fundNavContribution,
    investment,
    params.envId,
    params.investmentId,
    quarterState?.equity_multiple,
    quarterState?.gross_irr,
    quarterState?.nav,
    quarterState?.net_irr,
    quarterState?.noi,
    resolvedQuarter,
    totalNoi,
  ]);

  if (loadingBase || loadingQuarter) {
    return <div className="p-6 text-sm text-bm-muted2">Loading investment briefing...</div>;
  }

  if (error || !investment) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
        {error || "Investment not available"}
      </div>
    );
  }

  const contextStrategy = [investment.investment_type, fundDetail?.fund?.sub_strategy || fundDetail?.fund?.strategy]
    .filter(Boolean)
    .join(" – ");
  const equityValue = currentValue - Number(quarterState?.debt_balance || totalDebt || 0);

  return (
    <section className="w-full space-y-8" data-testid="investment-briefing-page">
      {/* Authoritative State Lockdown — Phase 3
          TrustChip + AuditDrawer for the investment view. The chip
          discloses the snapshot version powering the NOI / IRR cards.
          ?audit_mode=1 expands the full audit drawer.
          See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md. */}
      <div
        data-testid="investment-lineage-chip"
        className="flex flex-wrap items-center gap-3 text-xs text-slate-600"
      >
        <span className="font-semibold text-slate-700">Lineage</span>
        <TrustChip
          lockState={authoritativeInvestmentLockState}
          snapshotVersion={authoritativeInvestmentState?.snapshot_version}
          trustStatus={authoritativeInvestmentState?.trust_status}
        />
        <span className="text-slate-500">
          requested quarter: <span className="font-mono">{resolvedQuarter || "—"}</span>
        </span>
      </div>
      {auditMode && (
        <AuditDrawer
          state={authoritativeInvestmentState}
          lockState={authoritativeInvestmentLockState}
          requestedQuarter={resolvedQuarter}
        />
      )}
      <header className="rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top_right,rgba(200,162,58,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] px-5 py-5 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_right,rgba(200,162,58,0.12),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.86),rgba(9,14,28,0.96))]">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(500px,0.9fr)]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
                  <Link href={`/lab/env/${params.envId}/re/funds/${investment.fund_id}`} className="transition-colors hover:text-bm-text">
                    {fundDetail?.fund?.name || "Fund"}
                  </Link>
                  <span className="opacity-40">/</span>
                  <span>Investment Detail</span>
                </div>
                <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.025em] text-bm-text">{investment.name}</h1>
                <p className="mt-2 text-sm text-bm-muted2">
                  {contextStrategy || "Investment"} • {STAGE_LABELS[investment.stage] || investment.stage} • Acquired {fmtDate(investment.target_close_date)} • As of {formatQuarterLabel(resolvedQuarter)}
                </p>
              </div>

              <div className="relative shrink-0" ref={actionsMenuRef}>
                <div className="flex items-center gap-2">
                  <Link
                    href={reportHref}
                    className="inline-flex items-center rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                  >
                    Generate Report
                  </Link>
                  <button
                    type="button"
                    onClick={() => setActionsOpen((open) => !open)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-bm-text transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                    aria-haspopup="menu"
                    aria-expanded={actionsOpen}
                  >
                    <MoreHorizontal className="h-4 w-4 text-bm-muted2" strokeWidth={1.6} />
                    More actions
                    <ChevronDown className="h-3.5 w-3.5 text-bm-muted2" strokeWidth={1.6} />
                  </button>
                </div>
                {actionsOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-2 min-w-[220px] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-slate-950" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setLineageOpen(true);
                        setActionsOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-bm-text transition hover:bg-slate-50 dark:hover:bg-white/[0.05]"
                    >
                      <GitBranch className="h-4 w-4 text-bm-muted2" strokeWidth={1.6} />
                      View Lineage
                    </button>
                    <Link
                      href={sustainabilityHref}
                      role="menuitem"
                      onClick={() => setActionsOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-bm-text transition hover:bg-slate-50 dark:hover:bg-white/[0.05]"
                    >
                      <Sparkles className="h-4 w-4 text-bm-muted2" strokeWidth={1.6} />
                      Open Sustainability Module
                    </Link>
                    <Link
                      href={`/lab/env/${params.envId}/re/funds/${investment.fund_id}`}
                      role="menuitem"
                      onClick={() => setActionsOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-bm-text transition hover:bg-slate-50 dark:hover:bg-white/[0.05]"
                    >
                      Open Fund Detail
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <MetadataChip label="Type" value={investment.investment_type || "—"} />
              <MetadataChip label="Vintage" value={fundDetail?.fund?.vintage_year ? String(fundDetail.fund.vintage_year) : "—"} />
              <MetadataChip label="Market" value={primaryMarket} />
              <MetadataChip label="Hold" value={holdPeriodLabel(investment.target_close_date)} />
            </div>

            <InsightBlock insight={heroInsight} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:self-start">
            {heroMetrics.map((metric) => (
              <MetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                change={metric.change}
                variant="hero"
                testId={metric.testId}
              />
            ))}
          </div>
        </div>
      </header>

      <section className="space-y-4" data-testid="section-investment-outcome">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">{SECTION_ORDER.outcome}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-bm-text">{isDebtInvestment ? "Loan Performance" : "Investment Outcome"}</h2>
          <p className="mt-1 text-sm text-bm-muted2">{isDebtInvestment ? "Loan metrics track UPB, coupon, DSCR, and maturity. Collateral performance follows in the Operating section." : "Return metrics and leverage stay in their own band so outcomes read separately from operating drivers."}</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]">
          <div className="rounded-[28px] border border-[#E8D8AC] bg-[linear-gradient(180deg,rgba(255,252,244,0.96),rgba(255,255,255,0.98))] p-5 dark:border-amber-500/20 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(200,162,58,0.1))]">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {outcomeMetrics.map((metric) => (
                <MetricCard
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  change={metric.change}
                  testId={metric.testId}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4 rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] p-5 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.96))]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Capital Posture</p>
              <h3 className="mt-1 text-lg font-semibold tracking-tight text-bm-text">Value vs leverage</h3>
              <p className="mt-1 text-sm text-bm-muted2">Capital structure stays adjacent to outcomes instead of becoming a separate visual stack.</p>
            </div>
            <CompositionBar debtPct={debtPct} equityPct={equityPct} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Equity Value</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-bm-text">{fmtMoney(equityValue)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Fund NAV Contribution</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-bm-text">{fmtMoney(fundNavContribution)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">DSCR</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-bm-text">{fmtX(dscr)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Debt Yield</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-bm-text">{fmtPct(debtYield)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4" data-testid="section-operating-performance">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">{SECTION_ORDER.operations}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-bm-text">{isDebtInvestment ? "Collateral Performance" : "Operating Performance"}</h2>
            <p className="mt-1 text-sm text-bm-muted2">{isDebtInvestment ? "NOI, occupancy, and operating trends show collateral-level health and drive debt service coverage." : "NOI, occupancy, and operating trend lines stay visually distinct from valuation and return outcomes."}</p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <SegmentToggle
              label="Period"
              value={period}
              onChange={setPeriod}
              options={[
                { label: "Quarterly", value: "quarterly" },
                { label: "TTM", value: "ttm" },
                { label: "Annual", value: "annual" },
              ]}
              testId="segment-period"
            />
            <SegmentToggle
              label="Overlay"
              value={comparison}
              onChange={setComparison}
              options={[
                { label: "Plan", value: "budget" },
                { label: "YoY", value: "yoy" },
                { label: "Scenario", value: "scenario" },
              ]}
              testId="segment-comparison"
            />
          </div>
        </div>

        <div className="space-y-4 rounded-[28px] border border-[#C7E5D3] bg-[linear-gradient(180deg,rgba(245,252,247,0.96),rgba(255,255,255,0.98))] p-5 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.16)] dark:border-emerald-500/20 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(46,182,125,0.08))]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {operatingMetrics.map((metric) => (
              <MetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                change={metric.change}
                supportingText={metric.supportingText}
                testId={metric.testId}
              />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_320px]">
            <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">NOI Actual vs Plan</p>
                  <p className="mt-1 text-sm text-bm-muted2">Actual NOI is anchored to a trailing run-rate plan, with anomalies called out only when variance becomes meaningful.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                    Actual {fmtMoney(latestOperatingPoint?.noi)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                    Plan {fmtMoney(latestOperatingPoint?.plan_noi)}
                  </span>
                  {planVariance != null ? (
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${planVariance >= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-200" : "bg-amber-50 text-amber-700 dark:bg-amber-500/12 dark:text-amber-200"}`}>
                      {planVariance >= 0 ? "Ahead" : "Below"} {fmtPct(Math.abs(planVariance))}
                    </span>
                  ) : null}
                </div>
              </div>
              <TrendLineChart
                data={operatingSeries}
                lines={[
                  { key: "noi", label: "Actual NOI", color: BRIEFING_COLORS.performance },
                  { key: "plan_noi", label: "Plan (run-rate)", color: BRIEFING_COLORS.lineMuted, dashed: true },
                  ...(comparison === "yoy"
                    ? [{ key: "comparison_noi", label: "Comparable Prior Period", color: BRIEFING_COLORS.capital, dashed: true }]
                    : []),
                ]}
                highlights={noiHighlights}
                height={320}
                format="dollar"
                showLegend
              />
            </div>

            <div className="space-y-3 rounded-[24px] border border-slate-200 bg-white/90 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Operating Notes</p>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-bm-text">Signal summary</h3>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/[0.04]">
                <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Latest variance</p>
                <p className="mt-1 text-sm text-bm-text">
                  {comparisonSummary || "Plan variance will appear once enough history is available."}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/[0.04]">
                <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Occupancy target</p>
                <p className="mt-1 text-sm text-bm-text">90% reference line stays visible to keep leasing performance in context.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/[0.04]">
                <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Annotated anomalies</p>
                {noiHighlights.length ? (
                  <div className="mt-2 space-y-2">
                    {noiHighlights.map((highlight) => (
                      <p key={`${highlight.quarter}-${highlight.label}`} className="text-sm text-bm-text">
                        {highlight.quarter}: {highlight.label}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-bm-text">No recent plan variance exceeded the annotation threshold.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Revenue vs Expenses</p>
                <p className="mt-1 text-sm text-bm-muted2">Operating inputs stay tighter, with lighter padding and less card chrome.</p>
              </div>
              <QuarterlyBarChart
                data={operatingSeries}
                bars={[
                  { key: "revenue", label: "Revenue", color: BRIEFING_COLORS.structure },
                  { key: "opex", label: "Expenses", color: BRIEFING_COLORS.label },
                ]}
                height={250}
                showLegend
              />
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Occupancy Trend</p>
                <p className="mt-1 text-sm text-bm-muted2">Occupancy remains a supporting driver, with target context instead of extra headline treatment.</p>
              </div>
              <TrendLineChart
                data={operatingSeries.map((row) => ({ ...row, occupancy: row.occupancy ?? 0 }))}
                lines={[{ key: "occupancy", label: "Occupancy", color: BRIEFING_COLORS.structure }]}
                referenceLines={[{ y: 0.9, label: "90% target", color: BRIEFING_COLORS.risk }]}
                height={250}
                format="percent"
                showLegend={false}
              />
            </div>
          </div>
        </div>
      </section>

      {businessId && (
        <section className="space-y-4" data-testid="section-financial-statements">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">FINANCIAL STATEMENTS</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-bm-text">Income Statement & Cash Flow</h2>
            <p className="mt-1 text-sm text-bm-muted2">Ownership-adjusted statement detail stays below the briefing surface and keeps the page decision-first.</p>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.96))]">
            <StatementTable
              entityType="investment"
              entityId={params.investmentId}
              envId={params.envId}
              businessId={businessId}
              initialQuarter={resolvedQuarter}
              availablePeriods={
                history?.operating_history
                  ? [...history.operating_history]
                      .map((h) => h.quarter)
                      .sort(compareQuarter)
                  : undefined
              }
            />
          </div>
        </section>
      )}

      <section className="space-y-4" data-testid="section-portfolio-exposure">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">{SECTION_ORDER.portfolio}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-bm-text">Portfolio Exposure</h2>
          <p className="mt-1 text-sm text-bm-muted2">Portfolio context stays separate from both outcomes and operating signals.</p>
        </div>
        <div className="grid gap-4 rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] p-5 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.96))] xl:grid-cols-12">
          <div className="space-y-5 xl:col-span-8">
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Sector Exposure</p>
              {sectorExposure.length ? sectorExposure.map((row) => (
                <HorizontalBar
                  key={row.label}
                  label={row.label}
                  value={`${row.pct.toFixed(1)}% • ${fmtMoney(row.value)}`}
                  pct={row.pct}
                  color={BRIEFING_COLORS.capital}
                />
              )) : <p className="text-sm text-bm-muted2">No sector exposure available.</p>}
            </div>
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Geographic Exposure</p>
              {geographyExposure.length ? geographyExposure.map((row) => (
                <HorizontalBar
                  key={row.label}
                  label={row.label}
                  value={`${row.pct.toFixed(1)}% • ${fmtMoney(row.value)}`}
                  pct={row.pct}
                  color={BRIEFING_COLORS.structure}
                />
              )) : <p className="text-sm text-bm-muted2">No geographic exposure available.</p>}
            </div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white/85 p-5 dark:border-white/10 dark:bg-white/[0.03] xl:col-span-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Fund NAV Concentration</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums text-bm-text">{fundNavConcentrationPct ? `${fundNavConcentrationPct.toFixed(1)}%` : "—"}</p>
            <p className="mt-1 text-sm text-bm-muted2">
              {fmtMoney(fundNavContribution)} of {fmtMoney(currentFundNav || null)} fund NAV
            </p>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(fundNavConcentrationPct, 100)}%`, backgroundColor: BRIEFING_COLORS.performance }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4" data-testid="section-supporting-detail">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">{SECTION_ORDER.supporting}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-bm-text">Supporting Detail</h2>
          <p className="mt-1 text-sm text-bm-muted2">Documents, logs, and asset detail stay available without crowding the page’s primary read path.</p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.96))]">
          <div className="flex flex-wrap gap-2">
            <SupportingTabButton active={supportingTab === "assets"} onClick={() => setSupportingTab("assets")}>
              Assets
            </SupportingTabButton>
            <SupportingTabButton active={supportingTab === "documents"} onClick={() => setSupportingTab("documents")}>
              Documents
            </SupportingTabButton>
            <SupportingTabButton active={supportingTab === "logs"} onClick={() => setSupportingTab("logs")}>
              Historical Logs
            </SupportingTabButton>
            <SupportingTabButton active={supportingTab === "attachments"} onClick={() => setSupportingTab("attachments")}>
              Attachments
            </SupportingTabButton>
          </div>

          <div className="mt-5">
            {supportingTab === "assets" && (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-[0.14em] text-bm-muted2 dark:bg-white/[0.03]">
                      <tr>
                        <th className="px-4 py-3">Asset</th>
                        <th className="px-4 py-3">Market</th>
                        <th className="px-4 py-3">Structure</th>
                        <th className="px-4 py-3 text-right">Occupancy</th>
                        <th className="px-4 py-3 text-right">NOI</th>
                        <th className="px-4 py-3 text-right">Value</th>
                        <th className="px-4 py-3 text-right">NAV</th>
                        <th className="px-4 py-3 text-right">% NAV</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/8">
                      {assets.length ? assets.map((asset) => {
                        const nav = Number(asset.nav || 0);
                        const pct = fundNavContribution > 0 ? (nav / fundNavContribution) * 100 : 0;
                        return (
                          <tr key={asset.asset_id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                            <td className="px-4 py-3">
                              <Link href={`/lab/env/${params.envId}/re/assets/${asset.asset_id}`} className="font-medium text-bm-text hover:text-slate-900 dark:hover:text-white">
                                {asset.name}
                              </Link>
                              <p className="text-xs text-bm-muted2">{asset.property_type || asset.asset_type}</p>
                            </td>
                            <td className="px-4 py-3 text-bm-muted2">{asset.msa || asset.market || "—"}</td>
                            <td className="px-4 py-3 text-bm-muted2">{asset.jv_id ? "JV" : "Direct"}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmtPct(asset.occupancy)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(asset.noi)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(asset.asset_value)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(asset.nav)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{pct ? `${pct.toFixed(1)}%` : "—"}</td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td className="px-4 py-6 text-bm-muted2" colSpan={8}>No assets linked to this investment.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {jvs.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">JV Entities</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {jvs.map((jv) => (
                        <div key={jv.jv_id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/8 dark:bg-white/[0.02]">
                          <p className="font-medium text-bm-text">{jv.legal_name}</p>
                          <p className="mt-1 text-sm text-bm-muted2">Ownership {fmtPct(jv.ownership_percent)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {supportingTab === "documents" && (
              <div className="grid gap-4 lg:grid-cols-3">
                <Link href={reportHref} className="rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Analytical Report</p>
                  <h3 className="mt-3 text-lg font-semibold text-bm-text">UW vs Actual Detail</h3>
                  <p className="mt-2 text-sm text-bm-muted2">Open the existing investment report detail prefiltered to the active valuation quarter.</p>
                </Link>
                <button
                  type="button"
                  onClick={() => setLineageOpen(true)}
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
                >
                  <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Audit Trail</p>
                  <h3 className="mt-3 text-lg font-semibold text-bm-text">Lineage Pack</h3>
                  <p className="mt-2 text-sm text-bm-muted2">Review object-level lineage from rendered widgets back to persisted inputs.</p>
                </button>
                <Link href={sustainabilityHref} className="rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Linked Module</p>
                  <h3 className="mt-3 text-lg font-semibold text-bm-text">Sustainability Brief</h3>
                  <p className="mt-2 text-sm text-bm-muted2">Carry the current investment and valuation context into the sustainability workspace.</p>
                </Link>
              </div>
            )}

            {supportingTab === "logs" && (
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-[0.14em] text-bm-muted2 dark:bg-white/[0.03]">
                    <tr>
                      <th className="px-4 py-3">Quarter</th>
                      <th className="px-4 py-3 text-right">NAV</th>
                      <th className="px-4 py-3 text-right">Gross IRR</th>
                      <th className="px-4 py-3 text-right">Net IRR</th>
                      <th className="px-4 py-3 text-right">MOIC</th>
                      <th className="px-4 py-3 text-right">Fund NAV Contrib.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/8">
                    {returnsLogRows.length ? returnsLogRows.map((row) => (
                      <tr key={row.quarter}>
                        <td className="px-4 py-3 text-bm-text">{formatQuarterLabel(row.quarter)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(row.nav)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtPct(row.gross_irr)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtPct(row.net_irr)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtX(row.equity_multiple)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(row.fund_nav_contribution)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td className="px-4 py-6 text-bm-muted2" colSpan={6}>No historical return records available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {supportingTab === "attachments" && (
              businessId ? (
                <RepeEntityDocuments
                  businessId={businessId}
                  envId={params.envId}
                  entityType="investment"
                  entityId={params.investmentId}
                  title="Investment Attachments"
                />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-bm-muted2 dark:border-white/10 dark:bg-white/[0.02]">
                  Business context is required to load attachments.
                </div>
              )
            )}
          </div>
        </div>
      </section>

      <EntityLineagePanel
        open={lineageOpen}
        onOpenChange={setLineageOpen}
        title={`Investment Lineage · ${resolvedQuarter || "Current"}`}
        lineage={lineage}
      />
    </section>
  );
}

export default function InvestmentSummaryPage({
  params,
}: {
  params: { envId: string; investmentId: string };
}) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-bm-muted2">Loading investment briefing...</div>}>
      <InvestmentBriefingPageContent params={params} />
    </Suspense>
  );
}
