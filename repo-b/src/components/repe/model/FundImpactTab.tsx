"use client";

import { useState, useEffect } from "react";
import { BarChart3, Play } from "lucide-react";
import { apiFetch } from "./types";

interface RunResult {
  fund_id: string;
  metric: string;
  base_value: number;
  model_value: number;
  variance: number;
}

interface ModelRun {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  results: RunResult[];
}

function fmtMetric(v: number | null, metric: string): string {
  if (v == null) return "—";
  if (metric === "irr" || metric === "gross_irr") return `${(v * 100).toFixed(2)}%`;
  if (metric === "tvpi" || metric === "moic" || metric === "dpi") return `${v.toFixed(2)}x`;
  return v.toFixed(2);
}

export function FundImpactTab({
  modelId,
  scopeCount,
  onRunModel,
}: {
  modelId: string;
  scopeCount: number;
  onRunModel: () => void;
}) {
  const [latestRun, setLatestRun] = useState<ModelRun | null>(null);
  const [polling, setPolling] = useState(false);
  const [runTriggered, setRunTriggered] = useState(false);

  const handleRun = () => {
    setRunTriggered(true);
    setPolling(true);
    onRunModel();
    // Start polling for results after trigger
    setTimeout(() => {
      apiFetch<ModelRun>(`/api/re/v2/models/${modelId}/runs/latest`)
        .then((run) => {
          setLatestRun(run);
          if (run.status !== "in_progress") {
            setPolling(false);
            setRunTriggered(false);
          }
        })
        .catch(() => {
          setPolling(false);
          setRunTriggered(false);
        });
    }, 1000);
  };

  // Fetch latest run on mount
  useEffect(() => {
    apiFetch<ModelRun>(`/api/re/v2/models/${modelId}/runs/latest`)
      .then(setLatestRun)
      .catch(() => {});
  }, [modelId]);

  // Poll while in_progress
  useEffect(() => {
    if (!latestRun || latestRun.status !== "in_progress") {
      if (!runTriggered) setPolling(false);
      return;
    }
    setPolling(true);
    const interval = setInterval(() => {
      apiFetch<ModelRun>(`/api/re/v2/models/${modelId}/runs/latest`)
        .then((run) => {
          setLatestRun(run);
          if (run.status !== "in_progress") {
            setPolling(false);
            setRunTriggered(false);
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [latestRun?.status, modelId, runTriggered]);

  const hasResults = latestRun?.results && latestRun.results.length > 0;

  if (!hasResults) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center">
        <BarChart3 size={32} className="mx-auto text-bm-muted2 mb-3" />
        <h3 className="text-lg font-semibold">Fund Impact</h3>
        <p className="text-sm text-bm-muted2 mt-1">
          {polling
            ? "Model is running... Results will appear here when complete."
            : "Run the model to see side-by-side comparison of Base vs Model results."}
        </p>
        <button
          onClick={handleRun}
          disabled={scopeCount === 0 || polling}
          aria-disabled={scopeCount === 0 || polling}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="run-model-impact-btn"
        >
          <Play size={14} /> {polling ? "Running..." : "Run Model"}
        </button>
      </div>
    );
  }

  // Group results by metric
  const metrics = ["irr", "gross_irr", "tvpi", "moic", "dpi"];
  const resultsByMetric = metrics
    .map((m) => latestRun!.results.find((r) => r.metric === m))
    .filter(Boolean) as RunResult[];

  return (
    <div className="space-y-4">
      {/* Headline KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {resultsByMetric.slice(0, 4).map((r) => (
          <div key={r.metric} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
            <p className="text-xs text-bm-muted2 uppercase tracking-wider">{r.metric.replace("_", " ")}</p>
            <p className="text-lg font-semibold mt-1">{fmtMetric(r.model_value, r.metric)}</p>
            <p className={`text-xs mt-0.5 ${r.variance >= 0 ? "text-green-400" : "text-red-400"}`}>
              {r.variance >= 0 ? "+" : ""}{fmtMetric(r.variance, r.metric)} vs base
            </p>
          </div>
        ))}
      </div>

      {/* Results table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">Metric</th>
              <th className="px-4 py-2 text-right font-medium">Base</th>
              <th className="px-4 py-2 text-right font-medium">Model</th>
              <th className="px-4 py-2 text-right font-medium">Delta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {latestRun!.results.map((r) => (
              <tr key={`${r.fund_id}-${r.metric}`} className="hover:bg-bm-surface/20">
                <td className="px-4 py-2 font-medium">{r.metric.replace("_", " ").toUpperCase()}</td>
                <td className="px-4 py-2 text-right">{fmtMetric(r.base_value, r.metric)}</td>
                <td className="px-4 py-2 text-right">{fmtMetric(r.model_value, r.metric)}</td>
                <td className={`px-4 py-2 text-right ${r.variance >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {r.variance >= 0 ? "+" : ""}{fmtMetric(r.variance, r.metric)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleRun}
          disabled={scopeCount === 0 || polling}
          className="inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play size={14} /> {polling ? "Running..." : "Re-Run Model"}
        </button>
        {latestRun!.completed_at && (
          <p className="text-xs text-bm-muted2 self-center">
            Last run: {new Date(latestRun!.completed_at).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
