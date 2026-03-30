"use client";

import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { fmtMoney, fmtPct, fmtMultiple } from "@/lib/format-utils";
import type { ResumeModeling } from "@/lib/bos-api";
import WaterfallChart from "@/components/charts/WaterfallChart";
import TrendLineChart from "@/components/charts/TrendLineChart";
import { SensitivityHeatMap, type HeatMapCell } from "@/components/charts/SensitivityHeatMap";
import ResumeFallbackCard from "./ResumeFallbackCard";
import CapitalEventTimeline from "./CapitalEventTimeline";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";
import { computeIrr, type ResumeScenarioOutputs } from "./modelingMath";
import { buildEventTimeline, buildEquityPositionSeries } from "./modelingEvents";

function Slider({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rounded-2xl border border-bm-border/35 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-bm-text">{label}</span>
        <span className="text-sm text-bm-muted">{display}</span>
      </div>
      <input
        className="mt-3 w-full accent-sky-400"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function buildSensitivityMatrix(
  inputs: Parameters<typeof computeIrr>[0] extends number[] ? never : never,
  baseInputs: { purchase_price: number; hold_period: number; debt_pct: number; exit_cap_rate: number; noi_growth_pct: number },
  assumptions: Record<string, string | number>,
): { cells: HeatMapCell[]; rowValues: number[]; colValues: number[] } {
  const rowValues = [-0.010, -0.005, 0, 0.005, 0.010, 0.015, 0.020].map(
    (delta) => baseInputs.exit_cap_rate + delta,
  );
  const colValues = [-0.015, -0.010, -0.005, 0, 0.005, 0.010, 0.015].map(
    (delta) => baseInputs.noi_growth_pct + delta,
  );

  const entryCap = Number(assumptions.entry_cap_rate ?? 0.059);
  const debtRate = Number(assumptions.debt_rate ?? 0.062);
  const exitCostPct = Number(assumptions.exit_cost_pct ?? 0.018);

  const cells: HeatMapCell[] = [];
  for (const exitCap of rowValues) {
    for (const noiGrowth of colValues) {
      const equity = baseInputs.purchase_price * (1 - baseInputs.debt_pct);
      const debt = baseInputs.purchase_price * baseInputs.debt_pct;
      const initialNoi = baseInputs.purchase_price * entryCap;
      const ds = debt * debtRate;
      const cfs = [-equity];

      for (let yr = 1; yr <= baseInputs.hold_period; yr += 1) {
        const noi = initialNoi * Math.pow(1 + noiGrowth, yr - 1);
        const termNoi = initialNoi * Math.pow(1 + noiGrowth, yr);
        const tv = yr === baseInputs.hold_period ? termNoi / Math.max(exitCap, 0.0001) : 0;
        const nsp = yr === baseInputs.hold_period ? tv * (1 - exitCostPct) - debt : 0;
        cfs.push(noi - ds + nsp);
      }

      cells.push({ row_value: exitCap, col_value: noiGrowth, value: computeIrr(cfs) });
    }
  }

  return { cells, rowValues, colValues };
}

export default function ResumeModelingModule({
  modeling,
  outputs,
}: {
  modeling: ResumeModeling;
  outputs: ResumeScenarioOutputs;
}) {
  const { modelInputs, modelPresetId, setModelPreset, setModelInputs, lastModelPresetSource } = useResumeWorkspaceStore(
    useShallow((state) => ({
      modelInputs: state.modelInputs,
      modelPresetId: state.modelPresetId,
      setModelPreset: state.setModelPreset,
      setModelInputs: state.setModelInputs,
      lastModelPresetSource: state.lastModelPresetSource,
    })),
  );

  const [refiEnabled, setRefiEnabled] = useState(false);

  const equityTrend = outputs.annualCashFlows.map((row, index) => ({
    quarter: `Year ${row.year}`,
    equity: outputs.annualCashFlows
      .slice(0, index + 1)
      .reduce((sum, entry) => sum + entry.cashFlowToEquity, -outputs.equityInvested),
  }));

  const events = useMemo(
    () => buildEventTimeline(modelInputs, modeling.assumptions as Parameters<typeof buildEventTimeline>[1], outputs),
    [modelInputs, modeling.assumptions, outputs],
  );

  const equityPositionSeries = useMemo(() => buildEquityPositionSeries(outputs), [outputs]);

  const sensitivityMatrix = useMemo(
    () =>
      buildSensitivityMatrix(
        undefined as never,
        {
          purchase_price: modelInputs.purchase_price,
          hold_period: modelInputs.hold_period,
          debt_pct: modelInputs.debt_pct,
          exit_cap_rate: modelInputs.exit_cap_rate,
          noi_growth_pct: modelInputs.noi_growth_pct,
        },
        modeling.assumptions,
      ),
    [modelInputs.purchase_price, modelInputs.hold_period, modelInputs.debt_pct, modelInputs.exit_cap_rate, modelInputs.noi_growth_pct, modeling.assumptions],
  );

  const assumptionEntries = Object.entries(modeling.assumptions);

  return (
    <section className="rounded-[28px] border border-bm-border/60 bg-bm-surface/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="bm-section-label">Modeling</p>
          <h2 className="mt-2 text-2xl">System-driven waterfall simulation</h2>
          <p className="mt-2 max-w-3xl text-sm text-bm-muted">
            This module demonstrates how Paul translated spreadsheet-heavy fund logic into fast, parameter-driven software.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {modeling.presets.map((preset) => (
            <button
              key={preset.preset_id}
              type="button"
              onClick={() => setModelPreset(preset.preset_id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                modelPresetId === preset.preset_id
                  ? "bg-white/12 text-white"
                  : "bg-white/5 text-bm-muted hover:bg-white/10 hover:text-bm-text"
              }`}
            >
              {preset.label}
            </button>
          ))}
          {lastModelPresetSource === "timeline" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/25 bg-sky-400/8 px-2.5 py-1 text-[11px] text-sky-300">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              from timeline
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.25fr]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Slider
              label="Purchase Price"
              min={80000000}
              max={200000000}
              step={1000000}
              value={modelInputs.purchase_price}
              display={fmtMoney(modelInputs.purchase_price)}
              onChange={(value) => setModelInputs({ purchase_price: value })}
            />
            <Slider
              label="Exit Cap Rate"
              min={0.045}
              max={0.07}
              step={0.001}
              value={modelInputs.exit_cap_rate}
              display={fmtPct(modelInputs.exit_cap_rate)}
              onChange={(value) => setModelInputs({ exit_cap_rate: value })}
            />
            <Slider
              label="Hold Period"
              min={3}
              max={8}
              step={1}
              value={modelInputs.hold_period}
              display={`${modelInputs.hold_period} years`}
              onChange={(value) => setModelInputs({ hold_period: value, sale_year: value })}
            />
            <Slider
              label="NOI Growth"
              min={0.01}
              max={0.07}
              step={0.0025}
              value={modelInputs.noi_growth_pct}
              display={fmtPct(modelInputs.noi_growth_pct)}
              onChange={(value) => setModelInputs({ noi_growth_pct: value })}
            />
            <Slider
              label="Debt %"
              min={0.4}
              max={0.7}
              step={0.01}
              value={modelInputs.debt_pct}
              display={fmtPct(modelInputs.debt_pct)}
              onChange={(value) => setModelInputs({ debt_pct: value })}
            />
            <Slider
              label="Sale Year"
              min={1}
              max={modelInputs.hold_period}
              step={1}
              value={modelInputs.sale_year ?? modelInputs.hold_period}
              display={`Year ${modelInputs.sale_year ?? modelInputs.hold_period}`}
              onChange={(value) => setModelInputs({ sale_year: value })}
            />
          </div>

          <div className="rounded-2xl border border-bm-border/35 bg-white/5 p-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={refiEnabled}
                onChange={(e) => {
                  setRefiEnabled(e.target.checked);
                  if (!e.target.checked) {
                    setModelInputs({ refi_year: null, refi_debt_pct: modelInputs.debt_pct });
                  } else {
                    setModelInputs({ refi_year: Math.max(1, Math.floor(modelInputs.hold_period / 2)), refi_debt_pct: modelInputs.debt_pct + 0.05 });
                  }
                }}
                className="accent-sky-400"
              />
              <span className="text-sm font-medium text-bm-text">Refinance event</span>
            </label>
            {refiEnabled ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Slider
                  label="Refi Year"
                  min={1}
                  max={Math.max(1, (modelInputs.sale_year ?? modelInputs.hold_period) - 1)}
                  step={1}
                  value={modelInputs.refi_year ?? Math.floor(modelInputs.hold_period / 2)}
                  display={`Year ${modelInputs.refi_year ?? Math.floor(modelInputs.hold_period / 2)}`}
                  onChange={(value) => setModelInputs({ refi_year: value })}
                />
                <Slider
                  label="Refi Debt %"
                  min={0.4}
                  max={0.75}
                  step={0.01}
                  value={modelInputs.refi_debt_pct ?? modelInputs.debt_pct}
                  display={fmtPct(modelInputs.refi_debt_pct ?? modelInputs.debt_pct)}
                  onChange={(value) => setModelInputs({ refi_debt_pct: value })}
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "IRR", value: fmtPct(outputs.irr) },
              { label: "TVPI", value: fmtMultiple(outputs.tvpi) },
              { label: "LP Distribution", value: fmtMoney(outputs.lpDistribution) },
              { label: "GP Distribution", value: fmtMoney(outputs.gpDistribution) },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl border border-bm-border/35 bg-black/10 px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{kpi.label}</p>
                <p className="mt-2 text-xl font-semibold">{kpi.value}</p>
              </div>
            ))}
          </div>

          <CapitalEventTimeline events={events} equityPositionSeries={equityPositionSeries} />

          <div className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Assumptions behind the live model</h3>
                <p className="mt-1 text-xs text-bm-muted2">Disclosed so the viewer understands the engine, not just the output.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {assumptionEntries.length > 0 ? (
                assumptionEntries.map(([key, value]) => (
                  <div key={key} className="rounded-xl border border-bm-border/30 bg-white/5 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{key.replaceAll("_", " ")}</p>
                    <p className="mt-2 text-sm text-bm-text">
                      {typeof value === "number" && value < 1 ? fmtPct(value) : String(value)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-bm-muted2">Model assumptions are temporarily unavailable, but the live scenario controls still work.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Distribution tiers</h3>
                <p className="mt-1 text-xs text-bm-muted2">Return of capital, LP pref, catch-up, and residual split.</p>
              </div>
              <div className="rounded-full border border-bm-border/35 px-3 py-1 text-xs text-bm-muted2">
                LP / GP: {fmtPct(outputs.lpPct)} / {fmtPct(outputs.gpPct)}
              </div>
            </div>
            <div className="mt-4 h-[300px]">
              {outputs.waterfall.length > 0 ? (
                <WaterfallChart items={outputs.waterfall} height={300} />
              ) : (
                <ResumeFallbackCard
                  eyebrow="Modeling"
                  title="Visualization failed to render"
                  body="The distribution waterfall does not have a usable series right now."
                  className="h-full"
                  tone="warning"
                />
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
            <h3 className="text-sm font-semibold">Equity growth trajectory</h3>
            <p className="mt-1 text-xs text-bm-muted2">How the scenario compounds over the hold period.</p>
            <div className="mt-4 h-[260px]">
              {equityTrend.length > 0 ? (
                <TrendLineChart
                  data={equityTrend}
                  lines={[{ key: "equity", label: "Equity Value", color: "#8b5cf6" }]}
                  format="dollar"
                  height={260}
                  showLegend={false}
                />
              ) : (
                <ResumeFallbackCard
                  eyebrow="Modeling"
                  title="Visualization failed to render"
                  body="The equity trend series is unavailable for the current scenario."
                  className="h-full"
                  tone="warning"
                />
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-bm-border/35 bg-black/10 p-4">
            <h3 className="text-sm font-semibold">IRR sensitivity</h3>
            <p className="mt-1 text-xs text-bm-muted2">Exit cap rate vs NOI growth — current scenario highlighted.</p>
            <div className="mt-4">
              <SensitivityHeatMap
                cells={sensitivityMatrix.cells}
                rowValues={sensitivityMatrix.rowValues}
                colValues={sensitivityMatrix.colValues}
                rowLabel="Exit Cap Rate"
                colLabel="NOI Growth"
                valueLabel="IRR"
                baseRowValue={modelInputs.exit_cap_rate}
                baseColValue={modelInputs.noi_growth_pct}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-bm-border/35 bg-black/10">
        <div className="border-b border-bm-border/20 px-4 py-3">
          <h3 className="text-sm font-semibold">Year-by-year cash flows</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-bm-muted2">
              <tr>
                {["Year", "NOI", "Debt Service", "Cash Flow to Equity", "Terminal Value", "Net Sale Proceeds"].map((label) => (
                  <th key={label} className="px-4 py-3 text-left font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {outputs.annualCashFlows.length > 0 ? (
                outputs.annualCashFlows.map((row) => (
                  <tr key={row.year} className="border-t border-bm-border/20 text-bm-text">
                    <td className="px-4 py-3">{row.year}</td>
                    <td className="px-4 py-3">{fmtMoney(row.noi)}</td>
                    <td className="px-4 py-3">{fmtMoney(row.debtService)}</td>
                    <td className="px-4 py-3">{fmtMoney(row.cashFlowToEquity)}</td>
                    <td className="px-4 py-3">{row.terminalValue ? fmtMoney(row.terminalValue) : "—"}</td>
                    <td className="px-4 py-3">{row.netSaleProceeds ? fmtMoney(row.netSaleProceeds) : "—"}</td>
                  </tr>
                ))
              ) : (
                <tr className="border-t border-bm-border/20 text-bm-muted2">
                  <td colSpan={6} className="px-4 py-6 text-center text-sm">
                    The current scenario did not produce a year-by-year series. Adjust the assumptions or reload the module.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
