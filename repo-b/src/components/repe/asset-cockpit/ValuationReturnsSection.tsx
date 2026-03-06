"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
} from "@/lib/bos-api";
import { TrendLineChart, SensitivityBarChart } from "@/components/charts";
import type { SensitivityRow } from "@/components/charts/SensitivityBarChart";
import { CHART_COLORS } from "@/components/charts/chart-theme";
import { SensitivityHeatMap } from "@/components/charts/SensitivityHeatMap";
import type { HeatMapCell } from "@/components/charts/SensitivityHeatMap";
import ScenarioComparePanel from "./ScenarioComparePanel";

function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n) || !n) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const VALUATION_METHOD_LABELS: Record<string, string> = {
  cap_rate: "Direct Cap",
  dcf: "Discounted Cash Flow",
  sales_comp: "Sales Comparable",
  cost: "Cost Approach",
};

function fmtText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const s = String(v);
  return VALUATION_METHOD_LABELS[s] ?? s;
}

interface Props {
  assetId: string;
  quarter: string;
  financialState: ReV2AssetQuarterState | null;
  periods: ReV2AssetPeriod[];
  fundId: string;
}

export default function ValuationReturnsSection({
  assetId,
  quarter,
  financialState,
  periods,
  fundId,
}: Props) {
  // --- 2-D Sensitivity Heat Map state ---
  const [heatMapCells, setHeatMapCells] = useState<HeatMapCell[]>([]);
  const [heatMapRows, setHeatMapRows] = useState<number[]>([]);
  const [heatMapCols, setHeatMapCols] = useState<number[]>([]);
  const [heatMapLoading, setHeatMapLoading] = useState(false);

  const fetchHeatMap = useCallback(async () => {
    if (!financialState) return;
    setHeatMapLoading(true);
    try {
      const res = await fetch(`/api/re/v2/assets/${assetId}/valuation/sensitivity-matrix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          row_variable: "cap_rate",
          col_variable: "exit_cap_rate",
          row_min: -0.015,
          row_max: 0.015,
          row_step: 0.005,
          col_min: -0.015,
          col_max: 0.015,
          col_step: 0.005,
          quarter,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.cells) {
          setHeatMapCells(data.cells);
          setHeatMapRows(data.row_values);
          setHeatMapCols(data.col_values);
        }
      }
    } catch {
      // Silently fail — heat map is supplementary
    } finally {
      setHeatMapLoading(false);
    }
  }, [assetId, quarter, financialState]);

  useEffect(() => {
    fetchHeatMap();
  }, [fetchHeatMap]);

  // Value trend data
  const valueTrendData = periods.map((p) => ({
    quarter: p.quarter,
    value: Number(p.asset_value ?? 0),
    nav: Number(p.nav ?? 0) || (Number(p.asset_value ?? 0) - Number(p.debt_balance ?? 0)),
  }));

  // Build sensitivity data from current cap rate
  const currentNoi = financialState?.noi ? Number(financialState.noi) * 4 : 0; // annualized
  const currentCapRate =
    financialState?.asset_value && financialState?.noi
      ? (Number(financialState.noi) * 4) / Number(financialState.asset_value)
      : 0.05;

  const sensitivityData: SensitivityRow[] = [];
  if (currentNoi > 0) {
    const bpsSteps = [-100, -50, -25, 0, 25, 50, 100];
    for (const bps of bpsSteps) {
      const rate = currentCapRate + bps / 10000;
      if (rate <= 0) continue;
      const val = currentNoi / rate;
      sensitivityData.push({
        label: bps === 0 ? `${(rate * 100).toFixed(2)}% (current)` : `${bps > 0 ? "+" : ""}${bps} bps`,
        value: val,
        isBaseline: bps === 0,
      });
    }
  }

  return (
    <div className="space-y-4" data-testid="asset-valuation-section">
      {/* Current Snapshot */}
      {financialState && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2 mb-3">
            Current Snapshot · {financialState.quarter}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <dt className="text-xs text-bm-muted2">Gross Value</dt>
              <dd className="font-medium">{fmtMoney(financialState.asset_value)}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">NAV</dt>
              <dd className="font-medium">{fmtMoney(financialState.nav)}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">Method</dt>
              <dd className="font-medium">{fmtText(financialState.valuation_method)}</dd>
            </div>
            <div>
              <dt className="text-xs text-bm-muted2">NOI</dt>
              <dd className="font-medium">{fmtMoney(financialState.noi)}</dd>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Value + NAV Trend */}
        {valueTrendData.length > 0 && (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
              Value & NAV Trend
            </h3>
            <TrendLineChart
              data={valueTrendData}
              lines={[
                { key: "value", label: "Asset Value", color: CHART_COLORS.revenue },
                { key: "nav", label: "NAV", color: CHART_COLORS.noi },
              ]}
              format="dollar"
              height={260}
            />
          </div>
        )}

        {/* Cap Rate Sensitivity */}
        {sensitivityData.length > 0 && (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
              Cap Rate Sensitivity
            </h3>
            <SensitivityBarChart data={sensitivityData} height={260} />
          </div>
        )}
      </div>

      {/* 2-D Sensitivity Heat Map (Cap Rate × Exit Cap Rate → IRR) */}
      {heatMapCells.length > 0 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
            Sensitivity Matrix · Cap Rate × Exit Cap Rate → IRR
          </h3>
          <SensitivityHeatMap
            cells={heatMapCells}
            rowValues={heatMapRows}
            colValues={heatMapCols}
            rowLabel="Cap Rate"
            colLabel="Exit Cap Rate"
            valueLabel="IRR"
            baseRowValue={currentCapRate}
            baseColValue={currentCapRate}
          />
        </div>
      )}
      {heatMapLoading && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-center text-xs text-bm-muted2">
          Computing sensitivity matrix…
        </div>
      )}

      {/* Scenario Compare */}
      <ScenarioComparePanel
        assetId={assetId}
        quarter={quarter}
        fundId={fundId}
      />
    </div>
  );
}
