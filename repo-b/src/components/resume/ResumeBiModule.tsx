"use client";

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, Binary, Database, Eye, Network, SearchCode, TableProperties, Waypoints, X } from "lucide-react";
import { fmtMoney, fmtPct } from "@/lib/format-utils";
import type { ResumeBi, ResumeBiEntity, ResumeBiPoint } from "@/lib/bos-api";
import TrendLineChart from "@/components/charts/TrendLineChart";
import ResumeFallbackCard from "./ResumeFallbackCard";
import {
  buildResumeBiInspectionView,
  deriveResumeBiSlice,
  findDefaultResumeBiEntityId,
  type ResumeBiInspectionView,
  type ResumeBiSlice,
} from "./biMath";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";

function CompactPrompt({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[124px] flex-col justify-center rounded-2xl border border-bm-border/25 bg-black/10 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-bm-muted2">{body}</p>
    </div>
  );
}

function MarketMap({ markets }: { markets: ResumeBiSlice["marketBreakdown"] }) {
  if (markets.length === 0) {
    return (
      <CompactPrompt
        title="Market footprint activates on drill"
        body="Select a portfolio or drill from timeline to activate the market layer and reveal the geographic footprint."
      />
    );
  }

  const maxValue = Math.max(...markets.map((market) => market.value), 1);
  return (
    <div className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Market footprint</h3>
          <p className="mt-1 text-xs text-bm-muted2">A compact geographic lens showing which markets dominate the current slice.</p>
        </div>
      </div>
      <svg viewBox="0 0 100 70" className="mt-4 h-52 w-full overflow-visible">
        <rect x="3" y="3" width="94" height="64" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" />
        {markets.map((market) => {
          const radius = 4 + (market.value / maxValue) * 8;
          return (
            <g key={market.name}>
              <circle
                cx={market.x * 100}
                cy={market.y * 70}
                r={radius}
                fill="rgba(96,165,250,0.35)"
                stroke="rgba(96,165,250,0.9)"
                strokeWidth="1.2"
              />
              <text x={market.x * 100 + radius + 1.8} y={market.y * 70} fill="rgba(255,255,255,0.76)" fontSize="3.6">
                {market.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function computeDelta(current: number, previous: number): { delta: number; direction: "up" | "down" | "flat" } {
  if (previous === 0) return { delta: 0, direction: "flat" };
  const delta = (current - previous) / Math.abs(previous);
  if (Math.abs(delta) < 0.001) return { delta: 0, direction: "flat" };
  return { delta, direction: delta > 0 ? "up" : "down" };
}

function BiKpiStrip({
  trend,
  kpis,
  context,
  hasMeaningfulData,
}: {
  trend: ResumeBiPoint[];
  kpis: { portfolio_value: number; noi: number; occupancy: number; irr: number };
  context: "demo" | "awaiting_selection";
  hasMeaningfulData: boolean;
}) {
  const prevPeriod = trend.length >= 2 ? trend[trend.length - 2] : null;
  const deltas = prevPeriod && hasMeaningfulData
    ? {
        portfolio_value: computeDelta(kpis.portfolio_value, prevPeriod.value),
        noi: computeDelta(kpis.noi, prevPeriod.noi),
        occupancy: computeDelta(kpis.occupancy, prevPeriod.occupancy),
        irr: computeDelta(kpis.irr, prevPeriod.irr),
      }
    : null;

  const items = [
    { label: "Portfolio Value", value: fmtMoney(kpis.portfolio_value), delta: deltas?.portfolio_value },
    { label: "NOI", value: fmtMoney(kpis.noi), delta: deltas?.noi },
    { label: "Occupancy", value: fmtPct(kpis.occupancy), delta: deltas?.occupancy },
    { label: "IRR", value: fmtPct(kpis.irr), delta: deltas?.irr },
  ];

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">KPI Summary</span>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] ${
            context === "demo"
              ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-200"
              : "border-amber-300/30 bg-amber-500/12 text-amber-100"
          }`}
        >
          {context === "demo" ? "Demo dataset" : "Awaiting selection"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((kpi) => (
        <div key={kpi.label} className="rounded-2xl border border-bm-border/35 bg-black/10 px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{kpi.label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-xl font-semibold">{hasMeaningfulData ? kpi.value : "—"}</p>
            {kpi.delta && kpi.delta.direction !== "flat" && hasMeaningfulData ? (
              <span className={`text-xs ${kpi.delta.direction === "up" ? "text-emerald-400" : "text-red-400"}`}>
                {kpi.delta.direction === "up" ? "+" : ""}{fmtPct(kpi.delta.delta)}
              </span>
            ) : null}
          </div>
          {!hasMeaningfulData ? (
            <p className="mt-2 text-xs text-bm-muted2">Choose a drill path to activate this metric.</p>
          ) : null}
        </div>
      ))}
      </div>
    </div>
  );
}

const LINEAGE_NODES: Array<{
  key: string;
  label: string;
  nodeId: string;
  icon: typeof Database;
  tint: string;
}> = [
  { key: "warehouse", label: "Warehouse", nodeId: "azure_data_lake", icon: Database, tint: "text-sky-200" },
  { key: "semantic", label: "Semantic Layer", nodeId: "semantic_models", icon: Binary, tint: "text-emerald-200" },
  { key: "gold", label: "Gold Tables", nodeId: "gold_tables", icon: TableProperties, tint: "text-amber-100" },
  { key: "bi", label: "BI Model", nodeId: "bi_dashboards", icon: Waypoints, tint: "text-violet-200" },
  { key: "etl", label: "ETL", nodeId: "databricks_etl", icon: Network, tint: "text-cyan-200" },
];

function DataLineage({
  onInspect,
}: {
  onInspect: (focusLabel?: string) => void;
}) {
  const { setActiveModule, selectArchitectureNode } = useResumeWorkspaceStore(
    useShallow((state) => ({
      setActiveModule: state.setActiveModule,
      selectArchitectureNode: state.selectArchitectureNode,
    })),
  );

  return (
    <div className="mt-5 rounded-[24px] border border-bm-border/30 bg-white/6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Data Lineage</p>
          <p className="mt-1 text-sm text-bm-muted">Trace the current view back to the governed system layers behind it.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {LINEAGE_NODES.map((node, index) => {
          const Icon = node.icon;
          return (
            <div key={node.key} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  selectArchitectureNode(node.nodeId);
                  setActiveModule("architecture");
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/15 px-3 py-2 text-sm text-bm-text transition hover:border-white/30 hover:bg-white/10"
              >
                <Icon className={`h-4 w-4 ${node.tint}`} />
                <span>{node.label}</span>
              </button>
              <button
                type="button"
                aria-label={`Inspect ${node.label}`}
                onClick={() => onInspect(node.label)}
                className="inline-flex items-center rounded-full border border-white/12 bg-white/6 p-2 text-bm-muted transition hover:text-white"
              >
                <SearchCode className="h-3.5 w-3.5" />
              </button>
              {index < LINEAGE_NODES.length - 1 ? <ArrowRight className="h-4 w-4 text-bm-muted2" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DrillPathIndicator({
  slice,
  rootId,
  lastBiEntitySource,
  onSelect,
}: {
  slice: ResumeBiSlice;
  rootId: string;
  lastBiEntitySource: "timeline" | "bi" | "init";
  onSelect: (entityId: string) => void;
}) {
  const slots: Array<ResumeBiEntity["level"]> = ["portfolio", "fund", "investment", "asset"];
  const byLevel = new Map(slice.breadcrumb.map((entity) => [entity.level, entity]));

  return (
    <div className="mt-5 rounded-2xl border border-bm-border/30 bg-black/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Drill Path</p>
          <p className="mt-1 text-sm text-bm-muted">Portfolio to asset context stays synchronized across KPIs, charts, and detail rows.</p>
        </div>
        {lastBiEntitySource === "timeline" && slice.entity.entity_id !== rootId ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/25 bg-sky-400/8 px-2.5 py-1 text-[11px] text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            from timeline
          </span>
        ) : null}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-4">
        {slots.map((level) => {
          const entity = byLevel.get(level);
          const isCurrent = entity?.entity_id === slice.entity.entity_id;
          return (
            <button
              key={level}
              type="button"
              onClick={() => entity && onSelect(entity.entity_id)}
              disabled={!entity}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                isCurrent
                  ? "border-white/35 bg-white/12 text-white"
                  : entity
                    ? "border-bm-border/35 bg-white/5 text-bm-text hover:border-white/25 hover:bg-white/8"
                    : "border-bm-border/20 bg-black/10 text-bm-muted2"
              }`}
            >
              <p className="text-[10px] uppercase tracking-[0.14em]">{level}</p>
              <p className="mt-2 text-sm font-medium">{entity?.name ?? "Not selected"}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InspectionPanel({
  view,
  onClose,
}: {
  view: ResumeBiInspectionView;
  onClose: () => void;
}) {
  return (
    <div className="mt-5 rounded-[24px] border border-white/12 bg-[#08111d] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Inspect This View</p>
          <h3 className="mt-2 text-lg font-semibold">{view.title}</h3>
          <p className="mt-2 text-sm text-bm-muted">{view.summary}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center rounded-full border border-white/12 bg-white/6 p-2 text-bm-muted transition hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Pseudo-SQL</p>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-sky-100">
            <code>{view.sql}</code>
          </pre>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Source Tables</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {view.sourceTables.map((table) => (
                <span key={table} className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-100">
                  {table}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Joins / Transformations</p>
            <div className="mt-3 space-y-2 text-xs text-bm-muted">
              {[...view.joins, ...view.transformations].map((entry) => (
                <p key={entry}>{entry}</p>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Filters Applied</p>
            <div className="mt-3 space-y-2 text-xs text-bm-muted">
              {view.filters.map((entry) => (
                <p key={entry}>{entry}</p>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Metric Definitions</p>
            <div className="mt-3 space-y-3 text-xs text-bm-muted">
              {view.metricDefinitions.map((metric) => (
                <div key={metric.label}>
                  <p className="font-medium text-bm-text">{metric.label}</p>
                  <p className="mt-1">{metric.definition}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResumeBiModule({ bi }: { bi: ResumeBi }) {
  const {
    selectedBiEntityId,
    selectBiEntity,
    biFilters,
    setBiFilters,
    lastBiEntitySource,
  } = useResumeWorkspaceStore(
    useShallow((state) => ({
      selectedBiEntityId: state.selectedBiEntityId,
      selectBiEntity: state.selectBiEntity,
      biFilters: state.biFilters,
      setBiFilters: state.setBiFilters,
      lastBiEntitySource: state.lastBiEntitySource,
    })),
  );
  const [inspectionFocus, setInspectionFocus] = useState<string | undefined>(undefined);
  const [inspectionOpen, setInspectionOpen] = useState(false);

  const slice = useMemo(
    () =>
      deriveResumeBiSlice(bi, selectedBiEntityId || bi.root_entity_id, {
        market: biFilters.market,
        propertyType: biFilters.propertyType,
        period: biFilters.period,
      }),
    [bi, selectedBiEntityId, biFilters.market, biFilters.propertyType, biFilters.period],
  );
  const inspectionView = useMemo(
    () => buildResumeBiInspectionView(slice, biFilters, inspectionFocus),
    [slice, biFilters, inspectionFocus],
  );
  const hasAssetData = bi.entities.some((entity) => entity.level === "asset");

  useEffect(() => {
    if (!hasAssetData) return;
    if (selectedBiEntityId !== bi.root_entity_id) return;
    if (slice.hasMeaningfulData) return;
    selectBiEntity(findDefaultResumeBiEntityId(bi));
  }, [bi, hasAssetData, selectBiEntity, selectedBiEntityId, slice.hasMeaningfulData]);

  if (!hasAssetData) {
    return (
      <ResumeFallbackCard
        eyebrow="BI Module"
        title="Resume data unavailable"
        body="This environment does not currently expose asset-level BI records, so the analytics module is showing a contained fallback."
        tone="warning"
      />
    );
  }

  return (
    <section className="rounded-[28px] border border-bm-border/60 bg-bm-surface/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="bm-section-label">BI Module</p>
          <h2 className="mt-2 text-2xl">Executive analytics with real drill paths</h2>
          <p className="mt-2 max-w-3xl text-sm text-bm-muted">
            Portfolio, fund, investment, and asset context stay connected so the viewer can navigate the operating model instead of reading bullet points.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setInspectionFocus(undefined);
              setInspectionOpen((open) => !open);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/6 px-3 py-1.5 text-xs text-bm-text transition hover:border-white/25 hover:bg-white/10"
          >
            <Eye className="h-3.5 w-3.5" />
            Inspect this view
          </button>
          <select
            value={biFilters.market}
            onChange={(event) => setBiFilters({ market: event.target.value })}
            className="rounded-full border border-bm-border/35 bg-white/5 px-3 py-1.5 text-xs text-bm-text"
          >
            <option>All Markets</option>
            {bi.markets.map((market) => (
              <option key={market}>{market}</option>
            ))}
          </select>
          <select
            value={biFilters.propertyType}
            onChange={(event) => setBiFilters({ propertyType: event.target.value })}
            className="rounded-full border border-bm-border/35 bg-white/5 px-3 py-1.5 text-xs text-bm-text"
          >
            <option>All Types</option>
            {bi.property_types.map((propertyType) => (
              <option key={propertyType}>{propertyType}</option>
            ))}
          </select>
          <select
            value={biFilters.period}
            onChange={(event) => setBiFilters({ period: event.target.value })}
            className="rounded-full border border-bm-border/35 bg-white/5 px-3 py-1.5 text-xs text-bm-text"
          >
            {bi.periods.map((period) => (
              <option key={period}>{period}</option>
            ))}
          </select>
        </div>
      </div>

      <DataLineage
        onInspect={(focusLabel) => {
          setInspectionFocus(focusLabel);
          setInspectionOpen(true);
        }}
      />

      <BiKpiStrip
        trend={slice.entity.trend}
        kpis={slice.kpis}
        context={slice.kpiContext}
        hasMeaningfulData={slice.hasMeaningfulData}
      />

      <DrillPathIndicator
        slice={slice}
        rootId={bi.root_entity_id}
        lastBiEntitySource={lastBiEntitySource}
        onSelect={selectBiEntity}
      />

      {inspectionOpen ? (
        <InspectionPanel view={inspectionView} onClose={() => setInspectionOpen(false)} />
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr_0.95fr]">
        <div className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
          <div>
            <h3 className="text-sm font-semibold">Portfolio by sector</h3>
            <p className="mt-1 text-xs text-bm-muted2">Where value concentrates in the visible slice.</p>
          </div>
          <div className={`mt-4 ${slice.sectorBreakdown.length > 0 ? "h-[260px]" : ""}`}>
            {slice.sectorBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={slice.sectorBreakdown}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.45)" tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }} />
                  <YAxis stroke="rgba(255,255,255,0.45)" tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }} tickFormatter={(value) => fmtMoney(value).replace("$", "")} />
                  <Tooltip contentStyle={{ background: "#08101A", border: "1px solid rgba(255,255,255,0.12)" }} formatter={(value: number) => fmtMoney(value)} />
                  <Bar dataKey="value" fill="#60a5fa" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <CompactPrompt
                title="Sector chart activates on selection"
                body="Select a portfolio or drill from timeline to activate sector context for the current slice."
              />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
          <div>
            <h3 className="text-sm font-semibold">NOI trend</h3>
            <p className="mt-1 text-xs text-bm-muted2">Trend stays synced as the drill path changes.</p>
          </div>
          <div className={`mt-4 ${slice.trend.length > 0 ? "h-[260px]" : ""}`}>
            {slice.trend.length > 0 ? (
              <TrendLineChart
                data={slice.trend}
                lines={[
                  { key: "noi", label: "NOI", color: "#34d399" },
                  { key: "value", label: "Value", color: "#8b5cf6" },
                ]}
                format="dollar"
                height={260}
              />
            ) : (
              <CompactPrompt
                title="Trend activates on drill"
                body="Select a portfolio or drill from timeline to activate the time series for this view."
              />
            )}
          </div>
        </div>

        <MarketMap markets={slice.marketBreakdown} />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-bm-border/35 bg-black/10">
        <div className="flex items-center justify-between gap-3 border-b border-bm-border/20 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Detail table</h3>
            <p className="mt-1 text-xs text-bm-muted2">Click a row to update the KPI row, charts, and inspection layer.</p>
          </div>
          <div className="text-xs text-bm-muted2">{slice.visibleChildren.length} visible child rows</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-bm-muted2">
              <tr>
                {["Name", "Level", "Market", "Type", "Value", "NOI", "Occupancy", "IRR"].map((label) => (
                  <th key={label} className="px-4 py-3 text-left font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.visibleChildren.length > 0 ? (
                slice.visibleChildren.map((row) => (
                  <tr
                    key={row.entity_id}
                    className="border-t border-bm-border/20 text-bm-text hover:bg-white/5"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => selectBiEntity(row.entity_id)}
                        className="text-left hover:text-sky-300"
                      >
                        {row.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 capitalize">{row.level}</td>
                    <td className="px-4 py-3">{row.market ?? "—"}</td>
                    <td className="px-4 py-3">{row.property_type ?? "—"}</td>
                    <td className="px-4 py-3">{fmtMoney(Number(row.metrics.portfolio_value ?? 0))}</td>
                    <td className="px-4 py-3">{fmtMoney(Number(row.metrics.noi ?? 0))}</td>
                    <td className="px-4 py-3">{fmtPct(Number(row.metrics.occupancy ?? 0))}</td>
                    <td className="px-4 py-3">{fmtPct(Number(row.metrics.irr ?? 0))}</td>
                  </tr>
                ))
              ) : (
                <tr className="border-t border-bm-border/20 text-bm-muted2">
                  <td colSpan={8} className="px-4 py-6 text-center text-sm">
                    No child rows match the current filters. Adjust the market, property type, or drill selection to continue exploring.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function getResumeBiMetrics(slice: ResumeBiSlice) {
  return {
    portfolio_value: fmtMoney(slice.kpis.portfolio_value),
    noi: fmtMoney(slice.kpis.noi),
    occupancy: fmtPct(slice.kpis.occupancy),
    irr: fmtPct(slice.kpis.irr),
  };
}

export function getResumeBiSelection(slice: ResumeBiSlice) {
  return slice.entity;
}
