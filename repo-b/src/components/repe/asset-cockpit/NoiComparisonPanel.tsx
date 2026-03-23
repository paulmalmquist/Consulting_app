"use client";

import React from "react";
import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { CHART_COLORS, TOOLTIP_STYLE, AXIS_TICK_STYLE, GRID_STYLE } from "@/components/charts/chart-theme";

import { fmtMoney, fmtPct } from '@/lib/format-utils';
type EntityType = "asset" | "investment" | "fund";
type ComparisonMode = "yoy" | "budget" | "pro_forma" | "scenario";
type Resolution = "monthly" | "quarterly" | "annual";
type BalanceMetricKey = "assetValue" | "loanBalance" | "equityValue" | "ltv";

type MonthlySeedRow = {
  date: Date;
  noiActual: number;
  noiBudget: number;
  noiProForma: number;
  noiScenario: number;
  assetValue: number;
  loanBalance: number;
  equityValue: number;
  ltv: number;
};

type ChartPoint = {
  label: string;
  periodKey: string;
  periodStart: string;
  noiActual: number;
  noiBudget: number;
  noiProForma: number;
  noiScenario: number;
  assetValue: number;
  loanBalance: number;
  equityValue: number;
  ltv: number;
  baselineValue: number | null;
  deltaPct: number | null;
  deltaPositive: number | null;
  deltaNegative: number | null;
};

type Props = {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  actualNoiAnnual: number;
  assetValue: number;
  loanBalance: number;
  startDate?: string;
  selectedScenarioLabel?: string;
};

type BalanceMetricDef = {
  key: BalanceMetricKey;
  label: string;
  color: string;
  formatter: (value: number | null | undefined) => string;
};

const COMPARISON_OPTIONS: Array<{ key: ComparisonMode; label: string }> = [
  { key: "yoy", label: "YoY" },
  { key: "budget", label: "Budget" },
  { key: "pro_forma", label: "Pro Forma" },
  { key: "scenario", label: "Scenario Comparison" },
];

const RESOLUTION_OPTIONS: Array<{ key: Resolution; label: string }> = [
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "annual", label: "Annual" },
];

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function startMonthForSeries(startDate?: string): Date {
  const parsed = startDate ? new Date(startDate) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return new Date(Date.UTC(Math.max(parsed.getUTCFullYear(), 2019), parsed.getUTCMonth(), 1));
  }
  return new Date(Date.UTC(2019, 0, 1));
}

function addMonths(date: Date, count: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function quarterLabel(date: Date): string {
  return `${date.getUTCFullYear()}Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function yearLabel(date: Date): string {
  return `${date.getUTCFullYear()}`;
}

function createMonthlySeedSeries({
  entityId,
  actualNoiAnnual,
  assetValue,
  loanBalance,
  startDate,
}: Pick<Props, "entityId" | "actualNoiAnnual" | "assetValue" | "loanBalance" | "startDate">): MonthlySeedRow[] {
  const seed = hashCode(entityId);
  const phase = (seed % 360) * (Math.PI / 180);
  const trendBps = 0.0016 + ((seed % 7) * 0.00018);
  const budgetGap = 0.012 + ((seed % 5) * 0.004);
  const proFormaLift = 0.026 + ((seed % 4) * 0.006);
  const scenarioTilt = 0.018 + ((seed % 6) * 0.003);
  const baseMonthlyNoi = Math.max(actualNoiAnnual / 12, 150_000);
  const baseValue = Math.max(assetValue, baseMonthlyNoi * 140);
  const baseLoan = Math.max(loanBalance, baseValue * 0.48);
  const amortization = baseLoan * 0.0016;

  const start = startMonthForSeries(startDate);
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1;

  const rows: MonthlySeedRow[] = [];

  for (let i = 0; i < months; i += 1) {
    const date = addMonths(start, i);
    const monthOfYear = date.getUTCMonth();
    const growth = 1 + i * trendBps;
    const seasonality = 1 + Math.sin((monthOfYear / 12) * Math.PI * 2 + phase) * 0.065;
    const cycle = 1 + Math.cos(i / 9 + phase) * 0.025;

    const noiActual = baseMonthlyNoi * growth * seasonality * cycle;
    const noiBudget =
      baseMonthlyNoi *
      (1 + i * trendBps * 0.92) *
      (1 + Math.sin((monthOfYear / 12) * Math.PI * 2 + phase / 2) * 0.03) *
      (1 + budgetGap);
    const noiProForma =
      baseMonthlyNoi *
      (1 + i * trendBps * 1.18) *
      (1 + Math.cos(i / 11 + phase) * 0.018) *
      (1 + proFormaLift);
    const noiScenario = noiProForma * (1 - scenarioTilt);

    const valueTrend = 1 + i * (trendBps * 0.85);
    const assetValuePoint = baseValue * valueTrend + (noiActual - baseMonthlyNoi) * 11;
    const loanBalancePoint = Math.max(baseLoan - i * amortization, baseLoan * 0.52);
    const equityValuePoint = Math.max(assetValuePoint - loanBalancePoint, assetValuePoint * 0.12);
    const ltvPoint = loanBalancePoint / assetValuePoint;

    rows.push({
      date,
      noiActual,
      noiBudget,
      noiProForma,
      noiScenario,
      assetValue: assetValuePoint,
      loanBalance: loanBalancePoint,
      equityValue: equityValuePoint,
      ltv: ltvPoint,
    });
  }

  return rows;
}

function aggregateSeries(rows: MonthlySeedRow[], resolution: Resolution): Omit<ChartPoint, "baselineValue" | "deltaPct" | "deltaPositive" | "deltaNegative">[] {
  const buckets = new Map<string, Omit<ChartPoint, "baselineValue" | "deltaPct" | "deltaPositive" | "deltaNegative">>();

  for (const row of rows) {
    let key: string;
    let label: string;
    if (resolution === "annual") {
      key = yearLabel(row.date);
      label = key;
    } else if (resolution === "quarterly") {
      key = quarterLabel(row.date);
      label = key;
    } else {
      key = `${row.date.getUTCFullYear()}-${String(row.date.getUTCMonth() + 1).padStart(2, "0")}`;
      label = monthLabel(row.date);
    }

    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        label,
        periodKey: key,
        periodStart: row.date.toISOString(),
        noiActual: row.noiActual,
        noiBudget: row.noiBudget,
        noiProForma: row.noiProForma,
        noiScenario: row.noiScenario,
        assetValue: row.assetValue,
        loanBalance: row.loanBalance,
        equityValue: row.equityValue,
        ltv: row.ltv,
      });
      continue;
    }

    existing.noiActual += row.noiActual;
    existing.noiBudget += row.noiBudget;
    existing.noiProForma += row.noiProForma;
    existing.noiScenario += row.noiScenario;
    existing.assetValue = row.assetValue;
    existing.loanBalance = row.loanBalance;
    existing.equityValue = row.equityValue;
    existing.ltv = row.ltv;
  }

  return Array.from(buckets.values()).sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

function comparisonLabel(mode: ComparisonMode, scenarioLabel?: string): string {
  if (mode === "budget") return "Budget";
  if (mode === "pro_forma") return "Pro Forma";
  if (mode === "scenario") return scenarioLabel ? `Scenario (${scenarioLabel})` : "Scenario";
  return "YoY";
}

function CustomTooltip({
  active,
  payload,
  label,
  overlays,
}: TooltipProps<ValueType, NameType> & { overlays: BalanceMetricDef[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartPoint | undefined;
  if (!row) return null;

  return (
    <div style={TOOLTIP_STYLE} className="min-w-[220px] rounded-lg border border-bm-border/70">
      <div className="border-b border-bm-border/50 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-bm-muted2">
        {label}
      </div>
      <div className="mt-2 space-y-1.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-bm-muted2">Actual NOI</span>
          <span className="font-medium text-bm-text">{fmtMoney(row.noiActual)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-bm-muted2">Baseline</span>
          <span className="font-medium text-bm-text">{fmtMoney(row.baselineValue)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-bm-muted2">Percent Delta</span>
          <span className={`font-medium ${row.deltaPct != null && row.deltaPct < 0 ? "text-red-400" : "text-green-400"}`}>
            {fmtPct(row.deltaPct)}
          </span>
        </div>
        {overlays.map((overlay) => (
          <div key={overlay.key} className="flex items-center justify-between gap-3">
            <span className="text-bm-muted2">{overlay.label}</span>
            <span className="font-medium text-bm-text">
              {overlay.formatter(row[overlay.key])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NoiComparisonPanel({
  entityType,
  entityId,
  entityName,
  actualNoiAnnual,
  assetValue,
  loanBalance,
  startDate,
  selectedScenarioLabel,
}: Props) {
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("yoy");
  const [resolution, setResolution] = useState<Resolution>("quarterly");
  const [showBalanceMetrics, setShowBalanceMetrics] = useState(false);
  const [selectedBalanceMetrics, setSelectedBalanceMetrics] = useState<BalanceMetricKey[]>([
    "assetValue",
    "loanBalance",
  ]);

  const balanceMetricDefs = useMemo<Record<BalanceMetricKey, BalanceMetricDef>>(
    () => ({
      assetValue: {
        key: "assetValue",
        label: "Asset Value",
        color: "#4F8CFF",
        formatter: fmtMoney,
      },
      loanBalance: {
        key: "loanBalance",
        label: "Loan Balance",
        color: "#F59E0B",
        formatter: fmtMoney,
      },
      equityValue: {
        key: "equityValue",
        label: "Equity Value",
        color: "#7CFFB2",
        formatter: fmtMoney,
      },
      ltv: {
        key: "ltv",
        label: "LTV",
        color: "#C084FC",
        formatter: fmtPct,
      },
    }),
    [],
  );

  const monthlySeed = useMemo(
    () =>
      createMonthlySeedSeries({
        entityId,
        actualNoiAnnual,
        assetValue,
        loanBalance,
        startDate,
      }),
    [entityId, actualNoiAnnual, assetValue, loanBalance, startDate],
  );

  const aggregated = useMemo(
    () => aggregateSeries(monthlySeed, resolution),
    [monthlySeed, resolution],
  );

  const chartData = useMemo(() => {
    const yoyLookback = resolution === "monthly" ? 12 : resolution === "quarterly" ? 4 : 1;
    return aggregated.map((point, index, series) => {
      let baselineValue: number | null = null;
      if (comparisonMode === "budget") baselineValue = point.noiBudget;
      if (comparisonMode === "pro_forma") baselineValue = point.noiProForma;
      if (comparisonMode === "scenario") baselineValue = point.noiScenario;
      if (comparisonMode === "yoy") {
        const prior = series[index - yoyLookback];
        baselineValue = prior ? prior.noiActual : null;
      }

      const deltaPct =
        baselineValue != null && baselineValue !== 0
          ? (point.noiActual - baselineValue) / Math.abs(baselineValue)
          : null;

      return {
        ...point,
        baselineValue,
        deltaPct,
        deltaPositive: deltaPct != null && deltaPct >= 0 ? deltaPct : null,
        deltaNegative: deltaPct != null && deltaPct < 0 ? deltaPct : null,
      };
    });
  }, [aggregated, comparisonMode, resolution]);

  const visibleOverlayDefs = useMemo(
    () =>
      showBalanceMetrics
        ? selectedBalanceMetrics.map((key) => balanceMetricDefs[key])
        : [],
    [showBalanceMetrics, selectedBalanceMetrics, balanceMetricDefs],
  );

  const maxAbsDelta = useMemo(() => {
    const values = chartData
      .map((point) => Math.abs(point.deltaPct ?? 0))
      .filter((value) => value > 0);
    const max = values.length ? Math.max(...values) : 0.1;
    return Math.max(max * 1.15, 0.1);
  }, [chartData]);

  const averageNoi = useMemo(() => {
    if (!chartData.length) return null;
    return chartData.reduce((sum, point) => sum + point.noiActual, 0) / chartData.length;
  }, [chartData]);

  const yoyGrowth = useMemo(() => {
    if (chartData.length < 2) return null;
    const lookback = resolution === "monthly" ? 12 : resolution === "quarterly" ? 4 : 1;
    const latest = chartData[chartData.length - 1];
    const prior = chartData[chartData.length - 1 - lookback];
    if (!prior || !prior.noiActual) return null;
    return (latest.noiActual - prior.noiActual) / Math.abs(prior.noiActual);
  }, [chartData, resolution]);

  const latestPoint = chartData[chartData.length - 1] ?? null;
  const varianceVsBudget =
    latestPoint && latestPoint.noiBudget
      ? (latestPoint.noiActual - latestPoint.noiBudget) / Math.abs(latestPoint.noiBudget)
      : null;

  function toggleBalanceMetric(metric: BalanceMetricKey) {
    setSelectedBalanceMetrics((current) => {
      if (current.includes(metric)) {
        return current.length === 1 ? current : current.filter((item) => item !== metric);
      }
      return [...current, metric];
    });
  }

  return (
    <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
            NOI Over Time
          </h3>
          <p className="mt-1 text-sm text-bm-muted">
            Comparative NOI analytics for {entityType} <span className="font-medium text-bm-text">{entityName}</span>.
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
            {entityType} · {entityId.slice(0, 8)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-bm-border/70 bg-bm-bg/40 px-3 py-2 text-xs uppercase tracking-[0.08em] text-bm-muted2">
            <span>Comparison</span>
            <select
              aria-label="Comparison Mode"
              value={comparisonMode}
              onChange={(event) => setComparisonMode(event.target.value as ComparisonMode)}
              className="bg-transparent text-sm normal-case text-bm-text outline-none"
            >
              {COMPARISON_OPTIONS.map((option) => (
                <option key={option.key} value={option.key} className="bg-bm-bg text-bm-text">
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center rounded-lg border border-bm-border/70 bg-bm-bg/40 p-1">
            {RESOLUTION_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setResolution(option.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  resolution === option.key
                    ? "bg-bm-accent text-white"
                    : "text-bm-muted hover:bg-bm-surface/40 hover:text-bm-text"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-pressed={showBalanceMetrics}
            onClick={() => setShowBalanceMetrics((current) => !current)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium uppercase tracking-[0.08em] transition-colors ${
              showBalanceMetrics
                ? "border-bm-accent/70 bg-bm-accent/15 text-bm-text"
                : "border-bm-border/70 bg-bm-bg/40 text-bm-muted2"
            }`}
          >
            Balance Sheet Metrics
          </button>
        </div>
      </div>

      {showBalanceMetrics && (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="balance-metric-controls">
          {(["assetValue", "loanBalance", "equityValue", "ltv"] as BalanceMetricKey[]).map((metricKey) => {
            const metric = balanceMetricDefs[metricKey];
            const active = selectedBalanceMetrics.includes(metricKey);
            return (
              <button
                key={metric.key}
                type="button"
                onClick={() => toggleBalanceMetric(metricKey)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "border-bm-border/80 text-bm-text"
                    : "border-bm-border/40 text-bm-muted2"
                }`}
                style={active ? { backgroundColor: `${metric.color}18` } : undefined}
              >
                {metric.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.1em] text-bm-muted2">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.noi }} />
          Actual NOI
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full border border-bm-border/70 bg-bm-muted2/50" />
          {comparisonLabel(comparisonMode, selectedScenarioLabel)} Baseline
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
          Positive Delta
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          Negative Delta
        </span>
        {visibleOverlayDefs.map((metric) => (
          <span key={metric.key} className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: metric.color }} />
            {metric.label}
          </span>
        ))}
      </div>

      <div className="mt-4 h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={360}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid vertical={false} {...GRID_STYLE} />
            <XAxis dataKey="label" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis
              yAxisId="noi"
              tick={AXIS_TICK_STYLE}
              axisLine={false}
              tickLine={false}
              width={72}
              tickFormatter={(value: number) => fmtMoney(value)}
            />
            <YAxis
              yAxisId="delta"
              orientation="right"
              tick={AXIS_TICK_STYLE}
              axisLine={false}
              tickLine={false}
              width={62}
              domain={[-maxAbsDelta, maxAbsDelta]}
              tickFormatter={(value: number) => fmtPct(value)}
            />
            <YAxis yAxisId="balance" hide domain={["auto", "auto"]} />
            <Tooltip content={<CustomTooltip overlays={visibleOverlayDefs} />} />

            <ReferenceLine yAxisId="delta" y={0} stroke="rgba(148, 163, 184, 0.5)" strokeDasharray="4 4" />

            <Area
              yAxisId="noi"
              type="monotone"
              dataKey="baselineValue"
              stroke="rgba(148, 163, 184, 0.75)"
              fill="rgba(148, 163, 184, 0.10)"
              strokeDasharray="5 5"
              fillOpacity={1}
              isAnimationActive={false}
            />
            <Bar
              yAxisId="noi"
              dataKey="noiActual"
              fill={CHART_COLORS.noi}
              fillOpacity={0.88}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
            <Line
              yAxisId="delta"
              type="monotone"
              dataKey="deltaPositive"
              stroke="#22C55E"
              strokeWidth={2.25}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="delta"
              type="monotone"
              dataKey="deltaNegative"
              stroke="#F87171"
              strokeWidth={2.25}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />

            {visibleOverlayDefs.map((metric) => (
              <Line
                key={metric.key}
                yAxisId="balance"
                type="monotone"
                dataKey={metric.key}
                stroke={metric.color}
                strokeWidth={1.8}
                strokeDasharray={metric.key === "ltv" ? "4 3" : undefined}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-bm-border/60 bg-bm-bg/35 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.1em] text-bm-muted2">Average NOI</p>
          <p className="mt-1 text-lg font-semibold text-bm-text">{fmtMoney(averageNoi)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/60 bg-bm-bg/35 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.1em] text-bm-muted2">YoY NOI Growth</p>
          <p className={`mt-1 text-lg font-semibold ${yoyGrowth != null && yoyGrowth < 0 ? "text-red-400" : "text-green-400"}`}>
            {fmtPct(yoyGrowth)}
          </p>
        </div>
        <div className="rounded-xl border border-bm-border/60 bg-bm-bg/35 px-4 py-3" data-testid="variance-card">
          <p className="text-[11px] uppercase tracking-[0.1em] text-bm-muted2">
            Variance vs Budget
          </p>
          <p className={`mt-1 text-lg font-semibold ${varianceVsBudget != null && varianceVsBudget < 0 ? "text-red-400" : "text-green-400"}`}>
            {fmtPct(varianceVsBudget)}
          </p>
        </div>
      </div>
    </div>
  );
}
