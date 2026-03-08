"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getReV2FundQuarterState,
  getReV2Investment,
  getReV2InvestmentAssets,
  getReV2InvestmentHistory,
  getReV2InvestmentLineage,
  getReV2InvestmentQuarterState,
  getRepeFund,
  listReV2Jvs,
  listReV2Models,
  listReV2ScenarioVersions,
  listReV2Scenarios,
  ReV2EntityLineageResponse,
  ReV2FundQuarterState,
  ReV2Investment,
  ReV2InvestmentAsset,
  ReV2InvestmentHistory,
  ReV2InvestmentHistoryPoint,
  ReV2InvestmentQuarterState,
  ReV2Jv,
  ReV2Model,
  ReV2Scenario,
  ReV2ScenarioVersion,
  RepeFundDetail,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { EntityLineagePanel } from "@/components/repe/EntityLineagePanel";
import RepeEntityDocuments from "@/components/repe/RepeEntityDocuments";
import TrendLineChart from "@/components/charts/TrendLineChart";
import QuarterlyBarChart from "@/components/charts/QuarterlyBarChart";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";

type AnalysisPeriod = "quarterly" | "ttm" | "annual";
type ComparisonMode = "yoy" | "budget" | "scenario";
type SupportingTab = "assets" | "documents" | "logs" | "attachments";

type DerivedSeriesPoint = {
  quarter: string;
  noi: number;
  revenue: number;
  opex: number;
  occupancy: number | null;
  asset_value: number;
  debt_balance: number;
  comparison_noi?: number | null;
};

const BRIEFING_COLORS = {
  performance: "#2EB67D",
  capital: "#C8A23A",
  structure: "#1F2A44",
  label: "#6B7280",
  risk: "#F2A900",
  lineMuted: "#94A3B8",
} as const;

const SECTION_ORDER = [
  "POSITION SNAPSHOT",
  "OPERATING PERFORMANCE",
  "INVESTOR RETURNS",
  "CAPITAL STRUCTURE",
  "PORTFOLIO EXPOSURE",
  "SUPPORTING DETAIL",
] as const;

const STAGE_LABELS: Record<string, string> = {
  sourcing: "Sourced",
  underwriting: "Underwriting",
  ic: "IC",
  closing: "Closing",
  operating: "Hold",
  exited: "Exited",
};

function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(v: number | string | null | undefined, decimals = 1): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  if (n <= 1 && n >= 0) return `${(n * 100).toFixed(decimals)}%`;
  return `${n.toFixed(decimals)}%`;
}

function fmtX(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}x`;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  return v.slice(0, 10);
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

  if (comparison !== "yoy") {
    return baseRows;
  }

  return baseRows.map((row, index) => {
    const comparisonRow =
      period === "annual"
        ? baseRows[index - 1]
        : baseRows[index - 4];
    return {
      ...row,
      comparison_noi: comparisonRow?.noi ?? null,
    };
  });
}

function latestComparableDelta(rows: DerivedSeriesPoint[]): number | null {
  const latest = rows.at(-1);
  if (!latest || latest.comparison_noi == null || latest.comparison_noi === 0) return null;
  return (latest.noi - latest.comparison_noi) / latest.comparison_noi;
}

function buildReturnsLogRows(history: ReV2InvestmentHistoryPoint[]) {
  return [...history].sort((a, b) => compareQuarter(a.quarter, b.quarter)).reverse();
}

function PillSelect({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  testId?: string;
}) {
  return (
    <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-[0_8px_18px_-16px_rgba(15,23,42,0.95)]">
      <span className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="appearance-none bg-transparent pr-4 text-sm font-medium text-bm-text outline-none"
        data-testid={testId}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-white text-slate-900 dark:bg-slate-950 dark:text-white">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
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

function SectionHeader({ title, eyebrow, description }: { title: string; eyebrow: string; description?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-bm-text">{title}</h2>
      </div>
      {description ? <p className="max-w-2xl text-sm text-bm-muted2">{description}</p> : null}
    </div>
  );
}

function HeroMetricCard({
  label,
  value,
  accent,
  testId,
}: {
  label: string;
  value: string;
  accent: string;
  testId: string;
}) {
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.15)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.92))]"
      data-testid={testId}
      style={{ boxShadow: `0 18px 44px -30px ${accent}22` }}
    >
      <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{label}</p>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-bm-text tabular-nums">{value}</p>
    </div>
  );
}

function SecondaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/8 dark:bg-white/[0.02]">
      <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{label}</p>
      <p className="mt-1 text-sm font-medium text-bm-text tabular-nums">{value}</p>
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

  const selectedModelId = searchParams.get("modelId") || "";
  const selectedScenarioId = searchParams.get("scenarioId") || "";
  const selectedVersionId = searchParams.get("versionId") || "";
  const quarterParam = searchParams.get("quarter") || "";

  const [period, setPeriod] = useState<AnalysisPeriod>("quarterly");
  const [comparison, setComparison] = useState<ComparisonMode>("yoy");
  const [supportingTab, setSupportingTab] = useState<SupportingTab>("assets");

  const [investment, setInvestment] = useState<ReV2Investment | null>(null);
  const [fundDetail, setFundDetail] = useState<RepeFundDetail | null>(null);
  const [fundState, setFundState] = useState<ReV2FundQuarterState | null>(null);
  const [quarterState, setQuarterState] = useState<ReV2InvestmentQuarterState | null>(null);
  const [history, setHistory] = useState<ReV2InvestmentHistory | null>(null);
  const [assets, setAssets] = useState<ReV2InvestmentAsset[]>([]);
  const [jvs, setJvs] = useState<ReV2Jv[]>([]);
  const [lineage, setLineage] = useState<ReV2EntityLineageResponse | null>(null);
  const [models, setModels] = useState<ReV2Model[]>([]);
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
  const [versions, setVersions] = useState<ReV2ScenarioVersion[]>([]);
  const [resolvedQuarter, setResolvedQuarter] = useState("");
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingQuarter, setLoadingQuarter] = useState(true);
  const [lineageOpen, setLineageOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const setScopeParam = useCallback(
    (key: string, value: string) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (value) nextParams.set(key, value);
      else nextParams.delete(key);
      if (key === "modelId") {
        nextParams.delete("scenarioId");
        nextParams.delete("versionId");
      }
      if (key === "scenarioId") {
        nextParams.delete("versionId");
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
          listReV2Models(inv.fund_id),
          listReV2Scenarios(inv.fund_id),
          getReV2InvestmentHistory(params.investmentId, {
            scenario_id: selectedScenarioId || undefined,
            version_id: selectedVersionId || undefined,
          }),
        ]);
        if (cancelled) return;

        setFundDetail(results[0].status === "fulfilled" ? results[0].value : null);
        setJvs(results[1].status === "fulfilled" ? results[1].value : []);
        setModels(results[2].status === "fulfilled" ? results[2].value : []);
        setScenarios(results[3].status === "fulfilled" ? results[3].value : []);
        const nextHistory = results[4].status === "fulfilled" ? results[4].value : null;
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
  }, [
    params.investmentId,
    quarterParam,
    selectedScenarioId,
    selectedVersionId,
    setQueryParams,
  ]);

  useEffect(() => {
    if (!selectedScenarioId) {
      setVersions([]);
      return;
    }
    listReV2ScenarioVersions(selectedScenarioId)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [selectedScenarioId]);

  useEffect(() => {
    if (!investment?.fund_id || !resolvedQuarter) return;
    let cancelled = false;
    setLoadingQuarter(true);

    (async () => {
      const results = await Promise.allSettled([
        getReV2InvestmentQuarterState(
          params.investmentId,
          resolvedQuarter,
          selectedScenarioId || undefined,
          selectedVersionId || undefined
        ),
        getReV2InvestmentAssets(
          params.investmentId,
          resolvedQuarter,
          selectedScenarioId || undefined,
          selectedVersionId || undefined
        ),
        getReV2InvestmentLineage(
          params.investmentId,
          resolvedQuarter,
          selectedScenarioId || undefined,
          selectedVersionId || undefined
        ),
        getReV2FundQuarterState(
          investment.fund_id,
          resolvedQuarter,
          selectedScenarioId || undefined,
          selectedVersionId || undefined
        ).catch(() => null),
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
  }, [
    investment?.fund_id,
    params.investmentId,
    resolvedQuarter,
    selectedScenarioId,
    selectedVersionId,
  ]);

  const filteredScenarios = useMemo(() => {
    if (!selectedModelId) return scenarios;
    return scenarios.filter((scenario) => scenario.model_id === selectedModelId);
  }, [scenarios, selectedModelId]);

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

  const comparisonDelta = latestComparableDelta(operatingSeries);
  const comparisonSummary =
    comparison === "yoy" && comparisonDelta != null
      ? `Latest NOI is ${fmtPct(comparisonDelta)} versus the comparable prior period.`
      : comparison === "scenario"
        ? "Scenario controls are applied to the entire page when scenario-specific states exist."
        : comparison === "budget"
          ? "Budget comparison is reserved for future underwriting baselines."
          : undefined;

  const currentFundNav = Number(fundState?.portfolio_nav || 0);
  const fundNavContribution = Number(
    quarterState?.fund_nav_contribution || quarterState?.nav || totalNav || 0
  );
  const fundNavConcentrationPct =
    currentFundNav > 0 ? (fundNavContribution / currentFundNav) * 100 : 0;

  const selectedScenarioName =
    scenarios.find((scenario) => scenario.scenario_id === selectedScenarioId)?.name || "";
  const selectedVersionLabel =
    versions.find((version) => version.version_id === selectedVersionId)?.label ||
    (selectedVersionId ? `v${versions.find((version) => version.version_id === selectedVersionId)?.version_number || ""}` : "");

  const sustainabilityHref = investment
    ? `/lab/env/${params.envId}/re/sustainability?section=${assets[0] ? "asset-sustainability" : "portfolio-footprint"}&fundId=${investment.fund_id}&investmentId=${investment.investment_id}${assets[0] ? `&assetId=${assets[0].asset_id}` : ""}`
    : `/lab/env/${params.envId}/re/sustainability`;
  const reportHref = `/lab/env/${params.envId}/re/reports/uw-vs-actual/investment/${params.investmentId}?asof=${resolvedQuarter || history?.as_of_quarter || "2026Q1"}&baseline=IO`;

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
          selectedScenarioName ? `Scenario: ${selectedScenarioName}.` : "Scenario: Base.",
          selectedVersionLabel ? `Version: ${selectedVersionLabel}.` : "Version: Latest available state.",
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
    selectedScenarioName,
    selectedVersionLabel,
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

  return (
    <section className="space-y-8" data-testid="investment-briefing-page">
      <header className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(9,14,28,0.92))] dark:shadow-[0_24px_60px_-40px_rgba(15,23,42,0.95)]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.14em] text-bm-muted2">
              <Link href={`/lab/env/${params.envId}/re/funds/${investment.fund_id}`} className="hover:text-bm-text">
                {fundDetail?.fund?.name || "Fund"}
              </Link>
              <span>/</span>
              <span className="text-bm-text">Investment Summary</span>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-bm-text">{investment.name}</h1>
              <p className="mt-2 text-sm text-bm-muted2">
                {contextStrategy || "Investment"} • Acquired {fmtDate(investment.target_close_date)} • {STAGE_LABELS[investment.stage] || investment.stage} • As of {formatQuarterLabel(resolvedQuarter)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={reportHref}
              className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white hover:bg-slate-800 dark:border-white/15 dark:bg-white dark:text-slate-950 dark:hover:bg-white/90"
            >
              Generate Report
            </Link>
            <button
              type="button"
              onClick={() => setLineageOpen(true)}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-bm-text hover:bg-slate-50 dark:border-white/12 dark:bg-white/[0.03] dark:hover:bg-white/[0.08]"
            >
              View Lineage
            </button>
            <Link
              href={sustainabilityHref}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-bm-text hover:bg-slate-50 dark:border-white/12 dark:bg-white/[0.03] dark:hover:bg-white/[0.08]"
            >
              Open Sustainability Module
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-200 pt-5 dark:border-white/10">
          <PillSelect
            label="Model"
            value={selectedModelId}
            onChange={(value) => setScopeParam("modelId", value)}
            options={[
              { label: "All Models", value: "" },
              ...models.map((model) => ({ label: model.name, value: model.model_id })),
            ]}
            testId="selector-model"
          />
          <PillSelect
            label="Scenario"
            value={selectedScenarioId}
            onChange={(value) => setScopeParam("scenarioId", value)}
            options={[
              { label: "Default", value: "" },
              ...filteredScenarios.map((scenario) => ({
                label: `${scenario.name}${scenario.is_base ? " (Base)" : ""}`,
                value: scenario.scenario_id,
              })),
            ]}
            testId="selector-scenario"
          />
          <PillSelect
            label="Version"
            value={selectedVersionId}
            onChange={(value) => setScopeParam("versionId", value)}
            options={[
              { label: "Latest", value: "" },
              ...versions.map((version) => ({
                label: `v${version.version_number}${version.label ? ` — ${version.label}` : ""}${version.is_locked ? " (Locked)" : ""}`,
                value: version.version_id,
              })),
            ]}
            testId="selector-version"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
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
            label="Comparison"
            value={comparison}
            onChange={setComparison}
            options={[
              { label: "YoY", value: "yoy" },
              { label: "Budget", value: "budget" },
              { label: "Scenario", value: "scenario" },
            ]}
            testId="segment-comparison"
          />
        </div>
      </header>

      <section className="space-y-5" data-testid="section-position-snapshot">
        <SectionHeader
          eyebrow={SECTION_ORDER[0]}
          title="How is this investment performing for the fund?"
          description="The hero row combines investment outcome and operating throughput in the order analysts expect."
        />
        <div className="grid gap-5 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <HeroMetricCard label="NAV" value={fmtMoney(quarterState?.nav)} accent={BRIEFING_COLORS.structure} testId="hero-metric-nav" />
              <HeroMetricCard label="Gross IRR" value={fmtPct(quarterState?.gross_irr)} accent={BRIEFING_COLORS.capital} testId="hero-metric-gross-irr" />
              <HeroMetricCard label="MOIC" value={fmtX(quarterState?.equity_multiple)} accent={BRIEFING_COLORS.capital} testId="hero-metric-moic" />
              <HeroMetricCard label="NOI" value={fmtMoney(quarterState?.noi ?? totalNoi)} accent={BRIEFING_COLORS.performance} testId="hero-metric-noi" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <SecondaryMetric label="Gross Value" value={fmtMoney(quarterState?.gross_asset_value ?? totalAssetValue)} />
              <SecondaryMetric label="Debt" value={fmtMoney(quarterState?.debt_balance ?? totalDebt)} />
              <SecondaryMetric label="LTV" value={fmtPct(ltv)} />
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_-32px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.95))] xl:col-span-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Investment Context</p>
            <div className="mt-4 space-y-3">
              {[
                ["Acquisition Price", fmtMoney(totalCostBasis || investment.invested_capital)],
                ["Current Value", fmtMoney(currentValue)],
                ["Hold Period", holdPeriodLabel(investment.target_close_date)],
                ["Strategy", fundDetail?.fund?.sub_strategy || contextStrategy || "—"],
                ["Market", primaryMarket],
                ["Property Type", primaryPropertyType],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0 dark:border-white/8">
                  <span className="text-sm text-bm-muted2">{label}</span>
                  <span className="text-sm font-medium text-bm-text">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-5" data-testid="section-operating-performance">
        <SectionHeader
          eyebrow={SECTION_ORDER[1]}
          title="Operating Performance"
          description={comparisonSummary || "Operating charts use real quarter-state history and keep NOI as the dominant visual."}
        />
        <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.96))]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/8 dark:bg-white/[0.02]">
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">NOI Over Time</p>
              <p className="mt-1 text-sm text-bm-muted2">Primary operating signal for asset health and valuation support.</p>
            </div>
            <TrendLineChart
              data={operatingSeries}
              lines={[
                { key: "noi", label: "NOI", color: BRIEFING_COLORS.performance },
                ...(comparison === "yoy"
                  ? [{ key: "comparison_noi", label: "Comparable Prior Period", color: BRIEFING_COLORS.lineMuted, dashed: true }]
                  : []),
              ]}
              height={320}
              format="dollar"
              showLegend={comparison === "yoy"}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/8 dark:bg-white/[0.02]">
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Revenue vs Expenses</p>
                <p className="mt-1 text-sm text-bm-muted2">Revenue and expense structure stays visually calm and secondary to NOI.</p>
              </div>
              <QuarterlyBarChart
                data={operatingSeries}
                bars={[
                  { key: "revenue", label: "Revenue", color: BRIEFING_COLORS.structure },
                  { key: "opex", label: "Expenses", color: BRIEFING_COLORS.label },
                ]}
                height={260}
                showLegend
              />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/8 dark:bg-white/[0.02]">
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Occupancy Trend</p>
                <p className="mt-1 text-sm text-bm-muted2">Occupancy is tracked as a supporting operating indicator, not a competing headline metric.</p>
              </div>
              <TrendLineChart
                data={operatingSeries.map((row) => ({ ...row, occupancy: row.occupancy ?? 0 }))}
                lines={[{ key: "occupancy", label: "Occupancy", color: BRIEFING_COLORS.structure }]}
                referenceLines={[{ y: 0.9, label: "90% target", color: BRIEFING_COLORS.risk }]}
                height={260}
                format="percent"
                showLegend={false}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-5" data-testid="section-investor-returns">
        <SectionHeader
          eyebrow={SECTION_ORDER[2]}
          title="Investor Returns"
          description="Capital invested, capital returned, and value still owned are grouped so the outcome is legible without mixing in operating detail."
        />
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.96))]">
          <div className="grid gap-4 lg:grid-cols-3">
            <HeroMetricCard label="Committed Capital" value={fmtMoney(quarterState?.committed_capital || investment.committed_capital)} accent={BRIEFING_COLORS.capital} testId="returns-committed" />
            <HeroMetricCard label="Invested Capital" value={fmtMoney(quarterState?.invested_capital || investment.invested_capital)} accent={BRIEFING_COLORS.capital} testId="returns-invested" />
            <HeroMetricCard label="Distributions" value={fmtMoney(quarterState?.realized_distributions || investment.realized_distributions)} accent={BRIEFING_COLORS.capital} testId="returns-distributions" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SecondaryMetric label="Gross IRR" value={fmtPct(quarterState?.gross_irr)} />
            <SecondaryMetric label="Net IRR" value={fmtPct(quarterState?.net_irr)} />
            <SecondaryMetric label="MOIC" value={fmtX(quarterState?.equity_multiple)} />
            <SecondaryMetric label="Fund NAV Contribution" value={fmtMoney(fundNavContribution)} />
          </div>
        </div>
      </section>

      <section className="space-y-5" data-testid="section-capital-structure">
        <SectionHeader
          eyebrow={SECTION_ORDER[3]}
          title="Capital Structure"
          description="Debt and equity are shown as structure and risk, not as decorative dashboard stats."
        />
        <div className="grid gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.96))] xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-7">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Debt vs Equity</p>
              <p className="mt-1 text-sm text-bm-muted2">The financing mix frames current risk posture.</p>
            </div>
            <CompositionBar debtPct={debtPct} equityPct={equityPct} />
            <div className="grid gap-3 md:grid-cols-2">
              <SecondaryMetric label="Total Debt" value={fmtMoney(quarterState?.debt_balance ?? totalDebt)} />
              <SecondaryMetric label="Equity Value" value={fmtMoney(currentValue - Number(quarterState?.debt_balance || totalDebt || 0))} />
            </div>
          </div>
          <div className="grid gap-3 xl:col-span-5 md:grid-cols-2 xl:grid-cols-2">
            <SecondaryMetric label="DSCR" value={fmtX(
              quarterState?.debt_service && quarterState.debt_service > 0 && quarterState.noi != null
                ? Number(quarterState.noi) / Number(quarterState.debt_service)
                : null
            )} />
            <SecondaryMetric label="Debt Yield" value={fmtPct(
              quarterState?.debt_balance && quarterState.debt_balance > 0 && quarterState.noi != null
                ? Number(quarterState.noi) / Number(quarterState.debt_balance)
                : null
            )} />
            <SecondaryMetric label="LTV" value={fmtPct(ltv)} />
            <SecondaryMetric label="Cash Balance" value={fmtMoney(quarterState?.cash_balance)} />
          </div>
        </div>
      </section>

      <section className="space-y-5" data-testid="section-portfolio-exposure">
        <SectionHeader
          eyebrow={SECTION_ORDER[4]}
          title="Portfolio Exposure"
          description="Contextualizes the investment inside the fund without collapsing portfolio and investment performance into the same panel."
        />
        <div className="grid gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.96))] xl:grid-cols-12">
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
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/8 dark:bg-white/[0.03] xl:col-span-4">
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

      <section className="space-y-5" data-testid="section-supporting-detail">
        <SectionHeader
          eyebrow={SECTION_ORDER[5]}
          title="Supporting Detail"
          description="Operational detail stays below the narrative surface so the briefing remains decision-first."
        />
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(9,14,28,0.96))]">
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
                              <Link href={`/lab/env/${params.envId}/re/assets/${asset.asset_id}${selectedScenarioId ? `?scenarioId=${selectedScenarioId}` : ""}`} className="font-medium text-bm-text hover:text-slate-900 dark:hover:text-white">
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
