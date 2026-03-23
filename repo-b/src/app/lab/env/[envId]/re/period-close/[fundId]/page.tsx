"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";

function fmtMoney(v: string | number | null | undefined): string {
  if (v == null) return "\u2014";
  const n = Number(v);
  if (Number.isNaN(n)) return "\u2014";
  if (n === 0) return "$0";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(v: string | number | null | undefined): string {
  if (v == null) return "\u2014";
  const n = Number(v);
  if (Number.isNaN(n)) return "\u2014";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtMultiple(v: string | number | null | undefined): string {
  if (v == null) return "\u2014";
  const n = Number(v);
  if (Number.isNaN(n)) return "\u2014";
  return `${n.toFixed(2)}x`;
}

function fmtTimestamp(ts: string | null): string {
  if (!ts) return "\u2014";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-400",
    running: "bg-blue-500/10 text-blue-400",
    completed: "bg-green-500/10 text-green-400",
    failed: "bg-red-500/10 text-red-400",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${colors[status] || "bg-bm-surface/40 text-bm-muted2"}`}>
      {status}
    </span>
  );
}

interface Fund {
  fund_id: string;
  name: string;
  strategy: string | null;
  vintage_year: number | null;
}

interface CloseRun {
  run_id: string;
  fund_id: string;
  quarter: string;
  status: string;
  triggered_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

interface QuarterState {
  id: string;
  fund_id: string;
  quarter: string;
  portfolio_nav: string;
  total_committed: string;
  total_called: string;
  total_distributed: string;
  dpi: string;
  rvpi: string;
  tvpi: string;
  gross_irr: string;
  net_irr: string;
  weighted_ltv: string;
  weighted_dscr: string;
}

interface AssetState {
  id: string;
  asset_id: string;
  asset_name: string | null;
  quarter: string;
  noi: string;
  revenue: string;
  opex: string;
  capex: string;
  debt_service: string;
  occupancy: string;
  debt_balance: string;
  cash_balance: string;
  asset_value: string;
  nav: string;
  valuation_method: string | null;
}

export default function FundPeriodCloseDetailPage() {
  const params = useParams();
  const fundId = params.fundId as string;
  const { environmentId } = useRepeContext();
  const basePath = useRepeBasePath();

  const [fund, setFund] = useState<Fund | null>(null);
  const [runs, setRuns] = useState<CloseRun[]>([]);
  const [quarterStates, setQuarterStates] = useState<QuarterState[]>([]);
  const [assetStates, setAssetStates] = useState<AssetState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshDetail = useCallback(async () => {
    if (!fundId) return;
    setLoading(true);
    try {
      const url = new URL(`/api/re/v2/period-close/${fundId}`, window.location.origin);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load fund close detail");
      const data = await res.json();
      setFund(data.fund || null);
      setRuns(data.runs || []);
      setQuarterStates(data.quarter_states || []);
      setAssetStates(data.asset_states || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fund close detail");
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    void refreshDetail();
  }, [refreshDetail]);

  const latestState = quarterStates.length > 0 ? quarterStates[0] : null;

  useEffect(() => {
    if (!fund) return;
    publishAssistantPageContext({
      route: environmentId
        ? `/lab/env/${environmentId}/re/period-close/${fundId}`
        : `${basePath}/period-close/${fundId}`,
      surface: "period_close_detail",
      active_module: "re",
      page_entity_type: "fund",
      page_entity_id: fundId,
      page_entity_name: fund.name,
      selected_entities: [],
      visible_data: {
        fund: { name: fund.name, strategy: fund.strategy },
        latest_state: latestState
          ? {
              quarter: latestState.quarter,
              portfolio_nav: latestState.portfolio_nav,
              tvpi: latestState.tvpi,
              net_irr: latestState.net_irr,
            }
          : null,
        close_runs: runs.length,
        asset_states: assetStates.length,
        notes: [`Fund period close detail`],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, fundId, fund, latestState, runs, assetStates]);

  if (loading) return <StateCard state="loading" />;
  if (error || !fund) {
    return <StateCard state="error" title="Fund not found" message={error || "No data"} />;
  }

  const kpis: KpiDef[] = [
    { label: "Current Quarter", value: latestState?.quarter || "\u2014" },
    { label: "Portfolio NAV", value: fmtMoney(latestState?.portfolio_nav) },
    { label: "TVPI", value: fmtMultiple(latestState?.tvpi) },
    { label: "Net IRR", value: fmtPct(latestState?.net_irr) },
  ];

  return (
    <section className="flex flex-col gap-6" data-testid="re-period-close-detail">
      {/* Header */}
      <div>
        <Link
          href={`${basePath}/period-close`}
          className="mb-2 inline-flex items-center gap-1 text-xs text-bm-muted2 hover:text-bm-text"
        >
          <ArrowLeft className="h-3 w-3" /> All Period Closes
        </Link>
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl font-semibold text-bm-text">{fund.name}</h2>
          {fund.strategy && (
            <span className="rounded-full bg-bm-surface/40 px-2 py-0.5 text-xs text-bm-muted2">
              {fund.strategy}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-bm-muted2">Period close history and quarter state detail.</p>
      </div>

      <KpiStrip kpis={kpis} />

      {/* Close History Table */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-bm-text">Close History</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-bm-muted2">No close runs recorded for this fund.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-bm-border/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                  <th className="px-4 py-2.5 font-medium">Quarter</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Triggered By</th>
                  <th className="px-4 py-2.5 font-medium">Started</th>
                  <th className="px-4 py-2.5 font-medium">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/10">
                {runs.map((run) => (
                  <tr key={run.run_id} className="transition-colors duration-75 hover:bg-bm-surface/20">
                    <td className="px-4 py-3 tabular-nums">{run.quarter}</td>
                    <td className="px-4 py-3">{statusBadge(run.status)}</td>
                    <td className="px-4 py-3 text-bm-muted2">{run.triggered_by || "\u2014"}</td>
                    <td className="px-4 py-3 tabular-nums text-bm-muted2">{fmtTimestamp(run.started_at)}</td>
                    <td className="px-4 py-3 tabular-nums text-bm-muted2">{fmtTimestamp(run.completed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Current Quarter State */}
      {latestState && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-bm-text">
            Quarter State ({latestState.quarter})
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "Portfolio NAV", value: fmtMoney(latestState.portfolio_nav) },
              { label: "Total Committed", value: fmtMoney(latestState.total_committed) },
              { label: "Total Called", value: fmtMoney(latestState.total_called) },
              { label: "Total Distributed", value: fmtMoney(latestState.total_distributed) },
              { label: "DPI", value: fmtMultiple(latestState.dpi) },
              { label: "RVPI", value: fmtMultiple(latestState.rvpi) },
              { label: "TVPI", value: fmtMultiple(latestState.tvpi) },
              { label: "Gross IRR", value: fmtPct(latestState.gross_irr) },
              { label: "Net IRR", value: fmtPct(latestState.net_irr) },
              { label: "Wtd LTV", value: fmtPct(latestState.weighted_ltv) },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-bm-border/20 bg-bm-surface/20 px-4 py-3"
              >
                <div className="text-xs uppercase tracking-wider text-bm-muted2">{item.label}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-bm-text">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Asset Quarter States */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-bm-text">Asset States</h3>
        {assetStates.length === 0 ? (
          <p className="text-sm text-bm-muted2">No asset-level quarter data available.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-bm-border/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                  <th className="px-4 py-2.5 font-medium">Asset</th>
                  <th className="px-4 py-2.5 font-medium text-right">NOI</th>
                  <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                  <th className="px-4 py-2.5 font-medium text-right">OpEx</th>
                  <th className="px-4 py-2.5 font-medium text-right">Occupancy</th>
                  <th className="px-4 py-2.5 font-medium text-right">NAV</th>
                  <th className="px-4 py-2.5 font-medium">Valuation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/10">
                {assetStates.map((as) => (
                  <tr key={as.id} className="transition-colors duration-75 hover:bg-bm-surface/20">
                    <td className="px-4 py-3 font-medium text-bm-text">{as.asset_name || as.asset_id}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(as.noi)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(as.revenue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(as.opex)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtPct(as.occupancy)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(as.nav)}</td>
                    <td className="px-4 py-3 text-bm-muted2">{as.valuation_method || "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
