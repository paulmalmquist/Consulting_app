"use client";

import { Play, Activity } from "lucide-react";
import type { ReModel, ReModelScope, ReModelOverride } from "./types";
import { KpiStrip } from "@/components/repe/asset-cockpit/KpiStrip";

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
      <KpiStrip
        kpis={[
          { label: "Strategy", value: model.strategy_type || "equity" },
          { label: "In Scope", value: `${scope.filter(s => s.scope_type === "asset").length} assets` },
          { label: "Overrides", value: overrides.length },
          { label: "Created", value: new Date(model.created_at).toLocaleDateString() },
        ]}
      />

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
