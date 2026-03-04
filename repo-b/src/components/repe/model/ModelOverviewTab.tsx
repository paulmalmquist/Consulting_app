"use client";

import { Play, Activity } from "lucide-react";
import type { ReModel, ReModelScope, ReModelOverride } from "./types";

export function ModelOverviewTab({
  model,
  scope,
  overrides,
  onRunModel,
  onRunMonteCarlo,
  mcRunning,
}: {
  model: ReModel;
  scope: ReModelScope[];
  overrides: ReModelOverride[];
  onRunModel: () => void;
  onRunMonteCarlo: () => void;
  mcRunning: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
          <p className="text-xs text-bm-muted2 uppercase tracking-wider">Strategy</p>
          <p className="text-lg font-semibold mt-1">{model.strategy_type || "equity"}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
          <p className="text-xs text-bm-muted2 uppercase tracking-wider">In Scope</p>
          <p className="text-lg font-semibold mt-1">{scope.filter(s => s.scope_type === "asset").length} assets</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
          <p className="text-xs text-bm-muted2 uppercase tracking-wider">Overrides</p>
          <p className="text-lg font-semibold mt-1">{overrides.length}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
          <p className="text-xs text-bm-muted2 uppercase tracking-wider">Created</p>
          <p className="text-lg font-semibold mt-1">{new Date(model.created_at).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onRunModel}
          disabled={scope.length === 0}
          aria-disabled={scope.length === 0}
          title={scope.length === 0 ? "Add at least one asset before running" : "Run the model against all scoped assets"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="run-model-btn"
        >
          <Play size={14} /> Run Model
        </button>
        <button
          type="button"
          onClick={onRunMonteCarlo}
          disabled={scope.length === 0 || mcRunning}
          aria-disabled={scope.length === 0 || mcRunning}
          title={scope.length === 0 ? "Add assets to scope before running Monte Carlo" : "Run Monte Carlo risk simulation"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="run-mc-btn"
        >
          <Activity size={14} /> {mcRunning ? "Running..." : "Run Monte Carlo"}
        </button>
      </div>
    </div>
  );
}
