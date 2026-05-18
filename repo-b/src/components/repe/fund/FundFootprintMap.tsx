"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Building2, Globe2, MapPinned, RefreshCcw, ShieldAlert, TrendingUp } from "lucide-react";

import { StateCard } from "@/components/ui/StateCard";
import TrendLineChart from "@/components/charts/TrendLineChart";
import {
  getFundFootprintAnalytics,
  type FundFootprintAnalyticsResponse,
  type FundFootprintAssetPoint,
  type FundFootprintMarketRollup,
  type FundFootprintSeriesPoint,
} from "@/lib/bos-api";
import { fmtMoney, fmtNumber, fmtPct, fmtText } from "@/lib/format-utils";

const MapInner = dynamic(() => import("./FundFootprintMapInner"), { ssr: false });

type StatusFilter = "all" | "owned" | "pipeline" | "disposed";
type ViewMode = "assets" | "markets";
type PropertyTypeFilter = "all" | string;
type SelectionState =
  | { mode: "portfolio" }
  | { mode: "market"; marketKey: string }
  | { mode: "asset"; assetId: string };

const PANEL_CLASS =
  "rounded-xl border border-slate-200 bg-white shadow-sm dark:border-bm-border/20 dark:bg-bm-surface/80";

const STORAGE_PREFIX = "repe-fund-footprint-filters";

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:text-bm-muted2">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold tabular-nums text-slate-900 dark:text-bm-text">{String(value)}</p>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors ${
        active
          ? "border-bm-accent/30 bg-bm-accent/10 text-bm-accent"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:border-bm-border/20 dark:bg-transparent dark:text-bm-muted2 dark:hover:text-bm-text"
      }`}
    >
      {label}
    </button>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/90 p-3 dark:border-bm-border/20 dark:bg-bm-surface/80">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-bm-muted2">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-bm-text">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-bm-muted2">{hint}</p> : null}
    </div>
  );
}

function Pill({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "positive" | "warn" | "negative";
}) {
  const className =
    tone === "positive"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-400"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-400"
        : tone === "negative"
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400"
          : "border-slate-200 bg-white text-slate-500 dark:border-bm-border/20 dark:bg-bm-surface/60 dark:text-bm-muted2";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );
}

function progressWidth(share: number): string {
  return `${Math.max(6, Math.round(share * 100))}%`;
}

function defaultToneForMarket(market: FundFootprintMarketRollup): "positive" | "warn" | "negative" {
  if (market.performance_state === "outperforming") return "positive";
  if (market.performance_state === "underperforming") return "negative";
  return "warn";
}

function actionForAsset(asset: FundFootprintAssetPoint): string {
  if (asset.dscr_trust_state === "missing_inputs") return "Repair debt inputs before using DSCR operationally.";
  if (asset.dscr != null && asset.dscr < 1.1) return "Review refinance risk and lender covenant headroom.";
  if (asset.occupancy != null && asset.occupancy < 0.9) return "Prioritize leasing and pricing review for occupancy recovery.";
  return "Monitor market trend and hold for the next quarter close.";
}

function actionForMarket(market: FundFootprintMarketRollup): string {
  if (market.integrity_issues > 0) return "Resolve snapshot gaps before using this market for capital allocation calls.";
  if (market.performance_state === "underperforming") return "Focus asset-by-asset remediation and underwriting refresh in this market.";
  if (market.performance_state === "outperforming") return "Candidate market for follow-on allocation or refinancing review.";
  return "Watch concentration and operating trends before making allocation moves.";
}

function marketSeriesToChartData(series: FundFootprintSeriesPoint[]) {
  return series.map((point) => ({
    quarter: point.quarter,
    total_nav: point.total_nav ?? null,
    total_noi: point.total_noi ?? null,
    avg_occupancy: point.avg_occupancy ?? null,
    avg_dscr: point.avg_dscr ?? null,
  }));
}

function assetSeriesToChartData(series: FundFootprintSeriesPoint[]) {
  return series.map((point) => ({
    quarter: point.quarter,
    asset_value: point.asset_value ?? null,
    noi: point.noi ?? null,
    occupancy: point.occupancy ?? null,
    dscr: point.dscr ?? null,
    ltv: point.ltv ?? null,
  }));
}

function PortfolioPanel({ data }: { data: FundFootprintAnalyticsResponse }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Total NAV" value={fmtMoney(data.summary.total_nav)} hint="Authoritative released snapshot scope only" />
        <MetricCard label="Markets" value={fmtNumber(data.summary.markets)} hint="Distinct current markets with geocoded assets" />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/20 dark:bg-bm-surface/60">
        <div className="flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-blue-500 dark:text-bm-accent" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-bm-text">Geographic Allocation</h3>
            <p className="text-xs text-slate-500 dark:text-bm-muted2">% NAV by region</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {data.summary.geography_allocation.map((row) => (
            <div key={row.region}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-900 dark:text-bm-text">{row.region}</span>
                <span className="text-slate-500 dark:text-bm-muted2">{fmtPct(row.share_of_nav)} · {fmtMoney(row.total_nav)}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-bm-border/30">
                <div className="h-full rounded-full bg-blue-500 dark:bg-bm-accent" style={{ width: progressWidth(row.share_of_nav) }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/20 dark:bg-bm-surface/60">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-blue-500 dark:text-bm-accent" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-bm-text">Market Concentration Risk</h3>
            <p className="text-xs text-slate-500 dark:text-bm-muted2">Top markets by NAV</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {data.summary.top_markets.map((market) => (
            <div key={market.market_key} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-bm-border/20 dark:bg-bm-surface/40">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-bm-text">{market.market_label}</p>
                  <p className="text-xs text-slate-500 dark:text-bm-muted2">{fmtMoney(market.total_nav)} · {fmtPct(market.share_of_nav)}</p>
                </div>
                <Pill
                  label={market.performance_state}
                  tone={market.performance_state === "outperforming" ? "positive" : market.performance_state === "underperforming" ? "negative" : "warn"}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/20 dark:bg-bm-surface/60">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-500 dark:text-bm-accent" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-bm-text">Signals</h3>
            <p className="text-xs text-slate-500 dark:text-bm-muted2">What needs attention first</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {data.summary.signals.length ? data.summary.signals.map((signal) => (
            <div key={signal} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-bm-border/20 dark:bg-bm-surface/40 dark:text-bm-text">
              {signal}
            </div>
          )) : (
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-bm-border/30 dark:text-bm-muted2">
              No immediate concentration or integrity signals detected in the current released footprint.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MarketPanel({
  market,
  series,
  assets,
}: {
  market: FundFootprintMarketRollup;
  series: FundFootprintSeriesPoint[];
  assets: FundFootprintAssetPoint[];
}) {
  const chartData = marketSeriesToChartData(series);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Total NAV" value={fmtMoney(market.total_nav)} hint={`${market.asset_count} assets`} />
        <MetricCard label="Avg DSCR" value={market.avg_dscr != null ? `${market.avg_dscr.toFixed(2)}x` : "Unavailable"} hint={market.integrity_issues ? `${market.integrity_issues} integrity issues` : "Released snapshot coverage"} />
        <MetricCard label="Avg Occupancy" value={fmtPct(market.avg_occupancy)} />
        <MetricCard label="Action" value={actionForMarket(market)} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/20 dark:bg-bm-surface/60">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-bm-text">Market Trend</h3>
            <p className="text-xs text-slate-500 dark:text-bm-muted2">Released snapshot NAV and NOI over time</p>
          </div>
          <Pill label={market.performance_state} tone={defaultToneForMarket(market)} />
        </div>
        <div className="mt-4 h-[220px]">
          {chartData.length > 1 ? (
            <TrendLineChart
              data={chartData}
              lines={[
                { key: "total_nav", label: "NAV", color: "#2563EB" },
                { key: "total_noi", label: "NOI", color: "#0F766E" },
              ]}
              format="dollar"
              showLegend
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 dark:border-bm-border/30 dark:text-bm-muted2">
              Not enough released history yet for a market trend.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/20 dark:bg-bm-surface/60">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-blue-500 dark:text-bm-accent" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-bm-text">Assets In Market</h3>
            <p className="text-xs text-slate-500 dark:text-bm-muted2">Selection-scoped breakdown</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {assets.map((asset) => (
            <div key={asset.asset_id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-bm-border/20 dark:bg-bm-surface/40">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-bm-text">{asset.name}</p>
                  <p className="text-xs text-slate-500 dark:text-bm-muted2">{fmtText(asset.property_type)} · {fmtText(asset.city)}</p>
                </div>
                <div className="text-right text-xs text-slate-500 dark:text-bm-muted2">
                  <p>{fmtMoney(asset.asset_value ?? asset.cost_basis)}</p>
                  <p>{asset.dscr != null ? `${asset.dscr.toFixed(2)}x DSCR` : "DSCR unavailable"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AssetPanel({
  asset,
  series,
}: {
  asset: FundFootprintAssetPoint;
  series: FundFootprintSeriesPoint[];
}) {
  const chartData = assetSeriesToChartData(series);
  const riskTone =
    asset.integrity_reason || asset.dscr_trust_state === "missing_inputs"
      ? "negative"
      : asset.dscr != null && asset.dscr < 1.1
        ? "warn"
        : "positive";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="NOI" value={fmtMoney(asset.noi)} />
        <MetricCard label="Occupancy" value={fmtPct(asset.occupancy)} />
        <MetricCard
          label="DSCR"
          value={asset.dscr != null ? `${asset.dscr.toFixed(2)}x` : "Unavailable"}
          hint={asset.dscr_reason}
        />
        <MetricCard label="Valuation" value={fmtMoney(asset.asset_value ?? asset.cost_basis)} hint={asset.valuation_quarter ? `As of ${asset.valuation_quarter}` : "No released snapshot"} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/20 dark:bg-bm-surface/60">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-bm-text">Asset Trend</h3>
            <p className="text-xs text-slate-500 dark:text-bm-muted2">NOI and occupancy over released quarters</p>
          </div>
          <Pill label={asset.integrity_reason ? "integrity issue" : "released"} tone={riskTone} />
        </div>
        <div className="mt-4 h-[220px]">
          {chartData.length > 1 ? (
            <TrendLineChart
              data={chartData}
              lines={[
                { key: "noi", label: "NOI", color: "#2563EB" },
                { key: "occupancy", label: "Occupancy", color: "#0F766E" },
              ]}
              format="dollar"
              showLegend
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 dark:border-bm-border/30 dark:text-bm-muted2">
              Not enough released history yet for an asset trend.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-bm-border/20 dark:bg-bm-surface/60">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-blue-500 dark:text-bm-accent" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-bm-text">Debt + Action</h3>
            <p className="text-xs text-slate-500 dark:text-bm-muted2">What the operator should do next</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MetricCard label="LTV" value={fmtPct(asset.ltv)} />
          <MetricCard label="Next action" value={actionForAsset(asset)} />
        </div>
      </section>
    </div>
  );
}

function AnalyticsPanel({
  data,
  selection,
  onReset,
}: {
  data: FundFootprintAnalyticsResponse;
  selection: SelectionState;
  onReset: () => void;
}) {
  const selectedMarket = selection.mode === "market"
    ? data.market_rollups.find((market) => market.market_key === selection.marketKey) ?? null
    : null;
  const selectedAsset = selection.mode === "asset"
    ? data.asset_points.find((asset) => asset.asset_id === selection.assetId) ?? null
    : null;

  const breadcrumb = selection.mode === "portfolio"
    ? ["Portfolio"]
    : selection.mode === "market"
      ? ["Portfolio", selectedMarket?.market_label ?? "Market"]
      : ["Portfolio", selectedAsset?.market ?? "Market", selectedAsset?.name ?? "Asset"];

  return (
    <aside className={`${PANEL_CLASS} flex h-[560px] min-h-[560px] flex-col overflow-hidden`} data-testid="fund-footprint-analytics-panel">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-bm-border/20">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-bm-muted2">Analytics</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-bm-text">Decision Surface</h3>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:border-bm-border/20 dark:bg-transparent dark:text-bm-muted2 dark:hover:text-bm-text"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-bm-muted2">
          {breadcrumb.map((entry, index) => (
            <span key={`${entry}-${index}`} className="inline-flex items-center gap-2">
              {index > 0 ? <span className="text-slate-300 dark:text-bm-border/60">→</span> : null}
              <span className={index === breadcrumb.length - 1 ? "font-semibold text-slate-900 dark:text-bm-text" : undefined}>{entry}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {selection.mode === "portfolio" && <PortfolioPanel data={data} />}
        {selection.mode === "market" && selectedMarket && (
          <MarketPanel
            market={selectedMarket}
            series={data.market_series[selectedMarket.market_key] ?? []}
            assets={data.asset_points.filter((asset) => asset.market_key === selectedMarket.market_key)}
          />
        )}
        {selection.mode === "asset" && selectedAsset && (
          <AssetPanel asset={selectedAsset} series={data.asset_series[selectedAsset.asset_id] ?? []} />
        )}
      </div>
    </aside>
  );
}

export function FundFootprintMap({
  envId,
  businessId,
  fundId,
  quarter,
}: {
  envId: string;
  businessId: string | null;
  fundId: string;
  quarter: string;
}) {
  const [data, setData] = useState<FundFootprintAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("assets");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<PropertyTypeFilter>("all");
  const [selection, setSelection] = useState<SelectionState>({ mode: "portfolio" });
  // fitKey increments only when new data arrives from the server — not on client-side
  // property-type filter changes — so the map does not re-zoom on every filter chip click.
  const [fitKey, setFitKey] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!fundId) return;
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:${fundId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        statusFilter?: StatusFilter;
        viewMode?: ViewMode;
        propertyTypeFilter?: PropertyTypeFilter;
      };
      if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
      if (parsed.viewMode) setViewMode(parsed.viewMode);
      if (parsed.propertyTypeFilter) setPropertyTypeFilter(parsed.propertyTypeFilter);
    } catch {
      // ignore stale local storage
    }
  }, [fundId]);

  useEffect(() => {
    if (!fundId) return;
    window.localStorage.setItem(
      `${STORAGE_PREFIX}:${fundId}`,
      JSON.stringify({ statusFilter, viewMode, propertyTypeFilter }),
    );
  }, [fundId, propertyTypeFilter, statusFilter, viewMode]);

  useEffect(() => {
    if (!fundId || !quarter) return;
    setLoading(true);
    getFundFootprintAnalytics(fundId, {
      env_id: envId,
      business_id: businessId ?? undefined,
      quarter,
      status: statusFilter,
    })
      .then((result) => {
        setData(result);
        setFitKey((k) => k + 1);
        // Preserve selection if the selected entity still exists in the new result set.
        // Only reset to portfolio if the entity was removed by the filter change.
        setSelection((prev) => {
          if (prev.mode === "asset") {
            const stillVisible = result.asset_points.some((p) => p.asset_id === prev.assetId);
            return stillVisible ? prev : { mode: "portfolio" };
          }
          if (prev.mode === "market") {
            const stillVisible = result.market_rollups.some((m) => m.market_key === prev.marketKey);
            return stillVisible ? prev : { mode: "portfolio" };
          }
          return prev;
        });
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [businessId, envId, fundId, quarter, statusFilter]);

  const availablePropertyTypes = useMemo(() => {
    const values = new Set((data?.asset_points ?? []).map((asset) => asset.property_type).filter(Boolean));
    return ["all", ...Array.from(values)] as PropertyTypeFilter[];
  }, [data]);

  const filteredAssetPoints = useMemo(() => {
    const points = data?.asset_points ?? [];
    return propertyTypeFilter === "all"
      ? points
      : points.filter((point) => point.property_type === propertyTypeFilter);
  }, [data, propertyTypeFilter]);

  const filteredMarketRollups = useMemo(() => {
    if (!data) return [];
    if (propertyTypeFilter === "all") return data.market_rollups;
    const assetIds = new Set(filteredAssetPoints.map((asset) => asset.asset_id));
    return data.market_rollups.filter((market) => market.lead_asset_ids.some((assetId) => assetIds.has(assetId)));
  }, [data, filteredAssetPoints, propertyTypeFilter]);

  return (
    <div className={`${PANEL_CLASS} p-5`} data-testid="fund-footprint-map">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-bm-muted2">Geographic Footprint</p>
          <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-bm-text">Fund Footprint</h2>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-slate-500 dark:text-bm-muted2">
          Dual-pane map plus analytics surface for exposure, market performance, change, and action.
        </p>
      </div>

      <div className="mt-4">
        {loading ? (
          <StateCard state="loading" />
        ) : !data || data.asset_points.length === 0 ? (
          <StateCard
            state="empty"
            title="No footprint data available yet"
            description="This surface needs geocoded assets and released authoritative snapshots for the selected quarter."
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-white/70 p-4 md:grid-cols-6 dark:border-bm-border/20 dark:bg-bm-surface/40">
              <SummaryMetric label="Owned" value={data.summary.owned_assets} />
              <SummaryMetric label="Pipeline" value={data.summary.pipeline_assets} />
              <SummaryMetric label="Disposed" value={data.summary.disposed_assets} />
              <SummaryMetric label="Markets" value={data.summary.markets} />
              <SummaryMetric label="NAV" value={fmtMoney(data.summary.total_nav)} />
              <SummaryMetric label="Quarter" value={quarter} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Pill label="Fund scoped" />
              {(["all", "owned", "pipeline", "disposed"] as StatusFilter[]).map((status) => (
                <FilterChip
                  key={status}
                  active={statusFilter === status}
                  label={status}
                  onClick={() => setStatusFilter(status)}
                />
              ))}
              <div className="mx-2 hidden h-5 w-px bg-slate-200 md:block dark:bg-bm-border/30" />
              {(["assets", "markets"] as ViewMode[]).map((mode) => (
                <FilterChip
                  key={mode}
                  active={viewMode === mode}
                  label={mode}
                  onClick={() => setViewMode(mode)}
                />
              ))}
              <div className="ml-auto flex flex-wrap gap-2">
                {availablePropertyTypes.map((value) => (
                  <FilterChip
                    key={value}
                    active={propertyTypeFilter === value}
                    label={value === "all" ? "All types" : value}
                    onClick={() => setPropertyTypeFilter(value)}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[3fr_2fr] lg:grid-cols-[1.2fr_1fr]">
              <div className={`${PANEL_CLASS} overflow-hidden p-4`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-bm-text">Map Intelligence</p>
                    <p className="text-xs text-slate-500 dark:text-bm-muted2">
                      {viewMode === "assets"
                        ? "Marker size reflects NAV or basis. Click an asset to drive the right rail."
                        : "Market circles aggregate released asset performance and integrity coverage."}
                    </p>
                  </div>
                  <Pill
                    label={viewMode === "assets" ? "asset view" : "market view"}
                    tone={viewMode === "assets" ? "positive" : "warn"}
                  />
                </div>
                <div className="h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-blue-50 dark:border-bm-border/20 dark:bg-bm-bg/60">
                  {mounted ? (
                    <MapInner
                      assetPoints={filteredAssetPoints}
                      marketPoints={filteredMarketRollups}
                      viewMode={viewMode}
                      selectedAssetId={selection.mode === "asset" ? selection.assetId : null}
                      selectedMarketKey={selection.mode === "market" ? selection.marketKey : null}
                      onSelectAsset={(assetId) => setSelection({ mode: "asset", assetId })}
                      onSelectMarket={(marketKey) => setSelection({ mode: "market", marketKey })}
                      fitKey={String(fitKey)}
                    />
                  ) : null}
                </div>
              </div>

              <AnalyticsPanel data={data} selection={selection} onReset={() => setSelection({ mode: "portfolio" })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
