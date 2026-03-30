"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPdsCommandCenter,
  type PdsV2CommandCenter,
  type PdsV2Horizon,
  type PdsV2Lens,
  type PdsV2PerformanceRow,
  type PdsV2RolePreset,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { toNumber } from "@/components/pds-enterprise/pdsEnterprise";
import { PdsLensToolbar } from "@/components/pds-enterprise/PdsLensToolbar";
import { PdsActiveSignalBar, type SignalKey } from "@/components/pds-enterprise/PdsActiveSignalBar";
import { PdsWarRoomKpiStrip } from "@/components/pds-enterprise/PdsWarRoomKpiStrip";
import { PdsMarketMap, type MarketMapPoint } from "@/components/pds-enterprise/PdsMarketMap";
import { PdsRankedMarketList } from "@/components/pds-enterprise/PdsRankedMarketList";
import { PdsMarketLeaderboard } from "@/components/pds-enterprise/PdsMarketLeaderboard";
import { PdsResourceHealthPanel } from "@/components/pds-enterprise/PdsResourceHealthPanel";
import { PdsForecastPanel } from "@/components/pds-enterprise/PdsForecastPanel";
import { PdsExecutiveBriefingPanel } from "@/components/pds-enterprise/PdsExecutiveBriefingPanel";
import { lookupMarketGeo } from "@/components/pds-enterprise/pdsMarketGeoLookup";

function applySignalFilter(
  rows: PdsV2PerformanceRow[],
  signal: SignalKey,
  cc: PdsV2CommandCenter,
): PdsV2PerformanceRow[] {
  switch (signal) {
    case "below_plan":
      return rows.filter(
        (r) => toNumber(r.fee_actual) < toNumber(r.fee_plan) && toNumber(r.fee_plan) > 0,
      );
    case "staffing_pressure": {
      const pressuredNames = new Set(
        (cc.resource_health ?? [])
          .filter((r) => r.overload_flag || r.staffing_gap_flag)
          .map((r) => r.market_name?.toLowerCase()),
      );
      if (pressuredNames.size === 0) return rows;
      return rows.filter((r) => pressuredNames.has(r.entity_label.toLowerCase()));
    }
    case "red_projects":
      return rows.filter((r) => (r.red_projects || 0) > 0);
    case "backlog":
      return rows.filter((r) => {
        const backlog = toNumber(r.backlog);
        const forecast = toNumber(r.forecast);
        return forecast > 0 && backlog / forecast < 0.5;
      });
    case "delinquent_tc":
      return rows;
    default:
      return rows;
  }
}

export function PdsWarRoomPage() {
  const { envId, businessId } = useDomainEnv();
  const [lens, setLens] = useState<PdsV2Lens>("market");
  const [horizon, setHorizon] = useState<PdsV2Horizon>("YTD");
  const [rolePreset, setRolePreset] = useState<PdsV2RolePreset>("executive");
  const [commandCenter, setCommandCenter] = useState<PdsV2CommandCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [activeSignal, setActiveSignal] = useState<SignalKey | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [tableExpanded, setTableExpanded] = useState(false);

  // Data fetch
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getPdsCommandCenter(envId, {
          business_id: businessId || undefined,
          lens,
          horizon,
          role_preset: rolePreset,
        });
        if (!cancelled) setCommandCenter(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load command center");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [businessId, envId, horizon, lens, rolePreset]);

  // Filtered rows
  const allRows = commandCenter?.performance_table?.rows ?? [];

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (activeSignal && commandCenter) {
      rows = applySignalFilter(rows, activeSignal, commandCenter);
    }
    if (selectedMarketId) {
      rows = rows.filter((r) => r.entity_id === selectedMarketId);
    }
    return rows;
  }, [allRows, activeSignal, selectedMarketId, commandCenter]);

  // Map points (always from all rows — selection is visual only)
  const mapPoints: MarketMapPoint[] = useMemo(() => {
    return allRows.map((row) => {
      const geo = lookupMarketGeo(row.entity_label);
      const feeActual = toNumber(row.fee_actual);
      const feePlan = toNumber(row.fee_plan);
      const vPct = feePlan > 0 ? (feeActual - feePlan) / Math.abs(feePlan) : 0;
      let rScore = 0;
      if (vPct < -0.1) rScore += 30;
      else if (vPct < -0.03) rScore += 15;
      rScore += (row.red_projects || 0) * 10;
      return {
        market_id: row.entity_id,
        name: row.entity_label,
        lat: geo.lat,
        lng: geo.lng,
        fee_actual: feeActual,
        fee_plan: feePlan,
        variance_pct: vPct,
        backlog: row.backlog || 0,
        forecast: row.forecast || 0,
        staffing_pressure_count: 0,
        delinquent_timecards: 0,
        red_projects: row.red_projects || 0,
        closeout_risk_count: 0,
        client_risk_accounts: row.client_risk_accounts || 0,
        risk_score: Math.min(rScore, 100),
        health_status: row.health_status,
        top_accounts: [],
      };
    });
  }, [allRows]);

  const hasAnyFilter = activeSignal !== null || selectedMarketId !== null;

  const handleSignalToggle = useCallback((key: SignalKey) => {
    setActiveSignal((prev) => (prev === key ? null : key));
  }, []);

  const handleMarketClick = useCallback((marketId: string) => {
    setSelectedMarketId((prev) => (prev === marketId ? null : marketId));
  }, []);

  const handleClearFilters = useCallback(() => {
    setActiveSignal(null);
    setSelectedMarketId(null);
  }, []);

  if (loading && !commandCenter) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-slate-700/20 bg-slate-800/20 py-12 text-sm text-slate-400">
        Loading command center...
      </div>
    );
  }

  if (error && !commandCenter) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-4 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (!commandCenter) return null;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <header className="flex flex-col gap-1 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-semibold text-bm-text">Markets</h2>
            <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
              Command Center
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Revenue, staffing, backlog, and forecast risk across all markets.
          </p>
        </div>
        <PdsLensToolbar
          lens={lens}
          horizon={horizon}
          rolePreset={rolePreset}
          generatedAt={commandCenter.generated_at}
          onLensChange={setLens}
          onHorizonChange={setHorizon}
          onRolePresetChange={setRolePreset}
        />
      </header>

      {/* ── Row 1: Issue Signals ── */}
      <PdsActiveSignalBar
        commandCenter={commandCenter}
        activeSignal={activeSignal}
        onSignalToggle={handleSignalToggle}
        onClearFilters={handleClearFilters}
        hasAnyFilter={hasAnyFilter}
      />

      {/* ── Row 2: KPI Strip ── */}
      <PdsWarRoomKpiStrip metrics={commandCenter.metrics_strip ?? []} />

      {/* ── Row 3: Map + Ranked List (spatial anchor) ── */}
      <section className="grid gap-3 lg:grid-cols-[1fr,300px]">
        <div className="h-[440px]">
          <PdsMarketMap
            points={mapPoints}
            selectedMarketId={selectedMarketId}
            colorMode="revenue_variance"
            onMarketClick={handleMarketClick}
          />
        </div>
        <PdsRankedMarketList
          rows={allRows}
          selectedMarketId={selectedMarketId}
          onMarketClick={handleMarketClick}
        />
      </section>

      {/* ── Row 4: Action Required ── */}
      <PdsResourceHealthPanel
        resources={commandCenter.resource_health ?? []}
        timecards={commandCenter.timecard_health ?? []}
      />

      {/* ── Row 5: Market Table (collapsed by default) ── */}
      <section className="rounded-lg border border-slate-700/20">
        <button
          type="button"
          onClick={() => setTableExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-slate-700/10"
        >
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Market Analysis</p>
            <h3 className="text-sm font-semibold text-bm-text">Operating Performance by Market</h3>
          </div>
          <div className="flex items-center gap-2">
            {hasAnyFilter && (
              <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                {filteredRows.length} of {allRows.length}
              </span>
            )}
            <span className="text-xs text-slate-500">{tableExpanded ? "Collapse" : "Expand"}</span>
            <span className={`text-slate-500 text-xs transition-transform ${tableExpanded ? "rotate-180" : ""}`}>
              {"\u25BC"}
            </span>
          </div>
        </button>
        {tableExpanded && (
          <div className="border-t border-slate-700/20 p-3">
            <PdsMarketLeaderboard
              rows={filteredRows}
              selectedMarketId={selectedMarketId}
              onRowClick={handleMarketClick}
            />
          </div>
        )}
      </section>

      {/* ── Row 6: Forecast ── */}
      {(commandCenter.forecast_points ?? []).length > 0 && (
        <PdsForecastPanel points={commandCenter.forecast_points ?? []} />
      )}

      {/* ── Row 7: Exec Briefing ── */}
      {commandCenter.briefing && (
        <PdsExecutiveBriefingPanel briefing={commandCenter.briefing} />
      )}

      {error && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-sm text-amber-400">
          {error}
        </div>
      )}
    </div>
  );
}
