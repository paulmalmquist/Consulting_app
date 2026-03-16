"use client";

import { useState, useCallback } from "react";
import { Play, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import {
  runScenarioV2,
  getRunAssetCashflows,
  getRunReturnMetrics,
} from "@/lib/bos-api";
import type { AssetCashflow, ReturnMetricsRow } from "@/lib/bos-api";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ScenarioResultsPanelProps {
  scenarioId: string;
  assetCount: number;
}

function formatCurrency(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

function formatPct(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${(val * 100).toFixed(2)}%`;
}

function formatMultiple(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${val.toFixed(2)}x`;
}

function formatQuarter(dateStr: string): string {
  const d = new Date(dateStr);
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q} ${d.getFullYear().toString().slice(2)}`;
}

interface RunResult {
  run_id: string;
  summary: Record<string, unknown>;
  cashflows: AssetCashflow[];
  metrics: ReturnMetricsRow[];
}

export function ScenarioResultsPanel({
  scenarioId,
  assetCount,
}: ScenarioResultsPanelProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    if (assetCount === 0) {
      setError("Add at least one asset to the scenario before running.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const runResult = await runScenarioV2(scenarioId);
      const [cashflows, metrics] = await Promise.all([
        getRunAssetCashflows(runResult.run_id),
        getRunReturnMetrics(runResult.run_id),
      ]);
      setResult({
        run_id: runResult.run_id,
        summary: runResult.summary || {},
        cashflows,
        metrics,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scenario run failed");
    } finally {
      setRunning(false);
    }
  }, [scenarioId, assetCount]);

  // Group cashflows by asset
  const assetGroups = result
    ? groupBy(result.cashflows, (cf) => cf.asset_id)
    : {};

  // Get fund and asset metrics
  const fundMetrics = result?.metrics.filter((m) => m.scope_type === "fund") ?? [];
  const assetMetrics = result?.metrics.filter((m) => m.scope_type === "asset") ?? [];

  // Aggregate chart data
  const periodTotals = result
    ? aggregatePeriods(result.cashflows)
    : [];

  const summary = result?.summary;
  const assetMetricsList = (summary?.asset_metrics ?? []) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
          Scenario Results
        </h3>
        <button
          onClick={handleRun}
          disabled={running || assetCount === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40"
        >
          {running ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          {running ? "Running..." : "Run Scenario"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {!result && !running && !error && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-8 text-center">
          <p className="text-sm text-bm-muted2">
            Click &ldquo;Run Scenario&rdquo; to execute the deterministic modeling pipeline.
          </p>
          {assetCount === 0 && (
            <p className="mt-1 text-xs text-amber-400">
              Add assets in the Scenario Builder tab first.
            </p>
          )}
        </div>
      )}

      {result && (
        <>
          {/* Return Metrics KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { label: "Total NOI", value: formatCurrency(Number(summary?.total_noi ?? 0)) },
              { label: "Total Revenue", value: formatCurrency(Number(summary?.total_revenue ?? 0)) },
              { label: "Equity CF", value: formatCurrency(Number(summary?.total_equity_cf ?? 0)) },
              { label: "Assets", value: String(summary?.asset_count ?? 0) },
              ...(fundMetrics.length > 0
                ? [
                    { label: "Gross IRR", value: formatPct(fundMetrics[0].gross_irr), highlight: true },
                    { label: "MOIC", value: formatMultiple(fundMetrics[0].gross_moic), highlight: true },
                    { label: "TVPI", value: formatMultiple(fundMetrics[0].tvpi), highlight: true },
                  ]
                : []),
            ].map((kpi) => (
              <div
                key={kpi.label}
                className={`rounded-lg border p-3 ${
                  "highlight" in kpi && kpi.highlight
                    ? "border-bm-accent/30 bg-bm-accent/5"
                    : "border-bm-border/50 bg-bm-surface/10"
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
                  {kpi.label}
                </p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${
                  "highlight" in kpi && kpi.highlight ? "text-bm-accent" : "text-bm-text"
                }`}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          {/* Fund-Level Metrics Detail */}
          {fundMetrics.length > 0 && (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <h4 className="mb-2 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                Fund Return Metrics
              </h4>
              <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm sm:grid-cols-6">
                {fundMetrics.map((fm) => (
                  <div key={fm.scope_id} className="contents">
                    <MetricCell label="Gross IRR" value={formatPct(fm.gross_irr)} />
                    <MetricCell label="Net IRR" value={formatPct(fm.net_irr)} />
                    <MetricCell label="Gross MOIC" value={formatMultiple(fm.gross_moic)} />
                    <MetricCell label="DPI" value={formatMultiple(fm.dpi)} />
                    <MetricCell label="RVPI" value={formatMultiple(fm.rvpi)} />
                    <MetricCell label="TVPI" value={formatMultiple(fm.tvpi)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NOI + Equity CF Charts */}
          {periodTotals.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                <h4 className="mb-2 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                  NOI Projection
                </h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={periodTotals} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#888" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => formatCurrency(v)} width={55} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Line type="monotone" dataKey="noi" stroke="#10b981" strokeWidth={2} dot={false} name="NOI" />
                    <Line type="monotone" dataKey="revenue" stroke="#60a5fa" strokeWidth={1} dot={false} name="Revenue" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                <h4 className="mb-2 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                  Equity Cashflow
                </h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={periodTotals} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#888" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => formatCurrency(v)} width={55} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Bar dataKey="equity_cf" fill="#8b5cf6" name="Equity CF" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Per-Asset Summary Table */}
          {assetMetricsList.length > 0 && (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <h4 className="mb-2 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                Asset-Level Results
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bm-border/30 text-left text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
                      <th className="px-3 py-2 font-medium">Asset</th>
                      <th className="px-3 py-2 text-right font-medium">Total NOI</th>
                      <th className="px-3 py-2 text-right font-medium">Gross IRR</th>
                      <th className="px-3 py-2 text-right font-medium">MOIC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assetMetricsList.map((am) => {
                      const amRow = assetMetrics.find((m) => m.scope_id === String(am.asset_id));
                      return (
                        <tr key={String(am.asset_id)} className="border-b border-bm-border/20">
                          <td className="px-3 py-2.5 text-bm-text">{String(am.asset_name || "")}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-bm-muted2">
                            {formatCurrency(Number(am.total_noi || 0))}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-bm-accent">
                            {formatPct(amRow?.gross_irr)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-bm-muted2">
                            {formatMultiple(amRow?.gross_moic)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Expandable Per-Asset Cash Flows */}
          {Object.keys(assetGroups).length > 0 && (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <h4 className="mb-2 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                Detailed Cash Flows
              </h4>
              <div className="space-y-1">
                {Object.entries(assetGroups).map(([assetId, cfs]) => {
                  const isExpanded = expandedAsset === assetId;
                  const am = assetMetricsList.find((a) => String(a.asset_id) === assetId);
                  return (
                    <div key={assetId} className="rounded-lg border border-bm-border/30">
                      <button
                        onClick={() => setExpandedAsset(isExpanded ? null : assetId)}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-bm-surface/20"
                      >
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span className="flex-1 font-medium text-bm-text">
                          {String(am?.asset_name || assetId.slice(0, 8))}
                        </span>
                        <span className="text-xs tabular-nums text-bm-muted2">
                          {cfs.length} periods
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-bm-border/20 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-bm-border/20 text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
                                <th className="px-3 py-1.5 text-left font-medium">Period</th>
                                <th className="px-3 py-1.5 text-right font-medium">Revenue</th>
                                <th className="px-3 py-1.5 text-right font-medium">Expense</th>
                                <th className="px-3 py-1.5 text-right font-medium">NOI</th>
                                <th className="px-3 py-1.5 text-right font-medium">Capex</th>
                                <th className="px-3 py-1.5 text-right font-medium">Debt Svc</th>
                                <th className="px-3 py-1.5 text-right font-medium">Equity CF</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cfs.map((cf, i) => (
                                <tr key={i} className="border-b border-bm-border/10">
                                  <td className="px-3 py-1.5 text-bm-text font-mono">
                                    {formatQuarter(cf.period_date)}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-bm-muted2">
                                    {formatCurrency(cf.revenue)}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-bm-muted2">
                                    {formatCurrency(cf.expenses)}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-bm-text font-medium">
                                    {formatCurrency(cf.noi)}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-bm-muted2">
                                    {formatCurrency(cf.capex)}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-bm-muted2">
                                    {formatCurrency(cf.debt_service)}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-bm-accent">
                                    {formatCurrency(cf.equity_cash_flow)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-bm-muted2">{label}</p>
      <p className="font-mono tabular-nums text-bm-text">{value}</p>
    </div>
  );
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

function aggregatePeriods(cashflows: AssetCashflow[]): Array<{
  period: string;
  revenue: number;
  noi: number;
  equity_cf: number;
}> {
  const byPeriod: Record<string, { revenue: number; noi: number; equity_cf: number }> = {};
  for (const cf of cashflows) {
    const p = formatQuarter(cf.period_date);
    if (!byPeriod[p]) byPeriod[p] = { revenue: 0, noi: 0, equity_cf: 0 };
    byPeriod[p].revenue += cf.revenue;
    byPeriod[p].noi += cf.noi;
    byPeriod[p].equity_cf += cf.equity_cash_flow;
  }
  return Object.entries(byPeriod).map(([period, data]) => ({
    period,
    revenue: Math.round(data.revenue),
    noi: Math.round(data.noi),
    equity_cf: Math.round(data.equity_cf),
  }));
}
