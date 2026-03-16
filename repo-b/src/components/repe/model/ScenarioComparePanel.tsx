"use client";

import { useState, useCallback } from "react";
import { GitCompare, Loader2 } from "lucide-react";
import { compareScenarios } from "@/lib/bos-api";
import type { ModelScenario } from "@/lib/bos-api";

interface ScenarioComparePanelProps {
  modelId: string;
  scenarios: ModelScenario[];
}

interface ComparisonResult {
  scenarios: Array<{
    scenario_id: string;
    scenario_name: string;
    run_id: string;
    summary: Record<string, unknown>;
  }>;
  comparison: Array<{
    base_scenario: string;
    compare_scenario: string;
    variance: Record<
      string,
      { base: number; compare: number; delta: number; delta_pct: number }
    >;
  }> | null;
}

const METRIC_LABELS: Record<string, string> = {
  total_noi_cash: "Total NOI (Cash)",
  total_noi_gaap: "Total NOI (GAAP)",
  total_revenue: "Total Revenue",
  total_expense: "Total Expense",
};

function formatCurrency(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

function formatDelta(val: number): string {
  const sign = val >= 0 ? "+" : "";
  return `${sign}${formatCurrency(val)}`;
}

export function ScenarioComparePanel({
  modelId,
  scenarios,
}: ScenarioComparePanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ComparisonResult | null>(null);
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
      const res = await compareScenarios(modelId, Array.from(selected));
      setResult(res as unknown as ComparisonResult);

      if (!res || ((res as unknown as ComparisonResult).scenarios?.length || 0) < 2) {
        setError(
          "Not enough completed runs to compare. Run both scenarios first.",
        );
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
          Select two or more scenarios to compare. The first scenario (Base) is
          used as the reference.
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
            <div
              key={idx}
              className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"
            >
              <h4 className="mb-3 text-sm font-medium text-bm-text">
                {comp.base_scenario}{" "}
                <span className="text-bm-muted2">vs</span>{" "}
                {comp.compare_scenario}
              </h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/30 text-left text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                    <th className="px-3 py-2 font-medium">Metric</th>
                    <th className="px-3 py-2 text-right font-medium">Base</th>
                    <th className="px-3 py-2 text-right font-medium">Compare</th>
                    <th className="px-3 py-2 text-right font-medium">Delta</th>
                    <th className="px-3 py-2 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(comp.variance).map(([key, v]) => (
                    <tr
                      key={key}
                      className="border-b border-bm-border/20"
                    >
                      <td className="px-3 py-2.5 text-bm-text">
                        {METRIC_LABELS[key] || key}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-bm-muted2">
                        {formatCurrency(v.base)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-bm-muted2">
                        {formatCurrency(v.compare)}
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
                        {formatDelta(v.delta)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right tabular-nums ${
                          v.delta_pct > 0
                            ? "text-emerald-400"
                            : v.delta_pct < 0
                              ? "text-red-400"
                              : "text-bm-muted2"
                        }`}
                      >
                        {v.delta_pct >= 0 ? "+" : ""}
                        {v.delta_pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
