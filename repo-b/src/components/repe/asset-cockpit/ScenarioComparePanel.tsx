"use client";

import { useEffect, useState } from "react";
import {
  listReV2Scenarios,
  type ReV2Scenario,
  type ReV2AssetPeriod,
  getReV2AssetPeriods,
} from "@/lib/bos-api";
import { TrendLineChart } from "@/components/charts";
import { CHART_COLORS, fmtCompact, fmtPct } from "@/components/charts/chart-theme";

type MetricKey = "noi" | "revenue" | "occupancy" | "asset_value";

const METRIC_OPTIONS: { key: MetricKey; label: string; format: "dollar" | "percent" }[] = [
  { key: "noi", label: "NOI", format: "dollar" },
  { key: "revenue", label: "Revenue", format: "dollar" },
  { key: "occupancy", label: "Occupancy", format: "percent" },
  { key: "asset_value", label: "Asset Value", format: "dollar" },
];

interface Props {
  assetId: string;
  quarter: string;
  fundId: string;
}

export default function ScenarioComparePanel({
  assetId,
  quarter,
  fundId,
}: Props) {
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [metric, setMetric] = useState<MetricKey>("noi");
  const [basePeriods, setBasePeriods] = useState<ReV2AssetPeriod[]>([]);
  const [loading, setLoading] = useState(false);

  // Load available scenarios
  useEffect(() => {
    listReV2Scenarios(fundId).then(setScenarios).catch(() => {});
  }, [fundId]);

  // Load base periods
  useEffect(() => {
    getReV2AssetPeriods(assetId).then(setBasePeriods).catch(() => {});
  }, [assetId]);

  const toggleScenario = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  };

  // Derive stress multipliers from scenario name/type
  function scenarioMultiplier(s: ReV2Scenario, metricKey: MetricKey): number {
    const name = s.name.toLowerCase();
    const isDownside = s.scenario_type === "downside" || name.includes("downside");
    const isUpside = s.scenario_type === "upside" || name.includes("upside");

    // Parse cap rate BPS from name like "Downside Cap Rate +75bps"
    const bpsMatch = name.match(/[+-]?\d+\s*bps/);
    const bps = bpsMatch ? parseInt(bpsMatch[0]) : 0;

    // Parse growth % from name like "Upside NOI Growth +10%"
    const pctMatch = name.match(/[+-]?\d+%/);
    const pct = pctMatch ? parseInt(pctMatch[0]) / 100 : 0;

    if (metricKey === "asset_value" && bps !== 0) {
      // Cap rate change: higher cap = lower value. +75bps ≈ -10% value
      return 1 / (1 + bps / 10000 / 0.065); // relative to ~6.5% base cap
    }
    if ((metricKey === "noi" || metricKey === "revenue") && pct !== 0) {
      return 1 + pct;
    }
    // Generic stress: downside = -8%, upside = +8%, sale scenarios = -3%
    if (isDownside) return 0.92;
    if (isUpside) return 1.08;
    if (name.includes("sale")) return 0.97;
    return 1.0;
  }

  // Build chart data with base + selected scenarios
  const selectedScenarios = scenarios.filter((s) => selectedIds.has(s.scenario_id));

  const chartData = basePeriods.map((p) => {
    const row: Record<string, unknown> = { quarter: p.quarter };
    const baseVal = Number(p[metric] ?? 0);
    row["Base"] = baseVal;
    for (const s of selectedScenarios) {
      row[s.name] = Math.round(baseVal * scenarioMultiplier(s, metric));
    }
    return row;
  });

  const lines = [
    { key: "Base", label: "Base", color: CHART_COLORS.scenario[0] },
    ...selectedScenarios.map((s, i) => ({
      key: s.name,
      label: s.name,
      color: CHART_COLORS.scenario[(i + 1) % CHART_COLORS.scenario.length],
    })),
  ];

  // Determine format for selected metric
  const metricDef = METRIC_OPTIONS.find((m) => m.key === metric)!;

  if (scenarios.length === 0 && basePeriods.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"
      data-testid="scenario-compare-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">
          Scenario Compare
        </h3>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as MetricKey)}
          className="rounded-lg border border-bm-border bg-bm-surface px-3 py-1.5 text-sm"
        >
          {METRIC_OPTIONS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Scenario Checkboxes */}
      {scenarios.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {scenarios.map((s, i) => (
            <label
              key={s.scenario_id}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs cursor-pointer transition ${
                selectedIds.has(s.scenario_id)
                  ? "border-bm-accent/60 bg-bm-accent/10"
                  : "border-bm-border/70 hover:bg-bm-surface/40"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(s.scenario_id)}
                onChange={() => toggleScenario(s.scenario_id)}
                className="sr-only"
              />
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor:
                    CHART_COLORS.scenario[(i + 1) % CHART_COLORS.scenario.length],
                }}
              />
              {s.name}
            </label>
          ))}
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 ? (
        <TrendLineChart
          data={chartData}
          lines={lines}
          format={metricDef.format}
          height={280}
        />
      ) : (
        <p className="text-sm text-bm-muted2">
          No period data available for comparison.
        </p>
      )}

      {selectedIds.size > 0 && basePeriods.length > 0 && (
        <p className="mt-3 text-xs text-bm-muted2">
          Projections derived from scenario assumptions applied to base period data.
        </p>
      )}
    </div>
  );
}
