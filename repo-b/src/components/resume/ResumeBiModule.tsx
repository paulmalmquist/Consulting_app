"use client";

import { useMemo } from "react";
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
import { fmtMoney, fmtPct } from "@/lib/format-utils";
import type { ResumeBi, ResumeBiEntity, ResumeBiPoint } from "@/lib/bos-api";
import TrendLineChart from "@/components/charts/TrendLineChart";
import ResumeFallbackCard from "./ResumeFallbackCard";
import { deriveResumeBiSlice, type ResumeBiSlice } from "./biMath";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";

function PanelFallback({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-[260px] flex-col justify-center rounded-2xl border border-bm-border/35 bg-black/10 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-bm-muted2">{body}</p>
    </div>
  );
}

function MarketMap({ markets }: { markets: ResumeBiSlice["marketBreakdown"] }) {
  if (markets.length === 0) {
    return (
      <PanelFallback
        title="Market footprint unavailable"
        body="No market coordinates are available for the current BI slice, so the geographic footprint is temporarily hidden."
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
}: {
  trend: ResumeBiPoint[];
  kpis: { portfolio_value: number; noi: number; occupancy: number; irr: number };
}) {
  const prevPeriod = trend.length >= 2 ? trend[trend.length - 2] : null;
  const deltas = prevPeriod
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
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((kpi) => (
        <div key={kpi.label} className="rounded-2xl border border-bm-border/35 bg-black/10 px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{kpi.label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-xl font-semibold">{kpi.value}</p>
            {kpi.delta && kpi.delta.direction !== "flat" ? (
              <span className={`text-xs ${kpi.delta.direction === "up" ? "text-emerald-400" : "text-red-400"}`}>
                {kpi.delta.direction === "up" ? "+" : ""}{fmtPct(kpi.delta.delta)}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReverseLinks({ entity }: { entity: ResumeBiEntity }) {
  const { selectNarrativeItem } = useResumeWorkspaceStore(
    useShallow((state) => ({
      selectNarrativeItem: state.selectNarrativeItem,
    })),
  );

  return (
    <div className="mt-4 rounded-2xl border border-bm-border/25 bg-white/4 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Connected to</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {entity.linked_timeline_ids.map((timelineId) => (
          <button
            key={timelineId}
            type="button"
            onClick={() => selectNarrativeItem("initiative", timelineId, { switchModule: "timeline" })}
            className="rounded-full border border-sky-400/30 bg-sky-400/8 px-2.5 py-1 text-[11px] text-sky-300 transition hover:bg-sky-400/16"
          >
            {timelineId.replace(/^(initiative-|milestone-)/, "").replaceAll("-", " ")}
          </button>
        ))}
        {entity.linked_architecture_node_ids.map((nodeId) => (
          <button
            key={nodeId}
            type="button"
            onClick={() => {
              useResumeWorkspaceStore.getState().selectArchitectureNode(nodeId);
              useResumeWorkspaceStore.getState().setActiveModule("architecture");
            }}
            className="rounded-full border border-violet-400/30 bg-violet-400/8 px-2.5 py-1 text-[11px] text-violet-300 transition hover:bg-violet-400/16"
          >
            {nodeId.replaceAll("_", " ")}
          </button>
        ))}
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

  const slice = useMemo(
    () =>
      deriveResumeBiSlice(bi, selectedBiEntityId || bi.root_entity_id, {
        market: biFilters.market,
        propertyType: biFilters.propertyType,
        period: biFilters.period,
      }),
    [bi, selectedBiEntityId, biFilters.market, biFilters.propertyType, biFilters.period],
  );
  const hasAssetData = bi.entities.some((entity) => entity.level === "asset");

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

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-bm-muted2">
        {slice.breadcrumb.map((crumb, index) => (
          <button
            key={crumb.entity_id}
            type="button"
            onClick={() => selectBiEntity(crumb.entity_id)}
            className={`rounded-full border px-3 py-1 transition ${
              index === slice.breadcrumb.length - 1
                ? "border-white/35 bg-white/12 text-white"
                : "border-bm-border/35 bg-white/5 hover:border-white/25 hover:text-bm-text"
            }`}
          >
            {crumb.name}
          </button>
        ))}
        {lastBiEntitySource === "timeline" && selectedBiEntityId !== bi.root_entity_id ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/25 bg-sky-400/8 px-2.5 py-1 text-[11px] text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            from timeline
          </span>
        ) : null}
      </div>

      <BiKpiStrip trend={slice.entity.trend} kpis={slice.kpis} />

      {selectedBiEntityId !== bi.root_entity_id && slice.entity.linked_timeline_ids.length > 0 ? (
        <ReverseLinks entity={slice.entity} />
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr_0.95fr]">
        <div className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
          <div>
            <h3 className="text-sm font-semibold">Portfolio by sector</h3>
            <p className="mt-1 text-xs text-bm-muted2">Where value concentrates in the visible slice.</p>
          </div>
          <div className="mt-4 h-[260px]">
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
              <PanelFallback
                title="Sector breakdown unavailable"
                body="No sector mix is available for the current drill path, so this chart is temporarily hidden."
              />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
          <div>
            <h3 className="text-sm font-semibold">NOI trend</h3>
            <p className="mt-1 text-xs text-bm-muted2">Trend stays synced as the drill path changes.</p>
          </div>
          <div className="mt-4 h-[260px]">
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
              <PanelFallback
                title="Trend unavailable"
                body="The selected BI slice does not include a usable time series, so the trend chart is temporarily hidden."
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
            <p className="mt-1 text-xs text-bm-muted2">Click deeper when child records exist.</p>
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
