"use client";

import { useState } from "react";
import {
  OperatorDevelopmentScenarios,
  OperatorScenarioPreset,
} from "@/lib/bos-api";

type Props = {
  scenarios: OperatorDevelopmentScenarios;
  siteConfidence?: string | null;
};

function fmtIrr(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtMargin(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtDays(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v}d`;
}

function fmtCost(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function fmtDelta(v: number | null | undefined, suffix = ""): string | null {
  if (v == null) return null;
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}${suffix}`;
}

function fmtCostDelta(v: number | null | undefined): string | null {
  if (v == null) return null;
  const sign = v >= 0 ? "+" : "";
  if (Math.abs(v) >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${sign}$${(v / 1_000).toFixed(0)}K`;
  return `${sign}$${v}`;
}

const PRESET_TONE: Record<string, string> = {
  conservative: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  base: "border-bm-border/60 bg-white/5 text-bm-text",
  aggressive: "border-green-500/40 bg-green-500/10 text-green-400",
};

const ACTIVE_TONE: Record<string, string> = {
  conservative: "bg-amber-500/20 text-amber-300 border-amber-500/50",
  base: "bg-white/10 text-bm-text border-white/20",
  aggressive: "bg-green-500/20 text-green-300 border-green-500/50",
};

export default function ScenarioPanel({ scenarios, siteConfidence }: Props) {
  const [activePresetId, setActivePresetId] = useState<string>("base");
  const [showOrdinanceAdjusted, setShowOrdinanceAdjusted] = useState(false);

  const preset = scenarios.presets.find((p) => p.id === activePresetId) ?? scenarios.presets[0];
  if (!preset) return null;

  const ordinance = scenarios.active_ordinance_impact;
  const delta = ordinance?.delta_vs_base;

  const adjustedIrr =
    showOrdinanceAdjusted && delta?.irr_pct != null && preset.outputs.irr_pct != null
      ? preset.outputs.irr_pct + delta.irr_pct
      : preset.outputs.irr_pct;

  const adjustedMargin =
    showOrdinanceAdjusted && delta?.profit_margin_pct != null && preset.outputs.profit_margin_pct != null
      ? preset.outputs.profit_margin_pct + delta.profit_margin_pct
      : preset.outputs.profit_margin_pct;

  const adjustedTimeline =
    showOrdinanceAdjusted && delta?.timeline_days != null && preset.outputs.timeline_days != null
      ? preset.outputs.timeline_days + delta.timeline_days
      : preset.outputs.timeline_days;

  const adjustedCost =
    showOrdinanceAdjusted && delta?.total_dev_cost_usd != null && preset.outputs.total_dev_cost_usd != null
      ? preset.outputs.total_dev_cost_usd + delta.total_dev_cost_usd
      : preset.outputs.total_dev_cost_usd;

  return (
    <div className="space-y-4">
      {/* Preset toggle */}
      <div className="flex flex-wrap gap-2">
        {scenarios.presets.map((p: OperatorScenarioPreset) => (
          <button
            key={p.id}
            type="button"
            data-testid={`scenario-tab-${p.id}`}
            onClick={() => {
              setActivePresetId(p.id);
              setShowOrdinanceAdjusted(false);
            }}
            className={`rounded-full border px-3 py-1 text-[13px] transition ${
              activePresetId === p.id
                ? ACTIVE_TONE[p.id] ?? ACTIVE_TONE.base
                : "border-bm-border/50 bg-white/5 text-bm-muted2 hover:bg-white/10"
            }`}
          >
            {p.label}
          </button>
        ))}
        {ordinance && (
          <button
            type="button"
            data-testid="scenario-tab-ordinance-adjusted"
            onClick={() => setShowOrdinanceAdjusted((prev) => !prev)}
            className={`rounded-full border px-3 py-1 text-[13px] transition ${
              showOrdinanceAdjusted
                ? "border-red-500/50 bg-red-500/15 text-red-400"
                : "border-bm-border/50 bg-white/5 text-bm-muted2 hover:bg-white/10"
            }`}
          >
            {showOrdinanceAdjusted ? "Ordinance-adjusted ✓" : "+ Ordinance impact"}
          </button>
        )}
      </div>

      {/* Ordinance impact callout */}
      {ordinance && showOrdinanceAdjusted && (
        <div
          data-testid="ordinance-impact-callout"
          className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-400">
            Active Ordinance Adjustment
          </p>
          <p className="mt-1 text-sm text-bm-text">{ordinance.description}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-bm-muted2">
            {delta?.approval_delay_days != null && (
              <span>+{delta.approval_delay_days}d approval delay</span>
            )}
            {delta?.total_dev_cost_usd != null && (
              <span>{fmtCostDelta(delta.total_dev_cost_usd)} cost</span>
            )}
            {delta?.confidence && (
              <span className="uppercase tracking-[0.12em]">{delta.confidence} conf</span>
            )}
          </div>
        </div>
      )}

      {/* KPI tiles */}
      <div
        className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-2xl border p-3 ${
          showOrdinanceAdjusted
            ? "border-red-500/25 bg-red-500/5"
            : PRESET_TONE[activePresetId] ?? "border-bm-border/60 bg-black/25"
        }`}
      >
        <ScenarioKpi
          label="IRR"
          value={fmtIrr(adjustedIrr)}
          delta={
            showOrdinanceAdjusted && delta?.irr_pct != null
              ? fmtDelta(delta.irr_pct, "%")
              : undefined
          }
          deltaNegative={(delta?.irr_pct ?? 0) < 0}
        />
        <ScenarioKpi
          label="Profit margin"
          value={fmtMargin(adjustedMargin)}
          delta={
            showOrdinanceAdjusted && delta?.profit_margin_pct != null
              ? fmtDelta(delta.profit_margin_pct, "%")
              : undefined
          }
          deltaNegative={(delta?.profit_margin_pct ?? 0) < 0}
        />
        <ScenarioKpi
          label="Timeline"
          value={fmtDays(adjustedTimeline)}
          delta={
            showOrdinanceAdjusted && delta?.timeline_days != null
              ? fmtDelta(delta.timeline_days, "d")
              : undefined
          }
          deltaNegative={(delta?.timeline_days ?? 0) > 0}
        />
        <ScenarioKpi
          label="Total dev cost"
          value={fmtCost(adjustedCost)}
          delta={
            showOrdinanceAdjusted && delta?.total_dev_cost_usd != null
              ? fmtCostDelta(delta.total_dev_cost_usd)
              : undefined
          }
          deltaNegative={(delta?.total_dev_cost_usd ?? 0) > 0}
        />
      </div>

      {/* Assumptions row */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-bm-muted2">
        {preset.assumptions.density_units != null && (
          <span>Density: {preset.assumptions.density_units.toLocaleString()} units</span>
        )}
        {preset.assumptions.approval_delay_days != null && (
          <span>Approval delay: {preset.assumptions.approval_delay_days}d</span>
        )}
        {preset.assumptions.cost_inflation_pct != null && (
          <span>Cost inflation: {preset.assumptions.cost_inflation_pct}%</span>
        )}
        {siteConfidence && (
          <span className="uppercase tracking-[0.12em]">{siteConfidence} confidence</span>
        )}
      </div>
    </div>
  );
}

function ScenarioKpi({
  label,
  value,
  delta,
  deltaNegative,
}: {
  label: string;
  value: string;
  delta?: string | null;
  deltaNegative?: boolean;
}) {
  return (
    <div className="rounded-xl bg-black/20 p-2.5">
      <p className="text-[11px] uppercase tracking-[0.14em] text-bm-muted2">{label}</p>
      <p className="mt-1 text-lg font-semibold text-bm-text" data-testid={`scenario-kpi-${label.replace(/\s+/g, "-").toLowerCase()}`}>
        {value}
      </p>
      {delta != null && (
        <p
          data-testid={`scenario-delta-${label.replace(/\s+/g, "-").toLowerCase()}`}
          className={`mt-0.5 text-xs font-medium ${deltaNegative ? "text-red-400" : "text-green-400"}`}
        >
          Ordinance: {delta}
        </p>
      )}
    </div>
  );
}
