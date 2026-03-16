"use client";

import { useState, useCallback } from "react";
import { GitCompare, Loader2 } from "lucide-react";
import { compareScenariosV2 } from "@/lib/bos-api";
import type { ModelScenario } from "@/lib/bos-api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface ScenarioComparePanelProps {
  modelId: string;
  scenarios: ModelScenario[];
}

interface MetricDelta {
  base: number;
  compare: number;
  delta: number;
}

interface AssetAttribution {
  asset_id: string;
  base_noi: number;
  compare_noi: number;
  noi_delta: number;
  base_equity_cf: number;
  compare_equity_cf: number;
  equity_cf_delta: number;
}

interface ComparisonV2 {
  base_scenario: string;
  compare_scenario: string;
  metric_deltas: Record<string, MetricDelta>;
  asset_attribution: AssetAttribution[];
}

interface ComparisonV2Result {
  scenarios: Array<{
    scenario_id: string;
    scenario_name: string;
    run_id: string;
    metrics: Array<Record<string, unknown>>;
    asset_summary: Array<Record<string, unknown>>;
  }>;
  comparison: ComparisonV2[] | null;
}

const METRIC_LABELS: Record<string, { label: string; format: "pct" | "multiple" | "currency" }> = {
  gross_irr: { label: "Gross IRR", format: "pct" },
  net_irr: { label: "Net IRR", format: "pct" },
  gross_moic: { label: "Gross MOIC", format: "multiple" },
  net_moic: { label: "Net MOIC", format: "multiple" },
  dpi: { label: "DPI", format: "multiple" },
  rvpi: { label: "RVPI", format: "multiple" },
  tvpi: { label: "TVPI", format: "multiple" },
  ending_nav: { label: "NAV", format: "currency" },
};

function formatCurrency(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

function formatPct(val: number): string {
  return `${(val * 100).toFixed(2)}%`;
}

function formatMultiple(val: number): string {
  return `${val.toFixed(2)}x`;
}

function formatMetric(val: number, format: "pct" | "multiple" | "currency"): string {
  if (format === "pct") return formatPct(val);
  if (format === "multiple") return formatMultiple(val);
  return formatCurrency(val);
}

function formatDelta(val: number, format: "pct" | "multiple" | "currency"): string {
  const sign = val >= 0 ? "+" : "";
  if (format === "pct") return `${sign}${(val * 100).toFixed(2)}%`;
  if (format === "multiple") return `${sign}${val.toFixed(4)}x`;
  return `${sign}${formatCurrency(val)}`;
}

export function ScenarioComparePanel({
  modelId,
  scenarios,
}: ScenarioComparePanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ComparisonV2Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleScenario = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCompare = useCallback(async () => {
    if (selected.size < 2) {
      setError("Select at least two scenarios to compare.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await compareScenariosV2(modelId, Array.from(selected));
      setResult(res as unknown as ComparisonV2Result);

      if (!res || ((res as unknown as ComparisonV2Result).scenarios?.length || 0) < 2) {
        setError("Not enough completed runs to compare. Run both scenarios first.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setLoading(false);
    }
  }, [modelId, selected]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
          Scenario Comparison
        </h3>
        <button
          onClick={handleCompare}
          disabled={loading || selected.size < 2}
          className="inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <GitCompare size={14} />
          )}
          {loading ? "Comparing..." : "Compare"}
        </button>
      </div>

      {/* Scenario Selection */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <p className="mb-3 text-xs text-bm-muted2">
          Select two or more scenarios to compare. The first scenario is used as the base reference.
        </p>
        <div className="space-y-1">
          {scenarios.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-bm-surface/20 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggleScenario(s.id)}
                className="rounded border-bm-border/70"
              />
              <span className="text-bm-text">{s.name}</span>
              {s.is_base && (
                <span className="rounded-full border border-bm-accent/30 bg-bm-accent/10 px-1.5 py-0.5 text-[10px] text-bm-accent">
                  Base
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Comparison Results */}
      {result?.comparison && result.comparison.length > 0 && (
        <div className="space-y-4">
          {result.comparison.map((comp, idx) => (
            <div key={idx} className="space-y-4">
              {/* Return Metrics Delta Table */}
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                <h4 className="mb-3 text-sm font-medium text-bm-text">
                  {comp.base_scenario}{" "}
                  <span className="text-bm-muted2">vs</span>{" "}
                  {comp.compare_scenario}
                </h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bm-border/30 text-left text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 text-right font-medium">Base</th>
                      <th className="px-3 py-2 text-right font-medium">Compare</th>
                      <th className="px-3 py-2 text-right font-medium">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(comp.metric_deltas).map(([key, v]) => {
                      const meta = METRIC_LABELS[key];
                      if (!meta) return null;
                      return (
                        <tr key={key} className="border-b border-bm-border/20">
                          <td className="px-3 py-2.5 text-bm-text">{meta.label}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-bm-muted2">
                            {formatMetric(v.base, meta.format)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-bm-muted2">
                            {formatMetric(v.compare, meta.format)}
                          </td>
                          <td
                            className={`px-3 py-2.5 text-right tabular-nums font-medium ${
                              v.delta > 0
                                ? "text-emerald-400"
                                : v.delta < 0
                                  ? "text-red-400"
                                  : "text-bm-muted2"
                            }`}
                          >
                            {formatDelta(v.delta, meta.format)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* By-Asset Attribution */}
              {comp.asset_attribution && comp.asset_attribution.length > 0 && (
                <>
                  <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                    <h4 className="mb-3 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                      By-Asset Attribution
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-bm-border/30 text-left text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
                            <th className="px-3 py-2 font-medium">Asset</th>
                            <th className="px-3 py-2 text-right font-medium">Base NOI</th>
                            <th className="px-3 py-2 text-right font-medium">Compare NOI</th>
                            <th className="px-3 py-2 text-right font-medium">NOI Delta</th>
                            <th className="px-3 py-2 text-right font-medium">Base Equity CF</th>
                            <th className="px-3 py-2 text-right font-medium">Compare Equity CF</th>
                            <th className="px-3 py-2 text-right font-medium">Equity Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comp.asset_attribution.map((aa) => (
                            <tr key={aa.asset_id} className="border-b border-bm-border/20">
                              <td className="px-3 py-2 text-bm-text font-mono text-xs">
                                {aa.asset_id.slice(0, 8)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-bm-muted2">
                                {formatCurrency(aa.base_noi)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-bm-muted2">
                                {formatCurrency(aa.compare_noi)}
                              </td>
                              <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                                aa.noi_delta > 0 ? "text-emerald-400" : aa.noi_delta < 0 ? "text-red-400" : "text-bm-muted2"
                              }`}>
                                {aa.noi_delta >= 0 ? "+" : ""}{formatCurrency(aa.noi_delta)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-bm-muted2">
                                {formatCurrency(aa.base_equity_cf)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-bm-muted2">
                                {formatCurrency(aa.compare_equity_cf)}
                              </td>
                              <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                                aa.equity_cf_delta > 0 ? "text-emerald-400" : aa.equity_cf_delta < 0 ? "text-red-400" : "text-bm-muted2"
                              }`}>
                                {aa.equity_cf_delta >= 0 ? "+" : ""}{formatCurrency(aa.equity_cf_delta)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Attribution Bar Chart */}
                  <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
                    <h4 className="mb-2 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                      NOI Delta by Asset
                    </h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={comp.asset_attribution.map((aa) => ({
                          asset: aa.asset_id.slice(0, 8),
                          noi_delta: Math.round(aa.noi_delta),
                          equity_delta: Math.round(aa.equity_cf_delta),
                        }))}
                        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="asset" tick={{ fontSize: 9, fill: "#888" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => formatCurrency(v)} width={55} />
                        <Tooltip
                          contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                          formatter={(value: number) => formatCurrency(value)}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="noi_delta" fill="#10b981" name="NOI Delta" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="equity_delta" fill="#8b5cf6" name="Equity CF Delta" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {result && !result.comparison && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center">
          <p className="text-sm text-bm-muted2">
            Not enough completed runs to compare. Run both scenarios first.
          </p>
        </div>
      )}
    </div>
  );
}
