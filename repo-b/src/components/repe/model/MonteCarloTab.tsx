"use client";

import { useState } from "react";
import { Activity, Play } from "lucide-react";

export function MonteCarloTab({
  modelId,
  scopeCount,
  onError,
}: {
  modelId: string;
  scopeCount: number;
  onError: (msg: string) => void;
}) {
  const [mcSims, setMcSims] = useState(1000);
  const [mcSeed, setMcSeed] = useState(42);
  const [mcRunning, setMcRunning] = useState(false);
  const [mcResult, setMcResult] = useState<Record<string, unknown> | null>(null);

  const handleRunMonteCarlo = async () => {
    if (scopeCount === 0) {
      onError("Cannot run Monte Carlo: Add at least one asset to scope first.");
      return;
    }
    try {
      setMcRunning(true);
      const res = await fetch(`/api/re/v2/models/${modelId}/monte-carlo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulations: mcSims, seed: mcSeed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        onError(data.error || "Monte Carlo simulation failed");
        return;
      }
      const result = await res.json();
      setMcResult(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Monte Carlo simulation failed");
    } finally {
      setMcRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center">
      <Activity size={32} className="mx-auto text-bm-muted2 mb-3" />
      <h3 className="text-lg font-semibold">Monte Carlo Risk Analysis</h3>
      <p className="text-sm text-bm-muted2 mt-1">
        Run a Monte Carlo simulation to generate risk distributions and key percentiles.
      </p>
      <div className="mt-4 flex items-center justify-center gap-3">
        <label className="text-xs text-bm-muted2">
          Simulations
          <input
            type="number"
            value={mcSims}
            onChange={(e) => setMcSims(parseInt(e.target.value) || 1000)}
            min={100}
            max={10000}
            className="ml-2 w-24 rounded-lg border border-bm-border bg-bm-surface px-2 py-1 text-sm"
            data-testid="mc-sims-input"
          />
        </label>
        <label className="text-xs text-bm-muted2">
          Seed
          <input
            type="number"
            value={mcSeed}
            onChange={(e) => setMcSeed(parseInt(e.target.value) || 42)}
            className="ml-2 w-20 rounded-lg border border-bm-border bg-bm-surface px-2 py-1 text-sm"
            data-testid="mc-seed-input"
          />
        </label>
        <button
          type="button"
          onClick={handleRunMonteCarlo}
          disabled={scopeCount === 0 || mcRunning}
          aria-disabled={scopeCount === 0 || mcRunning}
          title={scopeCount === 0 ? "Add assets to scope before running" : "Run Monte Carlo risk simulation"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="run-mc-btn"
        >
          <Play size={14} /> {mcRunning ? "Running..." : "Run Monte Carlo"}
        </button>
      </div>
      {mcResult && (
        <div className="mt-4 rounded-xl border border-bm-border/70 bg-bm-surface/30 p-4 text-left">
          <h4 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-2">Simulation Results</h4>
          <pre className="text-xs text-bm-text overflow-x-auto">{JSON.stringify(mcResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
