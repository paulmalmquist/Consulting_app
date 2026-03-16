"use client";

import { useState, useCallback } from "react";
import { Play, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { runScenario, getModelRun } from "@/lib/bos-api";
import type { ModelRunDetail } from "@/lib/bos-api";

interface ScenarioResultsPanelProps {
  scenarioId: string;
  assetCount: number;
}

function formatCurrency(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

export function ScenarioResultsPanel({
  scenarioId,
  assetCount,
}: ScenarioResultsPanelProps) {
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<ModelRunDetail | null>(null);
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
      const result = await runScenario(scenarioId);
      // Fetch the full run detail
      const detail = await getModelRun(result.run_id);
      setRun(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scenario run failed");
    } finally {
      setRunning(false);
    }
  }, [scenarioId, assetCount]);

  const summary = run?.summary_json as Record<string, unknown> | undefined;
  const outputs = run?.outputs_json as { assets?: Array<Record<string, unknown>> } | undefined;

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

      {!run && !running && !error && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-8 text-center">
          <p className="text-sm text-bm-muted2">
            Click &ldquo;Run Scenario&rdquo; to calculate cash flows and generate results.
          </p>
          {assetCount === 0 && (
            <p className="mt-1 text-xs text-amber-400">
              Add assets in the Scenario Builder tab first.
            </p>
          )}
        </div>
      )}

      {run && run.status === "success" && summary && (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {[
              { label: "Total NOI (Cash)", value: formatCurrency(Number(summary.total_noi_cash || 0)) },
              { label: "Total NOI (GAAP)", value: formatCurrency(Number(summary.total_noi_gaap || 0)) },
              { label: "Total Revenue", value: formatCurrency(Number(summary.total_revenue || 0)) },
              { label: "Total Expense", value: formatCurrency(Number(summary.total_expense || 0)) },
              { label: "Assets", value: String(summary.asset_count || 0) },
              { label: "Periods", value: String(summary.period_count || 0) },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-3"
              >
                <p className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
                  {kpi.label}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-bm-text">
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          {/* By-Fund Breakdown */}
          {summary.by_fund && typeof summary.by_fund === "object" && (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <h4 className="mb-2 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                By Fund
              </h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/30 text-left text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                    <th className="px-3 py-2 font-medium">Fund</th>
                    <th className="px-3 py-2 font-medium text-right">NOI (Cash)</th>
                    <th className="px-3 py-2 font-medium text-right">NOI (GAAP)</th>
                    <th className="px-3 py-2 font-medium text-right">Assets</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.by_fund as Record<string, Record<string, unknown>>).map(
                    ([fundId, fund]) => (
                      <tr
                        key={fundId}
                        className="border-b border-bm-border/20"
                      >
                        <td className="px-3 py-2.5 text-bm-text">
                          {String(fund.fund_name || fundId)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-bm-muted2">
                          {formatCurrency(Number(fund.noi_cash || 0))}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-bm-muted2">
                          {formatCurrency(Number(fund.noi_gaap || 0))}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-bm-muted2">
                          {String(fund.asset_count || 0)}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Per-Asset Details */}
          {outputs?.assets && outputs.assets.length > 0 && (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <h4 className="mb-2 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                Per-Asset Cash Flows
              </h4>
              <div className="space-y-1">
                {outputs.assets.map((asset) => {
                  const assetId = String(asset.asset_id);
                  const isExpanded = expandedAsset === assetId;
                  const periods = (asset.periods || []) as Array<Record<string, unknown>>;

                  return (
                    <div
                      key={assetId}
                      className="rounded-lg border border-bm-border/30"
                    >
                      <button
                        onClick={() =>
                          setExpandedAsset(isExpanded ? null : assetId)
                        }
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-bm-surface/20"
                      >
                        {isExpanded ? (
                          <ChevronDown size={13} />
                        ) : (
                          <ChevronRight size={13} />
                        )}
                        <span className="flex-1 font-medium text-bm-text">
                          {String(asset.asset_name || assetId.slice(0, 8))}
                        </span>
                        <span className="text-xs text-bm-muted2">
                          {String(asset.fund_name || "")}
                        </span>
                        <span className="text-xs tabular-nums text-bm-muted2">
                          {periods.length} periods
                        </span>
                      </button>

                      {isExpanded && periods.length > 0 && (
                        <div className="border-t border-bm-border/20 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-bm-border/20 text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
                                <th className="px-3 py-1.5 text-left font-medium">Period</th>
                                <th className="px-3 py-1.5 text-right font-medium">Revenue</th>
                                <th className="px-3 py-1.5 text-right font-medium">Expense</th>
                                <th className="px-3 py-1.5 text-right font-medium">NOI Cash</th>
                                <th className="px-3 py-1.5 text-right font-medium">NOI GAAP</th>
                                <th className="px-3 py-1.5 text-right font-medium">Capex</th>
                              </tr>
                            </thead>
                            <tbody>
                              {periods.map((p, i) => (
                                <tr
                                  key={i}
                                  className="border-b border-bm-border/10"
                                >
                                  <td className="px-3 py-1.5 text-bm-text font-mono">
                                    {String(p.period_date || "")}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-bm-muted2">
                                    {formatCurrency(Number(p.revenue || 0))}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-bm-muted2">
                                    {formatCurrency(Number(p.expense || 0))}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-bm-text font-medium">
                                    {formatCurrency(Number(p.noi_cash || 0))}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-bm-muted2">
                                    {formatCurrency(Number(p.noi_gaap || 0))}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-bm-muted2">
                                    {formatCurrency(Number(p.capex || 0))}
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

      {run && run.status === "failed" && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          Scenario run failed. Check that all assets have base schedule data and try again.
        </div>
      )}
    </div>
  );
}
