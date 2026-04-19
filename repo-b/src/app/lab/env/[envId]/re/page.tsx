"use client";

import React from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import {
  deleteRepeFund,
  getReV2EnvironmentPortfolioKpis,
  getPortfolioAuthoritativeStates,
  getAssetMapPoints,
  RepeFund,
  ReV2EnvironmentPortfolioKpis,
  ReV2AuthoritativeState,
  type AssetMapResponse,
} from "@/lib/bos-api";
import { listReV1Funds } from "@/lib/bos-api";
import { FundDeleteDialog } from "@/components/repe/FundDeleteDialog";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { KpiStrip } from "@/components/repe/asset-cockpit/KpiStrip";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { fmtMoney, fmtMultiple, fmtPct } from '@/lib/format-utils';
import { PortfolioAssetMap } from "@/components/repe/portfolio/PortfolioAssetMap";
import FundTrendPanel from "@/components/repe/portfolio/FundTrendPanel";
import { UnavailableCell } from "@/components/re/UnavailableTile";
import { renderAuthoritativeMetric, type MetricCell } from "@/lib/re/assertAuthoritativeMetric";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { CHART_COLORS, TOOLTIP_STYLE, AXIS_TICK_STYLE, GRID_STYLE, fmtCompact } from "@/components/charts/chart-theme";
import {
  RepeIndexScaffold,
  reIndexNumericCellClass,
  reIndexPrimaryCellClass,
  reIndexTableBodyClass,
  reIndexTableClass,
  reIndexTableHeadRowClass,
  reIndexTableRowClass,
  reIndexTableShellClass,
} from "@/components/repe/RepeIndexScaffold";

function pickCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getUTCMonth() + 1) / 3);
  return `${now.getUTCFullYear()}Q${q}`;
}

function fmtMoneyOrDash(v: string | number | undefined | null): string {
  if (v == null) return "—";
  return fmtMoney(v);
}

const createFundActionClass =
  "inline-flex h-10 w-10 items-center justify-center rounded-full border border-bm-border/70 bg-bm-surface/20 text-bm-text transition-[transform,colors,box-shadow] duration-[120ms] hover:-translate-y-[1px] hover:border-bm-border/90 hover:bg-bm-surface/35 focus-visible:outline-none focus-visible:shadow-[0_0_4px_hsl(var(--bm-accent)/0.3)] focus-visible:ring-1 focus-visible:ring-bm-ring/50";

const deleteFundActionClass =
  "h-8 w-8 rounded-full border border-bm-border/55 bg-transparent p-0 text-bm-muted2 transition-[transform,colors,box-shadow] duration-[120ms] hover:border-bm-danger/25 hover:bg-bm-danger/8 hover:text-bm-danger";

type FundRow = RepeFund & { auth?: ReV2AuthoritativeState | null };

type TimeMetric = "ending_nav" | "total_called" | "dpi" | "tvpi";
const TIME_METRIC_OPTIONS: { value: TimeMetric; label: string }[] = [
  { value: "ending_nav", label: "NAV" },
  { value: "total_called", label: "Called Capital" },
  { value: "dpi", label: "DPI" },
  { value: "tvpi", label: "TVPI" },
];

const FUND_COLORS = [
  CHART_COLORS.revenue,
  CHART_COLORS.noi,
  CHART_COLORS.opex,
  "#a78bfa",
  "#f97316",
  "#06b6d4",
];

function wrapFundLabel(label: string, maxLineLength = 14): [string, string?] {
  const cleaned = label.trim();
  if (cleaned.length <= maxLineLength) return [cleaned];

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return [cleaned.slice(0, maxLineLength), `${cleaned.slice(maxLineLength, maxLineLength * 2 - 1)}…`];
  }

  let firstLine = "";
  const remaining: string[] = [];
  for (const word of words) {
    const nextLine = firstLine ? `${firstLine} ${word}` : word;
    if (nextLine.length <= maxLineLength || !firstLine) {
      firstLine = nextLine;
    } else {
      remaining.push(word);
    }
  }

  const secondRaw = remaining.length ? remaining.join(" ") : words.slice(-1)[0];
  const secondLine = secondRaw.length > maxLineLength ? `${secondRaw.slice(0, maxLineLength - 1)}…` : secondRaw;
  return [firstLine, secondLine];
}

function FundComparisonTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const { x = 0, y = 0, payload } = props;
  const [lineOne, lineTwo] = wrapFundLabel(String(payload?.value ?? ""));

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        fill={AXIS_TICK_STYLE.fill}
        fontSize={9}
        textAnchor="middle"
      >
        <tspan x={0} dy={12}>{lineOne}</tspan>
        {lineTwo ? <tspan x={0} dy={10}>{lineTwo}</tspan> : null}
      </text>
    </g>
  );
}

// ── Authoritative metric helpers ────────────────────────────────────────────
// Every numeric KPI on this page goes through this path.
// If the authoritative state is unreleased, period-drifted, or carries a
// null_reason, the metric is rendered as <UnavailableCell> instead of a number.

function authMetric(fund: FundRow, field: string): MetricCell<string> {
  return renderAuthoritativeMetric(fund.auth, field, (v) => String(v), {
    entityLabel: fund.name,
  });
}

function authNumeric(fund: FundRow, field: string): number | null {
  const cell = authMetric(fund, field);
  if (cell.kind !== "value") return null;
  const n = Number(cell.value);
  return isNaN(n) ? null : n;
}

function isReleased(fund: FundRow): boolean {
  return fund.auth?.promotion_state === "released" && fund.auth?.state_origin === "authoritative";
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ReFundListPage() {
  const { envId, businessId } = useReEnv();
  const { push } = useToast();
  const [funds, setFunds] = useState<FundRow[]>([]);
  const [portfolioKpis, setPortfolioKpis] = useState<ReV2EnvironmentPortfolioKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<FundRow | null>(null);
  const [deletingFundId, setDeletingFundId] = useState<string | null>(null);

  const [mapData, setMapData] = useState<AssetMapResponse | null>(null);
  const [mapLoading, setMapLoading] = useState(false);

  const [timeMetric, setTimeMetric] = useState<TimeMetric>("ending_nav");

  const quarter = pickCurrentQuarter();

  // ── Data fetch: batched authoritative state for all funds ─────────────
  // Single round-trip to GET /api/re/v2/environments/{envId}/portfolio-states
  // replaces the prior per-fund N+1. Funds with no released snapshot are
  // still shown (auth=null) so the page's existing fail-closed rendering
  // (assertAuthoritativeMetric / UnavailableCell) handles them unchanged.
  const refreshFunds = useCallback(async () => {
    if (!businessId && !envId) return;
    setLoading(true);
    try {
      const rows = await listReV1Funds({ env_id: envId || undefined, business_id: businessId || undefined });
      let authByFund = new Map<string, ReV2AuthoritativeState>();
      if (envId) {
        try {
          const batched = await getPortfolioAuthoritativeStates(envId, quarter);
          authByFund = new Map(batched.states.map((s) => [s.entity_id, s]));
        } catch {
          authByFund = new Map();
        }
      }
      const enriched: FundRow[] = rows.map((f) => ({
        ...f,
        auth: authByFund.get(f.fund_id) ?? null,
      }));
      setFunds(enriched);
    } catch {
      setFunds([]);
    } finally {
      setLoading(false);
    }
  }, [businessId, envId, quarter]);

  const refreshPortfolioKpis = useCallback(async () => {
    if (!envId) {
      setPortfolioKpis(null);
      return;
    }
    try {
      setPortfolioKpis(await getReV2EnvironmentPortfolioKpis(envId, quarter));
    } catch {
      setPortfolioKpis(null);
    }
  }, [envId, quarter]);

  useEffect(() => {
    void refreshFunds();
  }, [refreshFunds]);

  useEffect(() => {
    void refreshPortfolioKpis();
  }, [refreshPortfolioKpis]);

  useEffect(() => {
    if (!envId) return;
    setMapLoading(true);
    getAssetMapPoints({ env_id: envId, status: "all" })
      .then(setMapData)
      .catch(() => setMapData(null))
      .finally(() => setMapLoading(false));
  }, [envId]);

  const isMultiplier = timeMetric === "dpi" || timeMetric === "tvpi";

  // ── Chart data: only funds with released authoritative state ──────────
  const comparisonBarData = useMemo(() => {
    return funds
      .filter((f) => isReleased(f))
      .map((f, i) => {
        const v = authNumeric(f, timeMetric);
        return v !== null ? { name: f.name, value: v, color: FUND_COLORS[i % FUND_COLORS.length] } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [funds, timeMetric]);

  // ── Aggregated KPIs: NAV-weighted IRR from released funds only ────────
  function navWeightedAvg(field: "gross_irr" | "net_irr"): string {
    const valid = funds.filter((f) => {
      return isReleased(f) && authNumeric(f, field) !== null && authNumeric(f, "ending_nav") !== null;
    });
    if (valid.length === 0) return "—";
    const totalNav = valid.reduce((s, f) => s + (authNumeric(f, "ending_nav") ?? 0), 0);
    if (totalNav === 0) return "—";
    const wtd = valid.reduce((s, f) => s + (authNumeric(f, field) ?? 0) * (authNumeric(f, "ending_nav") ?? 0), 0) / totalNav;
    return fmtPct(wtd);
  }

  const computedGrossIrr = useMemo(() => navWeightedAvg("gross_irr"), [funds]);
  const computedNetIrr = useMemo(() => navWeightedAvg("net_irr"), [funds]);

  const computedDscr = useMemo(() => {
    const withDscr = funds.filter((f) => isReleased(f) && authNumeric(f, "weighted_dscr") !== null && authNumeric(f, "ending_nav") !== null);
    if (withDscr.length === 0) return "—";
    const totalNav = withDscr.reduce((s, f) => s + (authNumeric(f, "ending_nav") ?? 0), 0);
    if (totalNav <= 0) {
      const avg = withDscr.reduce((s, f) => s + (authNumeric(f, "weighted_dscr") ?? 0), 0) / withDscr.length;
      return `${avg.toFixed(2)}x`;
    }
    const wtd = withDscr.reduce(
      (s, f) => s + (authNumeric(f, "weighted_dscr") ?? 0) * (authNumeric(f, "ending_nav") ?? 0), 0
    ) / totalNav;
    return `${wtd.toFixed(2)}x`;
  }, [funds]);

  // ── Signal bar: only from released authoritative data ─────────────────
  const signals = useMemo(() => {
    const released = funds.filter((f) => isReleased(f));
    const items: { label: string; value: string; tone?: "positive" | "negative" | "neutral" }[] = [];
    if (released.length === 0) return items;

    let topNavFund: FundRow | null = null;
    let topNavVal = 0;
    for (const f of released) {
      const v = authNumeric(f, "ending_nav");
      if (v !== null && v > topNavVal) { topNavFund = f; topNavVal = v; }
    }
    if (topNavFund && topNavVal > 0) {
      items.push({ label: "Top NAV", value: `${topNavFund.name}: ${fmtMoney(topNavVal)}` });
    }

    const dscrWatch = released.filter((f) => {
      const dscr = authNumeric(f, "weighted_dscr");
      return dscr !== null && dscr < 1.25;
    });
    if (dscrWatch.length > 0) {
      items.push({
        label: "DSCR Watch",
        value: `${dscrWatch.length} fund${dscrWatch.length > 1 ? "s" : ""} below 1.25x`,
        tone: "negative",
      });
    }

    let topDpiFund: FundRow | null = null;
    let topDpiVal = 0;
    for (const f of released) {
      const v = authNumeric(f, "dpi");
      if (v !== null && v > topDpiVal) { topDpiFund = f; topDpiVal = v; }
    }
    if (topDpiFund && topDpiVal > 0) {
      items.push({ label: "DPI Leader", value: `${topDpiFund.name}: ${fmtMultiple(topDpiVal)}`, tone: "positive" });
    }

    return items;
  }, [funds]);

  const base = `/lab/env/${envId}/re`;

  const handleDeleteFund = useCallback(async () => {
    if (!deleteTarget) return;
    setDeletingFundId(deleteTarget.fund_id);
    try {
      const result = await deleteRepeFund(deleteTarget.fund_id);
      setFunds((current) => current.filter((fund) => fund.fund_id !== deleteTarget.fund_id));
      setDeleteTarget(null);
      void refreshFunds();
      void refreshPortfolioKpis();
      push({
        title: "Fund deleted",
        description: `Removed ${result.deleted.investments} investments and ${result.deleted.assets} assets.`,
        variant: "success",
      });
    } catch (err) {
      push({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Failed to delete fund.",
        variant: "danger",
      });
    } finally {
      setDeletingFundId(null);
    }
  }, [deleteTarget, push, refreshFunds, refreshPortfolioKpis]);

  // ── Render helpers for table cells ────────────────────────────────────
  function renderMetricCell(fund: FundRow, field: string, formatter: (v: string | number) => string) {
    const cell = renderAuthoritativeMetric(
      fund.auth,
      field,
      (v) => formatter(v as string | number),
      { entityLabel: fund.name },
    );
    if (cell.kind === "value") return <span>{cell.value}</span>;
    return <UnavailableCell nullReason={cell.nullReason} />;
  }

  return (
    <>
      <RepeIndexScaffold
        title="Fund Portfolio"
        subtitle={`As of ${quarter}`}
        action={
          <Link
            href={`${base}/funds/new`}
            className={createFundActionClass}
            aria-label="Create Fund"
            title="Create Fund"
          >
            <Plus aria-hidden="true" size={16} strokeWidth={2.1} />
            <span className="sr-only">Create Fund</span>
          </Link>
        }
        metrics={
          <KpiStrip
            variant="band"
            kpis={[
              {
                label: "Funds",
                value: portfolioKpis ? String(portfolioKpis.fund_count) : "—",
              },
              {
                label: "Active Assets",
                value: portfolioKpis ? String(portfolioKpis.active_assets) : "—",
              },
              { label: "Total Commitments", value: fmtMoneyOrDash(portfolioKpis?.total_commitments) },
              { label: "Portfolio NAV", value: fmtMoneyOrDash(portfolioKpis?.portfolio_nav) },
              {
                label: "Gross IRR",
                value: portfolioKpis?.gross_irr != null
                  ? fmtPct(parseFloat(portfolioKpis.gross_irr))
                  : computedGrossIrr,
              },
              {
                label: "Net IRR",
                value: portfolioKpis?.net_irr != null
                  ? fmtPct(parseFloat(portfolioKpis.net_irr))
                  : computedNetIrr,
              },
              // DSCR KPI: compact single-line render. When DSCR is unavailable
              // (or not modeled for this portfolio) render "Unavailable" instead
              // of reserving full visual weight for an invalid value.
              ...(computedDscr !== "—"
                ? [{ label: "Wtd DSCR", value: computedDscr }]
                : [{ label: "DSCR", value: "Unavailable" }]),
            ]}
          />
        }
        className="w-full"
      >
        {/* ── SIGNAL BAR ── */}
        {!loading && signals.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bm-border/20 bg-bm-surface/[0.02] px-4 py-1.5">
            <span className="text-[9px] uppercase tracking-[0.14em] text-bm-muted2 font-semibold">Signals</span>
            {signals.map((s, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs">
                <span className="text-[10px] uppercase tracking-[0.1em] text-bm-muted2">{s.label}:</span>
                <span className={`font-medium ${
                  s.tone === "positive" ? "text-green-400" :
                  s.tone === "negative" ? "text-red-400" :
                  "text-bm-text"
                }`}>{s.value}</span>
                {i < signals.length - 1 && <span className="text-bm-border/40 ml-1.5">|</span>}
              </span>
            ))}
          </div>
        )}

        {/* ── FUND COMPARISON + MAP ── */}
        {!loading && funds.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-stretch">

            <div className="order-1 min-w-0 lg:order-2">
              {/* Trend-over-time replaces the old point-in-time bar chart.
                  Answers: how each fund is evolving, which funds are ramping
                  vs harvesting, whether performance is realized or unrealized. */}
              <FundTrendPanel envId={envId} quarters={12} />
            </div>

            <div className="order-2 min-w-0 lg:order-1">
              <PortfolioAssetMap data={mapData} loading={mapLoading} />
            </div>

          </div>
        )}

        <section data-testid="re-fund-list">
          {loading ? (
            <div className="flex items-center justify-center rounded-xl border border-bm-border/70 py-14 text-sm text-bm-muted2">
              Loading funds...
            </div>
          ) : funds.length === 0 ? (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/10 p-8 text-center">
              <p className="text-sm text-bm-muted2">No funds yet.</p>
              <Link href={`${base}/funds/new`} className="mt-3 inline-flex text-sm text-bm-accent hover:text-bm-text">
                Create your first fund
              </Link>
            </div>
          ) : (
            <div className={reIndexTableShellClass}>
              <table className={`${reIndexTableClass} min-w-[1320px]`}>
                <thead>
                  <tr className={reIndexTableHeadRowClass}>
                    <th className="px-4 py-3 font-medium">Fund Name</th>
                    <th className="px-4 py-3 font-medium">Strategy</th>
                    <th className="px-4 py-3 font-medium">Vintage</th>
                    <th className="px-4 py-3 text-right font-medium">AUM</th>
                    <th className="px-4 py-3 text-right font-medium">NAV</th>
                    <th className="px-4 py-3 text-right font-medium">Gross IRR</th>
                    <th className="px-4 py-3 text-right font-medium">Net IRR</th>
                    <th className="px-4 py-3 text-right font-medium">DPI</th>
                    <th className="px-4 py-3 text-right font-medium">TVPI</th>
                    <th className="px-4 py-3 text-right font-medium">% Invested</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className={reIndexTableBodyClass}>
                  {funds.map((fund) => {
                    const committed = authNumeric(fund, "total_committed");
                    const called = authNumeric(fund, "total_called");
                    const pctInvested = committed && called ? called / committed : null;
                    return (
                    <tr key={fund.fund_id} className={reIndexTableRowClass}>
                      <td className="px-3 py-3 align-middle">
                        <Link href={`${base}/funds/${fund.fund_id}`} className={reIndexPrimaryCellClass}>
                          {fund.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 align-middle text-[12px] uppercase tracking-[0.04em] text-bm-muted2">
                        {fund.strategy?.toUpperCase() ?? "—"}
                      </td>
                      <td className="px-3 py-3 align-middle text-[12px] tracking-[0.04em] text-bm-muted2">
                        {fund.vintage_year}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                        {renderMetricCell(fund, "total_committed", (v) => fmtMoney(v))}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                        {renderMetricCell(fund, "ending_nav", (v) => fmtMoney(v))}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                        {renderMetricCell(fund, "gross_irr", (v) => fmtPct(v))}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                        {renderMetricCell(fund, "net_irr", (v) => fmtPct(v))}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                        {renderMetricCell(fund, "dpi", (v) => fmtMultiple(v))}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                        {renderMetricCell(fund, "tvpi", (v) => fmtMultiple(v))}
                      </td>
                      <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                        {pctInvested != null ? `${(pctInvested * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <span className="inline-flex rounded-full border border-bm-border/60 bg-bm-surface/18 px-2.5 py-1 text-[11px] capitalize text-bm-muted2">
                          {fund.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right align-middle">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={deleteFundActionClass}
                          onClick={() => setDeleteTarget(fund)}
                          data-testid={`delete-fund-${fund.fund_id}`}
                          aria-label={`Delete ${fund.name}`}
                          title={`Delete ${fund.name}`}
                        >
                          <Minus aria-hidden="true" size={14} strokeWidth={2.1} />
                          <span className="sr-only">Delete {fund.name}</span>
                        </Button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </RepeIndexScaffold>
      <FundDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        fundName={deleteTarget?.name || ""}
        deleting={deleteTarget ? deletingFundId === deleteTarget.fund_id : false}
        onConfirm={handleDeleteFund}
      />
    </>
  );
}
